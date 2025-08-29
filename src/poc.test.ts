import { expect, test } from "vitest";

interface Metadata {
  readonly dependsOn?: readonly string[];
  readonly lazy?: true;
  readonly token: string;
}

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

type WithRegistry<S, F extends Record<string, Factory>> = S extends {
  reg: infer Prev extends Record<string, Factory>;
}
  ? S & { reg: Prev & F }
  : S & { reg: F };

type Tk<M extends Metadata> = M extends { token: infer Tk extends string }
  ? Tk
  : never;

interface Factory<T = any, Args extends any[] = any[]> extends Metadata {
  (...args: Args): T;
}

interface DefineApi<S = {}> {
  defineLazy<F extends Factory>(f: F): Stage2<WithLazy<S, Tk<F>>>;
}

//--------------------

type Meta<Reg> = Reg extends { meta: infer M } ? M : {};

type LazyKeys<Reg> = Reg extends { lazy: infer L }
  ? L extends string
    ? L
    : never
  : never;

type DepKeys<F extends Metadata> = F extends {
  dependsOn: infer D extends readonly string[];
}
  ? D[number]
  : never;

type UncoveredDeps<Reg, F extends Metadata> = Exclude<
  DepKeys<F>,
  keyof Meta<Reg> | LazyKeys<Reg>
>;

type Check<Reg, F extends Metadata> = [UncoveredDeps<Reg, F>] extends [never]
  ? Reg
  : { [k in Tk<F>]: { depends: { on: UncoveredDeps<Reg, F> } } };

// type Reg<S> = S extends { reg: infer R extends Record<string, Factory> }
//   ? R
//   : never;

//--------------------

//====================
//====================
//====================

// --- helpers ---
type TokenOf<F extends Factory> = NonNullable<F["token"]>;

type Head<T extends readonly unknown[]> = T extends readonly [
  infer H,
  ...unknown[]
]
  ? H
  : never;
type Tail<T extends readonly unknown[]> = T extends readonly [
  unknown,
  ...infer R
]
  ? R
  : readonly [];

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

type SameTokenKey<Fs extends readonly Factory[]> = Fs extends readonly [
  infer H extends Factory,
  ...infer _ extends readonly Factory[]
]
  ? AllTokensEqual<Fs, TokenOf<H>> extends true
    ? TokenOf<H>
    : never
  : never;

type GroupByToken<Fs extends readonly Factory[]> = {
  [K in TokenOf<Fs[number]>]: Extract<Fs[number], { token: K }>[];
};

// --- meta/reg writers (tuple when same token; grouped arrays otherwise) ---
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

// --- resolve typing (single vs many) ---
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

//====================
//====================
//====================

interface AssignApi<S = {}> {
  assign<F extends Factory>(
    f: F
  ): S extends Check<S, F>
    ? Stage3<WithRegistry<WithMeta<S, Record<Tk<F>, F>>, Record<Tk<F>, F>>>
    : Check<S, F>;

  assignMany<const Fs extends readonly [Factory, ...Factory[]]>(
    fs: readonly [...Fs]
  ): S extends Check<S, Fs[number]>
    ? Stage3<WithRegistryManyTuple<WithMetaManyTuple<S, Fs>, Fs>>
    : Check<S, Fs[number]>;
}

interface Stage1<S = {}> extends DefineApi<S> {}

interface Stage2<S = {}> extends DefineApi<S>, AssignApi<S> {}

interface Stage3<S = {}> extends AssignApi<S> {
  seal(): Container<Reg<S>>;
}

interface Container<
  R extends Record<string, Factory | readonly Factory[]> = {}
> {
  resolve<T extends keyof R & string>(token: T): ReturnOfRegValue<R[T]>;
}

function createContainerDraft(): Stage1 {
  return {
    defineLazy,
  } as any;

  function defineLazy(f: Factory): Stage2 {
    return {
      assign,
      defineLazy,
    } as any;
  }

  function assign(f: Factory): Stage3 {
    return {
      assign,
      seal,
    } as any;
  }

  function seal(): Container {
    return {
      resolve,
    } as any;
  }

  function resolve<T>(token: string): T {
    return undefined as T;
  }
}

test("poc", async () => {
  foo.dependsOn = ["bar"] as const;
  foo.lazy = true as const;
  foo.token = "foo" as const;

  type Foo = {
    say(): string;
  };

  function foo(): Foo {
    return {
      say: () => "foo",
    };
  }

  bar.dependsOn = ["foo"] as const;
  bar.lazy = true as const;
  bar.token = "bar" as const;

  type Bar = {
    say(): string;
  };

  function bar(foo: () => Foo): Bar {
    return {
      say: foo().say,
    };
  }

  expect(
    createContainerDraft()
      .defineLazy(foo)
      .assign(bar)
      .assign(foo)
      .seal()
      .resolve("bar")
      .say()
  ).toMatch("foo");
});

test("many", async () => {
  type Foo = {
    say(): string;
  };

  foo.dependsOn = ["bar"] as const;
  foo.lazy = true as const;
  foo.token = "foo" as const;

  function foo(): Foo {
    return {
      say: () => "foo",
    };
  }

  type Bar = {
    say(): string;
  };

  bar1.dependsOn = ["foo"] as const;
  bar1.lazy = true as const;
  bar1.token = "bar" as const;

  function bar1(foo: () => Foo): Bar {
    return {
      say: foo().say,
    };
  }

  bar2.dependsOn = ["foo"] as const;
  bar2.lazy = true as const;
  bar2.token = "bar" as const;

  type Baz = {
    say(): string;
  };

  function bar2(foo: () => Foo): Baz {
    return {
      say: foo().say,
    };
  }

  const bars = createContainerDraft()
    .defineLazy(foo)
    .assignMany([bar1, bar2])
    .seal()
    .resolve("bar");

  bars.forEach(({ say }) => expect(say()).toMatch("foo"));
});
