export type RegistryOf<C> = C extends Container<
  any,
  infer R extends Record<string, Factory | readonly Factory[]>,
  infer Lz extends string
>
  ? {
      [K in keyof R &
        string]: R[K] extends readonly (infer AF extends Factory)[] // multi-bind → never lazy; collapse to the factory's return type
        ? ReturnType<AF>
        : // single factory → thunk iff the token K is in the lazy set
        R[K] extends Factory
        ? [K] extends [Lz]
          ? () => ReturnType<R[K]>
          : ReturnType<R[K]>
        : never;
    }
  : never;

interface AssignApi<S = {}> {
  assign<F extends Factory>(
    f: F
  ): S extends CheckFactory<S, F>
    ? Stage2<WithRegistry<WithMeta<S, Record<Tk<F>, F>>, Record<Tk<F>, F>>>
    : CheckFactory<S, F>;

  assignMany<const Fs extends readonly [Factory, ...Factory[]]>(
    fs: readonly [...Fs]
  ): IntraBatchError<Fs> extends never
    ? S extends CheckFactory<S, Fs[number]>
      ? Stage2<WithRegistryManyTuple<WithMetaManyTuple<S, Fs>, Fs>>
      : CheckFactory<S, Fs[number]>
    : IntraBatchError<Fs>;
}

export interface Container<
  S = any,
  R extends Record<string, Factory | readonly Factory[]> = any,
  Lz extends string = any
> {
  bind<P extends Procedure>(
    p: P
  ): S extends CheckProcedure<S, P>
    ? () => ReturnType<P>
    : CheckProcedure<S, P>;

  resolve<T extends keyof R & string>(token: T): Type<R, Lz, T>;
}

interface DefineApi<S = {}> {
  defineLazy<F extends Factory>(
    f: F
  ): Stage1<
    WithRegistry<
      WithMeta<WithLazy<S, Tk<F>>, Record<Tk<F>, F>>,
      Record<Tk<F>, F>
    >
  >;
}

export interface Factory<T = any, Args extends any[] = any[]> extends Metadata {
  (...args: Args): T;
}

export interface Procedure<Args extends any[] = any[]>
  extends Pick<Metadata, "dependsOn"> {
  (...args: Args): void;
}

interface Metadata {
  readonly dependsOn?: readonly string[];
  readonly lazy?: true;
  readonly token: string;
}

export interface Stage1<S = {}> extends DefineApi<S>, AssignApi<S> {
  readonly state: S;
}

export interface Stage2<S = {}> extends AssignApi<S> {
  readonly state: S;

  seal(): SealResult<S>;
}

// -------------------------------------------------------------------

type AllTokensEqual<
  Fs extends readonly Factory[],
  K extends string
> = Fs extends readonly []
  ? true
  : Head<Fs> extends infer H extends Factory
  ? [TokenOf<H>] extends [K]
    ? [K] extends [TokenOf<H>]
      ? AllTokensEqual<Tail<Fs>, K>
      : false
    : false
  : false;

type AssignedKeys<S> = keyof Meta<S> & string;

type Depends<F extends Pick<Metadata, "dependsOn">> = F extends {
  dependsOn: infer D extends readonly string[];
}
  ? D
  : readonly [];

type ParamForToken<S, K extends string, R = Reg<S>> = K extends keyof R
  ? Reg<S>[K] extends readonly (infer AF extends Factory)[]
    ? AF extends Factory
      ? ReturnType<AF>[]
      : never
    : Reg<S>[K] extends Factory
    ? [K] extends [Lazy<S>]
      ? () => ReturnType<Reg<S>[K]>
      : ReturnType<Reg<S>[K]>
    : never
  : never;

type ExpectedArgs<S, D extends readonly string[]> = D extends readonly [
  infer K extends string,
  ...infer R extends readonly string[]
]
  ? [ParamForToken<S, K>, ...ExpectedArgs<S, R>]
  : [];

type ParamListCheck<S, F extends Factory> = Parameters<F> extends ExpectedArgs<
  S,
  Depends<F>
>
  ? ExpectedArgs<S, Depends<F>> extends Parameters<F>
    ? S
    : {
        type: "error";
        message: "dependencies type mismatch (lazy ones must be thunks)";
        dependent: Tk<F>;
        dependencies: Depends<F>;
      }
  : {
      type: "error";
      message: "dependencies type mismatch (lazy ones must be thunks)";
      dependent: Tk<F>;
      dependencies: Depends<F>;
    };

type CheckFactory<S, F extends Factory> = [UncoveredDeps<S, F>] extends [never]
  ? ParamListCheck<S, F>
  : {
      type: "error";
      message: "factory has dependencies that are not assigned";
      dependent: Tk<F>;
      unassigned_dependencies: UncoveredDeps<S, F>;
    };

