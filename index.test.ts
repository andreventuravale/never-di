import type { RegistryOf } from ".";

import { expect, expectTypeOf, test } from "vitest";

import { startContainer } from ".";

test("simplest use case", () => {
  expect(
    startContainer()
      .register("foo", () => "foo")
      .seal()
      .resolve("foo")
  ).toMatchInlineSnapshot(`"foo"`);
});

test("dependency tracking inherently determines the registration order", () => {
  baz.dependsOn = ["foo", "bar"] as const;

  function baz(foo: number, bar: number): number {
    return foo + bar;
  }

  // control
  expect(
    startContainer()
      .register("foo", () => 1)
      .register("bar", () => 2)
      .register("baz", baz)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);

  // missing foo and bar
  expect(
    startContainer()
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type 'never'
      .register("baz", baz)
      .register("foo", () => 1)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);

  // missing bar
  expect(
    startContainer()
      .register("foo", () => 1)
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type '"foo"'
      .register("baz", baz)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);
});

test("circular dependency is detected via seen set", () => {
  a.dependsOn = ["b"];

  function a(b: unknown) {
    return `a(${b})`;
  }

  b.dependsOn = ["a"];

  function b(a: unknown) {
    return `b(${a})`;
  }

  const draft = startContainer()
    // @ts-expect-error Types of property 'dependsOn' are incompatible.
    .register("a", a)
    // @ts-expect-error Types of property 'dependsOn' are incompatible.
    .register("b", b);

  expect(() => draft.seal().resolve("a")).toThrowErrorMatchingInlineSnapshot(
    `[Error: cycle detected: a > b > a]`
  );
});

test("token does not exist", () => {
  expect(() =>
    startContainer()
      .seal()
      // @ts-expect-error Argument of type '"foo"' is not assignable to parameter of type 'never'
      .resolve("foo")
  ).toThrowErrorMatchingInlineSnapshot(`[Error: token is not registered: foo]`);
});

test("single-bind resolves to a single value", () => {
  const draft = startContainer();

  factory1.dependsOn = [] as const;

  function factory1(): number {
    return 1;
  }

  factory2.dependsOn = ["factory1"] as const;

  function factory2(value1: number): number {
    return value1;
  }

  const _1st = draft.register("factory1", factory1);

  expectTypeOf<RegistryOf<typeof _1st>>().toEqualTypeOf<{ factory1: number }>();

  const _2nd = _1st.register("factory2", factory2);

  expectTypeOf<RegistryOf<typeof _2nd>>().toEqualTypeOf<{
    factory1: number;
    factory2: number;
  }>();

  expect(_2nd.seal().resolve("factory1")).toMatchInlineSnapshot(`1`);

  expect(_2nd.seal().resolve("factory2")).toMatchInlineSnapshot(`1`);
});

test("multi-bind resolves to an array of values", () => {
  const draft = startContainer();

  factory1.dependsOn = [] as const;

  function factory1(): number {
    return 1;
  }

  factory2.dependsOn = [] as const;

  function factory2(): number {
    return 2;
  }

  factory3.dependsOn = [] as const;

  function factory3(): string {
    return "3";
  }

  const _1st = draft.register("factory", factory1);

  expectTypeOf<RegistryOf<typeof _1st>>().toEqualTypeOf<{ factory: number }>();

  const _2nd = _1st.register("factory", factory2);

  expectTypeOf<RegistryOf<typeof _2nd>>().toEqualTypeOf<{
    factory: number[];
  }>();

  const _3rd = _2nd.register("factory", factory3);

  // @ts-expect-error Type 'number[]' is not assignable to type '{ [x: number]: "Expected: number, Actual: never"; }'
  expectTypeOf<RegistryOf<typeof _3rd>>().toEqualTypeOf<{
    factory: number[];
  }>();

  expect(_3rd.seal().resolve("factory")).toMatchInlineSnapshot(`
    [
      1,
      2,
      "3",
    ]
  `);
});

