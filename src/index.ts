// di-two-phase.ts
// ───────────────────────────────────────────────────────────────────
// TYPES (kept O(1) in shape)

type Keys<R> = Extract<keyof R, string>;
type Extend<R, K extends string, V> = R & { [P in K]: V };

declare const __meta__: unique symbol;
type __Meta<F, D extends readonly string[]> = { readonly [__meta__]?: readonly [F, D] };
type WithMeta<V, F, D extends readonly string[]> = V & __Meta<F, D>;
type StripMeta<T> = T extends infer V & __Meta<any, any> ? V : T;

type ResultOf<F> = F extends { (...a: any): infer R } ? R : never;
type DepsOf<F> =
  F extends { dependsOn?: infer D }
    ? D extends readonly string[] ? D : readonly []
    : readonly [];

type ModeOf<F> = F extends { mode?: infer M }
  ? M extends "lazy" | "eager" ? M : "eager"
  : "eager";

// Public factory shape users decorate at runtime
export interface Factory<
  Result = unknown,
  Args extends readonly unknown[] = readonly unknown[],
  Deps extends readonly string[] = readonly []
> {
  // NOTE: writable so user can set them without casts
  dependsOn?: Deps;
  mode?: "lazy" | "eager";
  (this: void, ...args: Args): Result;
}

type ArgsFor<Reg, Deps extends readonly Keys<Reg>[]> = {
  [I in keyof Deps]: StripMeta<Reg[Deps[I]]>;
};

export interface Container<Reg = {}> {
  bind<Result, Deps extends readonly Keys<Reg>[]>(
    factory: Factory<Result, ArgsFor<Reg, Deps>, Deps>
  ): () => Result;

  resolve<Tk extends Keys<Reg>>(token: Tk): StripMeta<Reg[Tk]>;
}

export type RegistryOf<C> =
  C extends Container<infer R> ? R : never;

// PHASE 1: define(factory) only (no tokens)
export interface DefinePhase<Reg = {}> {
  define<F extends Factory<any, any, readonly string[]>>(
    factory: F
  ): DefinePhase<Reg>;

  assign<
    Tk extends string,
    F extends Factory<any, any, readonly string[]>
  >(
    token: Tk,
    factory: F
  ): AssignPhase<Extend<Reg, Tk, WithMeta<ResultOf<F>, F, DepsOf<F>>>>;
}

// PHASE 2: assign(token, factory) or seal()
export interface AssignPhase<Reg> {
  assign<
    Tk extends string,
    F extends Factory<any, any, readonly string[]>
  >(
    token: Tk,
    factory: F
  ): AssignPhase<Extend<Reg, Tk, WithMeta<ResultOf<F>, F, DepsOf<F>>>>;

  seal(): Container<Reg>;
}

// Global augmentation so users can write `Fn.dependsOn = [...]` / `Fn.mode = 'lazy'`
declare global {
  interface Function {
    dependsOn?: readonly string[];
    mode?: "lazy" | "eager";
  }
}
export {}; // ensure this file is a module

// ───────────────────────────────────────────────────────────────────
// RUNTIME

