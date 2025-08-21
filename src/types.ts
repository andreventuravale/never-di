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

export interface ContainerDraft<Registry = {}> {
  register<
    Tk extends string,
    Result,
    Args extends unknown[] = unknown[],
    Deps extends readonly Extract<keyof Registry, string>[] = []
  >(
    tk: Tk,
    factory: Factory<
      Tk extends keyof Registry
        ? EnforceSame<Result, ElementType<Registry[Tk]>>
        : Result,
      Args,
      Deps
    >
  ): Tk extends keyof Registry
    ? [Result] extends [ElementType<Registry[Tk]>]
      ? DerivedContainerDraft<Registry, Tk, Result>
      : never
    : DerivedContainerDraft<Registry, Tk, Result>;

  seal(): Container<Registry>;
}

export type ContainerState = {
  factories: Map<string, Factory[]>;
};

export interface Factory<
  Result = unknown,
  Args extends unknown[] = unknown[],
  Deps extends readonly string[] = readonly []
> {
  readonly dependsOn?: Deps;
  (this: void, ...args: Args): Result;
}

export type RegistryOf<C> = C extends ContainerDraft<infer R> ? R : never;

export type ResolveContext = {
  cache: Map<string, unknown>;
  path: string[];
  seen: Set<string>;
};

type AssignArray<R, K extends string, V> = K extends keyof R
  ? Reconcile<Omit<R, K> & { [P in K]: EnforceSame<ElementType<R[K]>, V>[] }>
  : Reconcile<R & { [P in K]: V }>;

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