type CheckProcedure<S, F extends Pick<Metadata, "dependsOn">> = [
  UncoveredDeps<S, F>
] extends [never]
  ? S
  : {
      type: "error";
      message: "procedure has dependencies that are not assigned";
      unassigned_dependencies: UncoveredDeps<S, F>;
    };

type DepKeys<F extends Pick<Metadata, "dependsOn">> = F extends {
  dependsOn: infer D extends readonly string[];
}
  ? D[number]
  : never;

type DepsOf<Fs extends readonly Factory[]> = DepKeys<Fs[number]>;

type GroupByToken<Fs extends readonly Factory[]> = {
  [K in TokenOf<Fs[number]>]: Extract<Fs[number], { token: K }>[];
};

type Head<T extends readonly unknown[]> = T extends readonly [
  infer H,
  ...unknown[]
]
  ? H
  : never;

type IntraBatchDeps<Fs extends readonly Factory[]> = Extract<
  DepsOf<Fs>,
  TokensOf<Fs>
>;

type IntraBatchError<Fs extends readonly Factory[]> =
  IntraBatchDeps<Fs> extends never
    ? never
    : {
        type: "error";
        message: "assignMany forbids in-batch dependencies";
        tokens: IntraBatchDeps<Fs>;
      };

type Lazy<S> = S extends { lazy: infer L }
  ? L extends string
    ? L
    : never
  : never;

type Meta<S> = S extends { meta: infer M } ? M : {};

type Reg<S> = S extends {
  reg: infer R extends Record<string, Factory | readonly Factory[]>;
}
  ? R
  : never;

type Type<
  R extends Record<string, Factory | readonly Factory[]>,
  Lz extends string,
  T extends keyof R
> =
  // If R[T] is an array of factories → plain array of returns (never lazy)
  R[T] extends readonly (infer AF extends Factory)[]
    ? AF extends Factory
      ? ReturnType<AF>[]
      : never
    : // Else, if R[T] is a single factory → thunk iff token is lazy
    R[T] extends Factory
    ? [T] extends [Lz]
      ? () => ReturnType<R[T]>
      : ReturnType<R[T]>
    : never;

type SameTokenKey<Fs extends readonly Factory[]> = Fs extends readonly [
  infer H extends Factory,
  ...infer _ extends readonly Factory[]
]
  ? AllTokensEqual<Fs, TokenOf<H>> extends true
    ? TokenOf<H>
    : never
  : never;

type SealCheck<S> = [UnassignedLazy<S>] extends [never]
  ? S
  : {
      type: "error";
      message: "one or more lazy factories remain unassigned";
      unassigned_tokens: UnassignedLazy<S>;
    };

type SealResult<S> = SealCheck<S> extends S
  ? Container<S, Reg<S>, Lazy<S>>
  : SealCheck<S>;

type Tail<T extends readonly unknown[]> = T extends readonly [
  unknown,
  ...infer R
]
  ? R
  : readonly [];

type Tk<M extends Metadata> = M extends { token: infer Tk extends string }
  ? Tk
  : never;

type TokenOf<F extends Factory> = NonNullable<F["token"]>;

type TokensOf<Fs extends readonly Factory[]> = TokenOf<Fs[number]>;

type UnassignedLazy<S> = Exclude<Lazy<S>, AssignedKeys<S>>;

type UncoveredDeps<S, F extends Pick<Metadata, "dependsOn">> = Exclude<
  DepKeys<F>,
  keyof Meta<S> | Lazy<S>
>;

type WithLazy<S, Token> = S extends {
  lazy: infer Prev;
}
  ? S & { lazy: Prev | Token }
  : S & { lazy: Token };

type WithMeta<S, Meta> = S extends {
  meta: infer Prev;
}
  ? S & { meta: Prev & Meta }
  : S & { meta: Meta };

type WithMetaManyTuple<
  S,
  Fs extends readonly Factory[]
> = SameTokenKey<Fs> extends infer K extends string
  ? S extends { meta: infer M }
    ? Omit<S, "meta"> & { meta: M & Record<K, Fs> }
    : S & { meta: Record<K, Fs> }
  : S extends { meta: infer M }
  ? Omit<S, "meta"> & { meta: M & GroupByToken<Fs> }
  : S & { meta: GroupByToken<Fs> };

type WithRegistry<S, F extends Record<string, Factory>> = S extends {
  reg: infer Prev extends Record<string, Factory>;
}
  ? S & { reg: Prev & F }
  : S & { reg: F };

type WithRegistryManyTuple<
  S,
  Fs extends readonly Factory[]
> = SameTokenKey<Fs> extends infer K extends string
  ? S extends { reg: infer R }
    ? Omit<S, "reg"> & { reg: R & Record<K, Fs> }
    : S & { reg: Record<K, Fs> }
  : S extends { reg: infer R }
  ? Omit<S, "reg"> & { reg: R & GroupByToken<Fs> }
  : S & { reg: GroupByToken<Fs> };
