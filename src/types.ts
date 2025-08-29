interface AssignApi<S = {}> {
  assign<F extends Factory>(
    f: F
  ): S extends Check<S, F>
    ? Stage2<WithRegistry<WithMeta<S, Record<Tk<F>, F>>, Record<Tk<F>, F>>>
    : Check<S, F>;

  assignMany<const Fs extends readonly [Factory, ...Factory[]]>(
    fs: readonly [...Fs]
  ): IntraBatchError<Fs> extends never
    ? S extends Check<S, Fs[number]>
      ? Stage2<WithRegistryManyTuple<WithMetaManyTuple<S, Fs>, Fs>>
      : Check<S, Fs[number]>
    : IntraBatchError<Fs>;
}

export interface Container<
  R extends Record<string, Factory | readonly Factory[]> = {}
> {
  resolve<T extends keyof R>(token: T): ReturnOfRegValue<R[T]>;

  bind<L extends Loader>(l: L): () => ReturnType<L>; 
}

interface DefineApi<S = {}> {
  defineLazy<F extends Factory>(f: F): Stage1<WithLazy<S, Tk<F>>>;
}

export interface Factory<T = any, Args extends any[] = any[]> extends Metadata {
  (...args: Args): T;
}

export interface Loader<Args extends any[] = any[]> extends Pick<Metadata, 'dependsOn'> {
  (...args: Args): void;
}

interface Metadata {
  readonly dependsOn?: readonly string[];
  readonly lazy?: true;
  readonly token: string;
}

export interface Stage1<S = {}> extends DefineApi<S>, AssignApi<S> {}

export interface Stage2<S = {}> extends AssignApi<S> {
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

type Check<Reg, F extends Metadata> = [UncoveredDeps<Reg, F>] extends [never]
  ? Reg
  : {
      type: "error";
      message: "factory has dependencies that are not assigned";
      dependent: Tk<F>;
      unassigned_dependencies: UncoveredDeps<Reg, F>;
    };

type DepKeys<F extends Metadata> = F extends {
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

type LazyKeys<Reg> = Reg extends { lazy: infer L }
  ? L extends string
    ? L
    : never
  : never;

type LazyKeysOf<S> = S extends { lazy: infer L }
  ? L extends string
    ? L
    : never
  : never;

type Meta<Reg> = Reg extends { meta: infer M } ? M : {};

type Reg<S> = S extends {
  reg: infer R extends Record<string, Factory | readonly Factory[]>;
}
  ? R
  : never;

type ReturnOfRegValue<V> = V extends readonly Factory[]
  ? ReturnType<V[number]>[]
  : V extends Factory
  ? ReturnType<V>
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

type SealResult<S> = SealCheck<S> extends S ? Container<Reg<S>> : SealCheck<S>;

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

type UnassignedLazy<S> = Exclude<LazyKeysOf<S>, AssignedKeys<S>>;

type UncoveredDeps<Reg, F extends Metadata> = Exclude<
  DepKeys<F>,
  keyof Meta<Reg> | LazyKeys<Reg>
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
