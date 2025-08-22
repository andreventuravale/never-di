// ---------- helpers (all O(1)) ----------
type Keys<R> = Extract<keyof R, string>;
type Extend<R, K extends string, V> = R & { [P in K]: V };

// Phantom metadata carrier via unique symbol (type-only, erased at runtime)
declare const __meta__: unique symbol;
type __Meta<F, D extends readonly string[]> = { readonly [__meta__]?: readonly [F, D] };

type WithMeta<V, F, D extends readonly string[]> = V & __Meta<F, D>;
type StripMeta<T> = T extends infer V & __Meta<any, any> ? V : T;

// Tuple helpers (non-recursive, constant in complexity)
type First<T extends readonly unknown[]> = T extends readonly [infer H, ...any] ? H : never;

// Works for your callable `Factory` without conditional over parameters
type ResultOf<F> = F extends { (...a: any): infer R } ? R : never;
type DepsOf<F> = F extends { readonly dependsOn?: infer D }
  ? D extends readonly string[] ? D : readonly []
  : readonly [];

// Union deps across an array (union shape is O(1) to form)
type UnionDepElems<Fs extends readonly unknown[]> = DepsOf<Fs[number]>[number];
type UnionDeps<Fs extends readonly unknown[]> = readonly UnionDepElems<Fs>[];

// ---------- your core types ----------
export interface Factory<
  Result = unknown,
  Args extends readonly unknown[] = readonly unknown[],
  Deps extends readonly string[] = readonly []
> {
  readonly dependsOn?: Deps;
  (this: void, ...args: Args): Result;
}

type ArgsFor<Reg, Deps extends readonly Keys<Reg>[]> = {
  [I in keyof Deps]: StripMeta<Reg[Deps[I]]>;
};

export interface ContainerDraft<Reg = {}> {
  // Single binding: token -> T (store meta, visible type remains T)
  register<
    Tk extends string,
    Result,
    Deps extends readonly Keys<Reg>[]
  >(
    tk: Tk,
    factory: Factory<Result, any[], Deps>
  ): ContainerDraft<Extend<Reg, Tk, WithMeta<Result, typeof factory, Deps>>>;

  // Multi binding: token -> T[]
  // - Enforces NON-EMPTY tuple
  // - Enforces SAME Result type across all factories (Rest matches F1's Result)
  registerMany<
    Tk extends string,
    F1 extends Factory<any, any[], readonly Keys<Reg>[]>,
    Rest extends readonly Factory<ResultOf<F1>, any[], readonly Keys<Reg>[]>[]
  >(
    tk: Tk,
    factories: readonly [F1, ...Rest]
  ): ContainerDraft<
    Extend<
      Reg,
      Tk,
      WithMeta<
        ResultOf<F1>[],                // value = array of results
        F1,                            // factory type of the first element
        UnionDeps<[F1, ...Rest]>       // union of all dependsOn
      >
    >
  >;

  seal(): Container<Reg>;
}

export interface Container<Reg = {}> {
  bind<
    Result,
    Deps extends readonly Keys<Reg>[]
  >(factory: Factory<Result, ArgsFor<Reg, Deps>, Deps>): () => Result;

  resolve<Tk extends Keys<Reg>>(token: Tk): StripMeta<Reg[Tk]>;
}

export type RegistryOf<C> = C extends ContainerDraft<infer R> ? R : never;

// (Optional) introspection helpers, also O(1):
export type FactoryOf<Reg, Tk extends Keys<Reg>> =
  Reg[Tk] extends __Meta<infer F, any> ? F : never;

export type DependsOf<Reg, Tk extends Keys<Reg>> =
  Reg[Tk] extends __Meta<any, infer D> ? D : readonly never[];
