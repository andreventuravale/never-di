// ---- Minimal types with single binding + separate multi binding ----

export interface Factory<
  Result = unknown,
  Args extends readonly unknown[] = readonly unknown[],
  Deps extends readonly string[] = readonly []
> {
  readonly dependsOn?: Deps;
  (this: void, ...args: Args): Result;
}

type Keys<R> = Extract<keyof R, string>;
type Extend<R, K extends string, V> = R & { [P in K]: V };
type ArgsFor<Reg, Deps extends readonly Keys<Reg>[]> = {
  [I in keyof Deps]: Reg[Deps[I]];
};

export interface ContainerDraft<Reg = {}> {
  // Single binding: token -> T
  register<
    Tk extends string,
    Result,
    Deps extends readonly Keys<Reg>[]
  >(
    tk: Tk,
    factory: Factory<Result, any[], Deps>
  ): ContainerDraft<Extend<Reg, Tk, Result>>;

  // Multi binding: token -> T[]
  registerMany<
    Tk extends string,
    Result,
    Deps extends readonly Keys<Reg>[]
  >(
    tk: Tk,
    factories: readonly Factory<Result, any[], Deps>[]
  ): ContainerDraft<Extend<Reg, Tk, Result[]>>;

  seal(): Container<Reg>;
}

export interface Container<Reg = {}> {
  bind<
    Result,
    Deps extends readonly Keys<Reg>[]
  >(factory: Factory<Result, ArgsFor<Reg, Deps>, Deps>): () => Result;

  resolve<Tk extends Keys<Reg>>(token: Tk): Reg[Tk];
}

export type RegistryOf<C> = C extends ContainerDraft<infer R> ? R : never;