test("2nd+-bind resolves to an array of values", () => {
  const draft = startContainer();

  factory1.dependsOn = [] as const;

  function factory1(): number {
    return 1;
  }

  factory2.dependsOn = [] as const;

  function factory2(): string {
    return "2";
  }

  factory3.dependsOn = [] as const;

  function factory3(): RegExp {
    return /3/;
  }

  factory4.dependsOn = [] as const;

  function factory4(): boolean {
    return true;
  }

  const _1st = draft.register("factory", factory1);

  expectTypeOf<RegistryOf<typeof _1st>>().toEqualTypeOf<{ factory: number }>();

  expect(_1st.seal().resolve("factory")).toMatchInlineSnapshot(`1`);

  const _2nd = _1st.register("factory", factory2);

  // @ts-expect-error Type 'number[]' is not assignable to type '{ [x: number]: "Expected: number, Actual: never"; }'
  expectTypeOf<RegistryOf<typeof _2nd>>().toEqualTypeOf<{
    factory: number[];
  }>();

  expect(_2nd.seal().resolve("factory")).toMatchInlineSnapshot(`
    [
      1,
      "2",
    ]
  `);

  const _3rd = _2nd.register("factory", factory3);

  // @ts-expect-error Type 'number[]' is not assignable to type '{ [x: number]: "Expected: number, Actual: never"; }'
  expectTypeOf<RegistryOf<typeof _3rd>>().toEqualTypeOf<{
    factory: number[];
  }>();

  expect(_3rd.seal().resolve("factory")).toMatchInlineSnapshot(`
    [
      1,
      "2",
      /3/,
    ]
  `);

  const _4th = _3rd.register("factory", factory4);

  // @ts-expect-error Type 'number[]' is not assignable to type '{ [x: number]: "Expected: number, Actual: never"; }'
  expectTypeOf<RegistryOf<typeof _4th>>().toEqualTypeOf<{
    factory: number[];
  }>();

  expect(_4th.seal().resolve("factory")).toMatchInlineSnapshot(`
    [
      1,
      "2",
      /3/,
      true,
    ]
  `);
});

test("containers are immutable", () => {
  baz.dependsOn = ["foo", "bar"] as const;

  function baz(foo: number, bar: number): number {
    return foo + bar;
  }

  const draft1 = startContainer().register("foo", () => 1);

  const draft2 = draft1.register("bar", () => 2);

  const draft3 = draft2.register("baz", baz);

  expect(draft1.seal().resolve("foo")).toMatchInlineSnapshot(`1`);

  expect(draft2.seal().resolve("foo")).toMatchInlineSnapshot(`1`);
  expect(draft2.seal().resolve("bar")).toMatchInlineSnapshot(`2`);

  expect(draft3.seal().resolve("foo")).toMatchInlineSnapshot(`1`);
  expect(draft3.seal().resolve("bar")).toMatchInlineSnapshot(`2`);
  expect(draft3.seal().resolve("baz")).toMatchInlineSnapshot(`3`);

  expect(() => {
    draft1
      .seal()
      // @ts-expect-error Argument of type '"bar"' is not assignable to parameter of type '"foo"'
      .resolve("bar");
  }).toThrowErrorMatchingInlineSnapshot(
    `[Error: token is not registered: bar]`
  );

  expect(() => {
    draft1
      .seal()
      // @ts-expect-error Argument of type '"baz"' is not assignable to parameter of type '"foo" | "bar"'
      .resolve("baz");
  }).toThrowErrorMatchingInlineSnapshot(
    `[Error: token is not registered: baz]`
  );

  expect(() => {
    draft2
      .seal()
      // @ts-expect-error Argument of type '"baz"' is not assignable to parameter of type '"foo" | "bar"'
      .resolve("baz");
  }).toThrowErrorMatchingInlineSnapshot(
    `[Error: token is not registered: baz]`
  );
});

test("bind happy path", () => {
  unbound.dependsOn = ["foo"] as const;

  function unbound(foo: string) {
    return foo;
  }

  const bound = startContainer()
    .register("foo", () => "foo")
    .seal()
    .bind(unbound);

  expect(bound()).toMatchInlineSnapshot(`"foo"`);
});

test("registering on a new container does not mutate the old one's factories", () => {
  function f1() {
    return 1;
  }

  function f2() {
    return 2;
  }

  const draft0 = startContainer();

  const draft1 = draft0.register("x", f1);

  const draft2 = draft1.register("x", f2);

  expect(draft2.seal().resolve("x")).toEqual([1, 2]);

  expect(draft1.seal().resolve("x")).toEqual(1);
});

