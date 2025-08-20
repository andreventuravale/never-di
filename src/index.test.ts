import type { RegistryOf } from ".";

import { expect, expectTypeOf, test } from "vitest";

import { startContainer } from ".";

test("simplest use case", () => {
  expect(
    startContainer()
      .register("foo", () => "foo")
      .seal()
      .resolve("foo")
  ).toStrictEqual("foo");
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
  ).toStrictEqual(3);

  // missing foo and bar
  expect(
    startContainer()
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type 'never'
      .register("baz", baz)
      .register("foo", () => 1)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toStrictEqual(3);

  // missing bar
  expect(
    startContainer()
      .register("foo", () => 1)
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type '"foo"'
      .register("baz", baz)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toStrictEqual(3);
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

  expect(() => draft.seal().resolve("a")).toThrow(`cycle detected: a > b > a`);
});

test("token does not exist", () => {
  expect(() =>
    startContainer()
      .seal()
      // @ts-expect-error Argument of type '"foo"' is not assignable to parameter of type 'never'
      .resolve("foo")
  ).toThrow(`token is not registered: foo`);
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

  expect(_2nd.seal().resolve("factory1")).toStrictEqual(1);

  expect(_2nd.seal().resolve("factory2")).toStrictEqual(1);
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
  function factory3(): number {
    return 3;
  }

  const _1st = draft.register("factory", factory1);
  type Reg1st = RegistryOf<typeof _1st>;
  expectTypeOf<Reg1st>().toEqualTypeOf<{ factory: number }>();

  const _2nd = _1st.register("factory", factory2);
  type Reg2nd = RegistryOf<typeof _2nd>;
  expectTypeOf<Reg2nd>().toEqualTypeOf<{ factory: number[] }>();

  const _3rd = _2nd.register("factory", factory3);
  type Reg3rd = RegistryOf<typeof _3rd>;
  expectTypeOf<Reg3rd>().toEqualTypeOf<{ factory: number[] }>();

  expect(_3rd.seal().resolve("factory")).toStrictEqual([1, 2, 3]);
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
  type Reg1st = RegistryOf<typeof _1st>;
  expectTypeOf<Reg1st>().toEqualTypeOf<{ factory: number }>();
  expect(_1st.seal().resolve("factory")).toStrictEqual(1);

  // Type violations are caught immediately at registration:
  // here we attempt to change element type from number > string.
  // @ts-expect-error The mismatched registration collapses to "never",
  const _2nd = _1st.register("factory", factory2);
  // preventing further use until the types are fixed.
  // @ts-expect-error The mismatched registration collapses to "never",
  expect(_2nd.seal().resolve("factory")).toStrictEqual([1, "2"]);
});

test("containers are immutable", () => {
  baz.dependsOn = ["foo", "bar"] as const;

  function baz(foo: number, bar: number): number {
    return foo + bar;
  }

  const draft1 = startContainer().register("foo", () => 1);

  const draft2 = draft1.register("bar", () => 2);

  const draft3 = draft2.register("baz", baz);

  expect(draft1.seal().resolve("foo")).toStrictEqual(1);

  expect(draft2.seal().resolve("foo")).toStrictEqual(1);
  expect(draft2.seal().resolve("bar")).toStrictEqual(2);

  expect(draft3.seal().resolve("foo")).toStrictEqual(1);
  expect(draft3.seal().resolve("bar")).toStrictEqual(2);
  expect(draft3.seal().resolve("baz")).toStrictEqual(3);

  expect(() => {
    draft1
      .seal()
      // @ts-expect-error Argument of type '"bar"' is not assignable to parameter of type '"foo"'
      .resolve("bar");
  }).toThrow(`token is not registered: bar`);

  expect(() => {
    draft1
      .seal()
      // @ts-expect-error Argument of type '"baz"' is not assignable to parameter of type '"foo" | "bar"'
      .resolve("baz");
  }).toThrow(`token is not registered: baz`);

  expect(() => {
    draft2
      .seal()
      // @ts-expect-error Argument of type '"baz"' is not assignable to parameter of type '"foo" | "bar"'
      .resolve("baz");
  }).toThrow(`token is not registered: baz`);
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

test("bind: happy path", () => {
  unbound.dependsOn = ["foo"] as const;

  function unbound(foo: string) {
    return foo;
  }

  const bound = startContainer()
    .register("foo", () => "foo")
    .seal()
    .bind(unbound);

  expect(bound()).toStrictEqual("foo");
});

test("bind: no deps", () => {
  function unbound() {
    return "foo";
  }

  const bound = startContainer().seal().bind(unbound);

  expect(bound()).toStrictEqual("foo");
});

test("bind: scenario to be defined", () => {
  type Bar = {
    value?: unknown;
  };

  function bar(): Bar {
    return {};
  }

  foo.dependsOn = ["bar"] as const;

  function foo(bar: Bar) {
    console.log("foo:", { bar });

    expect(bar.value).toBe(123);
  }

  loader.dependsOn = ["bar"] as const;

  function loader(bar: Bar) {
    console.log("loader:", { bar });

    expect(bar.value).toBe(123);
  }

  const container = startContainer()
    .register("bar", bar)
    .register("foo", foo)
    .seal();

  const ibar = container.resolve("bar");

  expect(ibar).toStrictEqual({});

  ibar.value = 123;

  container.resolve("foo");

  container.bind(loader)();
});

test("resolve throws for unregistered token at runtime", () => {
  const sealed = startContainer().seal();

  expect(() => (sealed as any).resolve("missing")).toThrow(
    `token is not registered: missing`
  );
});

test("dependsOn missing token throws a clear error (not an undefined.map crash)", () => {
  bad.dependsOn = ["missing"] as const;

  function bad(missing: unknown): unknown {
    return missing;
  }

  const sealed = startContainer()
    // @ts-expect-error Type 'readonly ["missing"]' is not assignable to type 'readonly never[]'.
    .register("bad", bad)
    .seal();

  // When resolving "bad", the resolver will try to resolve "missing"
  // and should throw "token is not registered: missing"
  expect(() => sealed.resolve("bad")).toThrow(
    `token is not registered: missing`
  );
});

test("bind type-checking", () => {
  const c = startContainer()
    .register("a", () => 123)
    .register("b", (a: number) => `got ${a}`)
    .seal();

  goodFn.dependsOn = ["a", "b"] as const;

  // OK: `b` depends on `a`
  function goodFn(a: number, b: string) {
    return `${b}!`;
  }

  c.bind(goodFn)(); // ✅ works

  badFn.dependsOn = ["a"] as const;

  // Wrong: declared dependency "a" but parameter type is wrong
  function badFn(a: string) {
    return a.toUpperCase();
  }

  // @ts-expect-error Types of parameters 'a' and 'args_0' are incompatible
  c.bind(badFn);
});

test("multi-bind: type-check of union of dependsOn", () => {
  x1.dependsOn = ["a", "b"] as const;

  function x1(a: number, b: string): number {
    return a + b.length;
  }

  x2.dependsOn = ["c"] as const;

  function x2(c: boolean): number {
    return c ? 1 : 0;
  }

  y.dependsOn = ["x"] as const;

  function y(x: number[]): number[] {
    return x;
  }

  const c1 = startContainer()
    .register("a", () => 1)
    .register("b", () => "b")
    .register("x", x1)
    .register("c", () => true)
    .register("x", x2)
    .register("y", y);

  type Reg = RegistryOf<typeof c1>;

  expectTypeOf<Reg>().toEqualTypeOf<{
    a: number;
    b: string;
    c: boolean;
    x: number[];
    y: number[];
  }>();
});

test("readme example", () => {
  n1.dependsOn = [] as const;

  function n1(): number {
    return 1;
  }

  s1.dependsOn = [] as const;

  function s1(): string {
    return "oops";
  }

  const c1 = startContainer().register("value", n1);

  // ❌ Compile-time error: cannot change multi-bind element type from number -> string
  // @ts-expect-error
  const c2 = c1.register("value", s1);

  // ❌ Compile-time error: if forced with @ts-expect-error, runtime still succeeds, but the types collapse to never,
  // producing a type error when sealing.
  // @ts-expect-error
  console.log(c2.seal().resolve("value")); // [1, "oops"]
});