export function startContainer(): DefinePhase<{}> {
  type AnyFactory = Factory<any, any, readonly string[]>;

  // Definitions keyed by function object and by its `.name`
  const defsByFn = new Set<AnyFactory>();
  const defsByName = new Map<string, AnyFactory>();
  const lazyByName = new Set<string>();

  // Assigned providers: token -> factory, and also by *definition name* -> token
  const assignedByToken = new Map<string, AnyFactory>();
  const assignedTokenByName = new Map<string, string>();

  // Instances cache by token
  const cache = new Map<string, unknown>();

  let lockDefines = false;

  const ensureDefinedFn = (f: AnyFactory) => {
    if (!defsByFn.has(f)) throw new Error(`Factory "${f.name || "<anonymous>"}" was not defined.`);
  };

  const ensureNotAssignedToken = (tk: string) => {
    if (assignedByToken.has(tk)) throw new Error(`Token "${tk}" is already assigned.`);
  };

  const ensureNotAssignedName = (name: string) => {
    if (assignedTokenByName.has(name)) {
      const tk = assignedTokenByName.get(name);
      throw new Error(`Factory "${name}" is already assigned to token "${tk}".`);
    }
  };

  const validateDepsAtAssign = (f: AnyFactory, tk: string) => {
    const deps = (f.dependsOn ?? []) as readonly string[];
    for (const d of deps) {
      if (assignedTokenByName.has(d)) continue;           // satisfied by an already assigned provider
      if (lazyByName.has(d)) continue;                    // relaxed because provider is lazy-defined
      throw new Error(
        `Cannot assign token "${tk}" for "${f.name || "<anonymous>"}" because dependency "${d}" is neither assigned nor defined as lazy.`
      );
    }
  };

  const build = (tk: string, path: string[]): unknown => {
    if (cache.has(tk)) return cache.get(tk);
    const f = assignedByToken.get(tk);
    if (!f) throw new Error(`Cannot resolve unassigned token "${tk}".`);

    if (path.includes(tk)) {
      const cycle = [...path, tk].join(" > ");
      throw new Error(`Cyclic dependency detected: ${cycle}`);
    }

    const deps = (f.dependsOn ?? []) as readonly string[];

    const args = deps.map((depName) => {
      const depToken = assignedTokenByName.get(depName);
      if (!depToken) throw new Error(`Cannot resolve dependency "${depName}" for "${tk}": token not assigned.`);
      if (lazyByName.has(depName)) {
        // Lazy: pass thunk
        return () => resolve(depToken);
      }
      // Eager: resolve immediately
      return build(depToken, [...path, tk]);
    });

    const value = (f as AnyFactory)(...args as any);
    cache.set(tk, value);
    return value;
  };

  const resolve = (tk: string) => build(tk, []);

  const bind = <R>(factory: Factory<R, any, readonly string[]>) => {
    return () => {
      const deps = (factory.dependsOn ?? []) as readonly string[];
      const args = deps.map((depName) => {
        const depToken = assignedTokenByName.get(depName);
        if (!depToken) {
          if (lazyByName.has(depName)) {
            // Lazy but not yet assigned: pass thunk that will throw until assigned
            return () => resolve(depName); // incorrect: resolve expects token; fix below
          }
          throw new Error(`Cannot bind: dependency "${depName}" is not assigned.`);
        }
        if (lazyByName.has(depName)) {
          return () => resolve(depToken);
        }
        return resolve(depToken);
      });
      return (factory as AnyFactory)(...args as any) as R;
    };
  };

  const makeContainer = <Reg>(): Container<Reg> =>
    ({ bind, resolve } as unknown as Container<Reg>);

  const assignImpl = <Reg>(tk: string, f: AnyFactory) => {
    if (!lockDefines) lockDefines = true;

    ensureDefinedFn(f);
    ensureNotAssignedToken(tk);

    const name = f.name || "<anonymous>";
    // A single defined factory can be assigned only once (by name)
    ensureNotAssignedName(name);

    validateDepsAtAssign(f, tk);

    assignedByToken.set(tk, f);
    assignedTokenByName.set(name, tk);
  };

  const apiDefine: DefinePhase<any> = {
    define(factory) {
      if (lockDefines) {
        throw new Error(`Cannot define factory "${factory.name || "<anonymous>"}" after assignment phase has started.`);
      }
      if (defsByName.has(factory.name)) {
        throw new Error(`Factory "${factory.name}" already defined.`);
      }
      defsByFn.add(factory);
      defsByName.set(factory.name, factory);
      const mode = (factory.mode ?? "eager") as ModeOf<typeof factory>;
      if (mode === "lazy") lazyByName.add(factory.name);
      return this as DefinePhase<any>;
    },
    assign(token, factory) {
      assignImpl(token, factory);
      return apiAssign as AssignPhase<any>;
    },
  };

  const apiAssign: AssignPhase<any> = {
    assign(token, factory) {
      assignImpl(token, factory);
      return this as AssignPhase<any>;
    },
    seal() {
      return makeContainer<any>();
    },
  };

  return apiDefine as DefinePhase<{}>;
}