test("single sealed container caches a token: multiple resolves do not re-execute the factory", () => {
  let calls = 0;

  function f(): string {
    calls += 1;

    return "value";
  }

  expect(calls).toBe(0);

  const container = startContainer().register("x", f).seal();

  expect(container.resolve("x")).toBe("value");

  expect(container.resolve("x")).toBe("value");

  expect(container.resolve("x")).toBe("value");

  expect(calls).toBe(1);
});

test("cache is per container: each container runs its factory exactly once", () => {
  let calls = 0;

  function x(): string {
    calls += 1;

    return "value";
  }

  const c1 = startContainer().register("x", x).seal();

  const c2 = startContainer().register("x", x).seal();

  // First container: resolving multiple times should only execute once
  expect(calls).toBe(0);
  expect(c1.resolve("x")).toBe("value");
  expect(calls).toBe(1);
  expect(c1.resolve("x")).toBe("value");
  expect(calls).toBe(1);

  // Second container: should execute again (per-container singleton)
  expect(calls).toBe(1);
  expect(c2.resolve("x")).toBe("value");
  expect(calls).toBe(2);

  // And repeated resolves in the second container don't re-run
  expect(calls).toBe(2);
  expect(c2.resolve("x")).toBe("value");
  expect(calls).toBe(2);
});

test("re-registering a multi-bound token invalidates that token only and reruns its factories in the new container", () => {
  let x1Calls = 0;

  function x1() {
    x1Calls += 1;

    return 1;
  }

  let x2Calls = 0;

  function x2() {
    x2Calls += 1;

    return 2;
  }

  let x3Calls = 0;

  function x3() {
    x3Calls += 1;

    return 3;
  }

  let yCalls = 0;

  function y() {
    yCalls += 1;

    return "y";
  }

  const d1 = startContainer()
    .register("x", x1)
    .register("x", x2)
    .register("y", y);

  const c1 = d1.seal();

  // populate cache in c1
  expect(c1.resolve("x")).toEqual([1, 2]);
  expect(c1.resolve("y")).toBe("y");
  expect(x1Calls).toBe(1);
  expect(x2Calls).toBe(1);
  expect(x3Calls).toBe(0);
  expect(yCalls).toBe(1);

  // re-register x with x3 -> new container c2; only x should be invalidated
  const d2 = d1.register("x", x3);
  const c2 = d2.seal();

  // 'y' remains cached; 'x' recomputed (all x factories re-run in this container)
  expect(c2.resolve("y")).toBe("y");
  expect(yCalls).toBe(1); // unchanged
  expect(c2.resolve("x")).toEqual([1, 2, 3]);
  expect(x1Calls).toBe(2); // x1 rerun in c2
  expect(x2Calls).toBe(2); // x2 rerun in c2
  expect(x3Calls).toBe(1); // new factory ran once
});

test("re-registering a token invalidates exactly that token's cached value", () => {
  let f1Calls = 0;
  let f2Calls = 0;

  function f1(): number {
    f1Calls += 1;
    return 1;
  }
  function f2(): number {
    f2Calls += 1;
    return 2;
  }
  f1.dependsOn = [] as const;
  f2.dependsOn = [] as const;

  // 1) Build c1 and populate the cache for 'x'
  const c1 = startContainer().register("x", f1);
  const s1 = c1.seal();

  expect(s1.resolve("x")).toBe(1); // populates cache: f1 ran once
  expect(s1.resolve("x")).toBe(1); // cached
  expect(f1Calls).toBe(1);
  expect(f2Calls).toBe(0);

  // 2) Fork: re-register 'x' in c2
  const c2 = c1.register("x", f2);
  const s2 = c2.seal();

  // 3) Invalidate should affect ONLY 'x':
  //    'x' must recompute (both f1 and f2 run), but other tokens (if any) would remain cached.
  //    If you *clone* the cache and forget to delete 'x', this next line will re-use the old 1.
  expect(s2.resolve("x")).toEqual([1, 2]);

  // Verify both factories actually ran in the new container:
  // If cache wasn't invalidated, f1Calls would still be 1 (stale value reused).
  expect(f1Calls).toBe(2);
  expect(f2Calls).toBe(1);
});
