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
  defineLazy<F extends Factory>(f: F): Stage1<WithLazy<S, Tk<F>>>;
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
  : {
      type: "error";
      message: "factory has dependencies that are not assigned";
      dependent: Tk<F>;
      unsigned_dependencies: UncoveredDeps<Reg, F>;
    };

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

//@@@@@@@@@@@@@@@@@@@@

// --- seal guard: every lazy token must be assigned ---

// Keys already assigned (your meta collects them)
type AssignedKeys<S> = keyof (S extends { meta: infer M } ? M : {}) & string;

// Lazy tokens collected via defineLazy / defineMany
type LazyKeysOf<S> = S extends { lazy: infer L }
  ? L extends string
    ? L
    : never
  : never;

// What lazy tokens are still missing?
type UnassignedLazy<S> = Exclude<LazyKeysOf<S>, AssignedKeys<S>>;

// Error shape (mirrors your Check<> style)
type SealCheck<S> = [UnassignedLazy<S>] extends [never]
  ? S
  : {
      type: "error";
      message: "one or more lazy factories remain unassigned";
      unassigned_tokens: UnassignedLazy<S>;
    };

// If SealCheck passes, return Container; else return the error shape
type SealResult<S> = SealCheck<S> extends S ? Container<Reg<S>> : SealCheck<S>;

//@@@@@@@@@@@@@@@@@@@@

//####################

// ---- forbid in-batch deps for assignMany ----
type TokensOf<Fs extends readonly Factory[]> = TokenOf<Fs[number]>;
type DepsOf<Fs extends readonly Factory[]> = DepKeys<Fs[number]>;
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

//####################

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

interface Stage1<S = {}> extends DefineApi<S>, AssignApi<S> {}

interface Stage2<S = {}> extends AssignApi<S> {
  seal(): SealResult<S>;
}

interface Container<
  R extends Record<string, Factory | readonly Factory[]> = {}
> {
  resolve<T extends keyof R>(token: T): ReturnOfRegValue<R[T]>;
}

function createContainerDraft(): Stage1 {
  const map = new Map<string, Factory | Factory[]>();

  return {
    assign,
    assignMany,
    defineLazy,
  } as any;

  function defineLazy(f: Factory): Stage2 {
    return {
      assign,
      assignMany,
      defineLazy,
    } as any;
  }

  function assign(f: Factory): Stage2 {
    map.set(f.token, f);

    return {
      assign,
      assignMany,
      seal,
    } as any;
  }

  function assignMany(f: Factory): Stage2 {
    map.set(f.token, f);

    return {
      assign,
      assignMany,
      seal,
    } as any;
  }

  function seal(): Container {
    return {
      resolve,
    } as any;
  }

  function resolve<T>(token: string): T {
    const entry = map.get(token);

    if (!entry) {
      throw new Error(`token is not assigned: ${token}`);
    }

    if (Array.isArray(entry)) {
      return entry.map(_resolve) as T;
    }

    return _resolve(entry) as T;
  }

  function _resolve(factory: Factory): unknown {
    const { dependsOn = [] } = factory;

    const args = dependsOn.map(resolve);

    return factory.apply(undefined, args);
  }
}

type T = {
  say(): string;
};

