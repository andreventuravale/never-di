export interface Factory<
  Result = unknown,
  Args extends unknown[] = unknown[],
  Deps extends readonly string[] = readonly []
> {
  readonly dependsOn?: Deps;
  (this: void, ...args: Args): Result;
}

export interface ContainerDraft<Registry = {}> {
  register<
    Tk extends string,
    Result,
    Args extends unknown[] = unknown[],
    Deps extends readonly Extract<keyof Registry, string>[] = []
  >(
    tk: Tk,
    factory: Factory<Result, Args, Deps>
  ): DerivedContainerDraft<Registry, Tk, Result>;

  seal(): Container<Registry>;
}

export interface Container<Registry = {}> {
  bind<
    Result,
    Deps extends readonly KeysOf<Registry>[],
    Args extends DepsToArgs<Registry, Deps>
  >(
    factory: Factory<Result, Args, Deps>
  ): (this: void) => Result;

  resolve<Tk extends keyof Registry>(token: Tk): Registry[Tk];
}

export type RegistryOf<C> = C extends ContainerDraft<infer R> ? R : never;

type AssignArray<R, K extends string, V> = K extends keyof R
  ? Reconcile<Omit<R, K> & { [P in K]: EnforceSame<ElementType<R[K]>, V>[] }>
  : Reconcile<R & { [P in K]: V }>;

type ContainerState = {
  cache: Map<string, unknown>;
  factories: Map<string, Factory[]>;
};

type DepsToArgs<Reg, Deps extends readonly (keyof Reg & string)[]> = Mutable<{
  [I in keyof Deps]: Reg[Deps[I]];
}>;

type DerivedContainerDraft<
  Registry,
  IncomingTk extends string,
  IncomingResult
> = ContainerDraft<AssignArray<Registry, IncomingTk, IncomingResult>>;

type ElementType<T> = T extends readonly (infer U)[] ? U : T;

type EnforceSame<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? A
    : never
  : never;

type KeysOf<Reg> = keyof Reg & string;

type Mutable<T extends readonly unknown[]> = [...T];

type Reconcile<T> = { [K in keyof T]: T[K] } & {};

type ResolveContext = { path: string[]; seen: Set<string> };

export function startContainer(): ContainerDraft {
  return createContainerDraft(createContainerState());
}

function createContainerDraft(state: ContainerState): ContainerDraft {
  return { register, seal } as ContainerDraft;

  function register(tk: string, factory: Factory): ContainerDraft {
    const next = createContainerState(state);
    const list = next.factories.get(tk);
    if (list) {
      next.factories.set(tk, list.concat(factory));
      next.cache.delete(tk);
    } else {
      next.factories.set(tk, [factory]);
    }
    return createContainerDraft(next);
  }

  function seal(): Container {
    return { bind, resolve } as Container;

    function bind(factory: Factory): () => unknown {
      return () => {
        const deps = factory.dependsOn ?? [];
        return factory(...deps.map(resolve));
      };
    }

    function resolve(tk: string): unknown {
      return resolveInternal(state, { path: [], seen: new Set() }, tk);
    }
  }
}

function createContainerState(prev?: ContainerState): ContainerState {
  if (prev) {
    return {
      cache: new Map(prev.cache),
      factories: new Map(prev.factories),
    };
  }
  return { cache: new Map(), factories: new Map() };
}

function resolveInternal(
  state: ContainerState,
  ctx: ResolveContext,
  tk: string
): unknown {
  if (state.cache.has(tk)) return state.cache.get(tk);

  if (ctx.seen.has(tk)) {
    throw new Error(`cycle detected: ${ctx.path.concat([tk]).join(" > ")}`);
  }

  const list = state.factories.get(tk);
  if (!list || list.length === 0) {
    throw new Error(`token is not registered: ${tk}`);
  }

  ctx.seen.add(tk);
  ctx.path.push(tk);

  const results = list.map((factory) => {
    const deps = factory.dependsOn ?? [];
    const args = deps.map((dep) => resolveInternal(state, ctx, dep));
    return factory.apply(undefined, args);
  });

  ctx.seen.delete(tk);
  ctx.path.pop();

  const value = results.length === 1 ? results[0] : results;
  state.cache.set(tk, value);
  return value;
}