test.only("poc", async () => {
  foo.dependsOn = ["bar"] as const;
  foo.lazy = true as const;
  foo.token = "foo" as const;

  function foo(): T {
    return {
      say: () => "foo",
    };
  }

  bar.dependsOn = ["foo"] as const;
  bar.lazy = true as const;
  bar.token = "bar" as const;

  function bar(foo: () => T): T {
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

// test("many", async () => {
//   foo.dependsOn = ["bar"] as const;
//   foo.lazy = true as const;
//   foo.token = "foo" as const;

//   function foo(): T {
//     return {
//       say: () => "foo",
//     };
//   }

//   bar1.dependsOn = ["foo"] as const;
//   bar1.lazy = true as const;
//   bar1.token = "bar" as const;

//   function bar1(foo: () => T): T {
//     return {
//       say: foo().say,
//     };
//   }

//   bar2.dependsOn = ["foo"] as const;
//   bar2.lazy = true as const;
//   bar2.token = "bar" as const;

//   function bar2(foo: () => T): T {
//     return {
//       say: foo().say,
//     };
//   }

//   const bars = createContainerDraft()
//     .defineLazy(foo)
//     .assignMany([bar1, bar2])
//     .assign(foo)
//     .seal()
//     .resolve("bar");

//   bars.forEach(({ say }) => expect(say()).toMatch("foo"));
// });

// test("many hetero deps", async () => {
//   foo.dependsOn = ["bar"] as const;
//   foo.lazy = true as const;
//   foo.token = "foo" as const;

//   function foo(bar: T): T {
//     return {
//       say: bar.say,
//     };
//   }

//   bar.token = "bar" as const;

//   function bar(): T {
//     return {
//       say: () => "bar",
//     };
//   }

//   qux.token = "qux" as const;

//   function qux(): T {
//     return {
//       say: () => "qux",
//     };
//   }

//   baz1.dependsOn = ["foo", "bar"] as const;
//   baz1.lazy = true as const;
//   baz1.token = "baz" as const;

//   function baz1(foo: () => T): T {
//     return {
//       say: foo().say,
//     };
//   }

//   baz2.dependsOn = ["foo", "qux"] as const;
//   baz2.lazy = true as const;
//   baz2.token = "baz" as const;

//   function baz2(foo: () => T): T {
//     return {
//       say: foo().say,
//     };
//   }

//   const bars = createContainerDraft()
//     .defineLazy(foo)
//     .assign(qux)
//     .assign(bar)
//     .assignMany([baz1, baz2])
//     .assign(foo)
//     .seal()
//     .resolve("baz");

//   bars.forEach(({ say }) => expect(say()).toMatch("foo"));
// });

// // a depends on b; both are in the same batch ⇒ error
// test("assignMany forbids in-batch deps", () => {
//   function a(_: T): T {
//     return { say: () => "a" };
//   }
//   a.dependsOn = ["b"] as const;
//   a.token = "a" as const;

//   function b(): T {
//     return { say: () => "b" };
//   }
//   b.token = "b" as const;

//   createContainerDraft()
//     .assignMany([a, b])
//     // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "b"; }
//     .seal();

//   createContainerDraft()
//     .assignMany([b, a])
//     // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "b"; }
//     .seal();
// });

// test("assignMany passes when deps are provided outside the batch", () => {
//   function a(_: () => T): T {
//     return { say: () => "a" };
//   }
//   a.dependsOn = ["b"] as const;
//   a.lazy = true as const;
//   a.token = "a" as const;

//   function b(): T {
//     return { say: () => "b" };
//   }
//   b.token = "b" as const;

//   createContainerDraft()
//     .defineLazy(b) // dep provided *outside* the batch
//     .assignMany([a]) // ok
//     .assign(b) // or .assign later
//     .seal();
// });

// test("assignMany(strict) fails if a depends on b in the same batch", () => {
//   type T = { say(): string };

//   function a(_: T): T {
//     return { say: () => "a" };
//   }
//   a.dependsOn = ["b"] as const;
//   a.token = "a" as const;

//   function b(): T {
//     return { say: () => "b" };
//   }
//   b.token = "b" as const;

//   // Fails due to your IntraBatchError (forbid in-batch deps)
//   createContainerDraft()
//     .assignMany([a, b])
//     // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "b"; }
//     .seal();

//   // Order doesn’t help (still in-batch)
//   createContainerDraft()
//     .assignMany([b, a])
//     // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "b"; }
//     .seal();
// });

// test("assignMany passes when dep is outside the batch (lazy before)", () => {
//   type T = { say(): string };

//   function a(_: () => T): T {
//     return { say: () => "a" };
//   }
//   a.dependsOn = ["b"] as const;
//   a.lazy = true as const;
//   a.token = "a" as const;

//   function b(): T {
//     return { say: () => "b" };
//   }
//   b.token = "b" as const;

//   createContainerDraft()
//     .defineLazy(b) // makes "b" acceptable for a
//     .assignMany([a]) // ok (no in-batch deps)
//     .assign(b) // later assignment
//     .seal(); // ok
// });

// test("seal fails when a lazy token is not assigned", () => {
//   type T = { say(): string };

//   function x(): T {
//     return { say: () => "x" };
//   }
//   x.token = "x" as const;

//   // Lazy declared but never assigned → your SealResult error
//   expect(createContainerDraft().defineLazy(x).seal()).toMatchInlineSnapshot();
// });

// test("same-token multi-bind ok (no self-deps), returns array", () => {
//   type T = { say(): string };

//   function foo(): T {
//     return { say: () => "foo" };
//   }
//   foo.token = "foo" as const;

//   function bar1(_: T): T {
//     return { say: () => "bar1" };
//   }
//   bar1.dependsOn = ["foo"] as const;
//   bar1.lazy = true as const;
//   bar1.token = "bar" as const;

//   function bar2(_: T): T {
//     return { say: () => "bar2" };
//   }
//   bar2.dependsOn = ["foo"] as const;
//   bar2.lazy = true as const;
//   bar2.token = "bar" as const;

//   const bars = createContainerDraft()
//     .defineLazy(foo)
//     .assignMany([bar1, bar2]) // same token, no self-dep on "bar" → OK
//     .assign(foo)
//     .seal()
//     .resolve("bar");

//   bars.forEach((b) => b.say()); // typed as ReturnType<typeof bar1 | typeof bar2>[]
// });

// test("same-token batch is forbidden if any factory depends on the token itself", () => {
//   type T = { say(): string };

//   function bar1(_: T): T {
//     return { say: () => "bar1" };
//   }
//   bar1.dependsOn = ["bar"] as const; // self/peer token
//   bar1.token = "bar" as const;

//   function bar2(): T {
//     return { say: () => "bar2" };
//   }
//   bar2.token = "bar" as const;

//   createContainerDraft()
//     .assignMany([bar1, bar2])
//     // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "bar" }
//     .seal();
// });
