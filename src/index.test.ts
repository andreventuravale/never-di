import { expect, expectTypeOf, test } from "vitest";
import type { RegistryOf } from ".";
import { startContainer } from ".";

test("simplest use case (control)", () => {
  expect(
    startContainer()
      .register("foo", () => "foo")
      .seal()
      .resolve("foo")
  ).toStrictEqual("foo");
});

test("dependency tracking determines registration order (control + compile-time negatives)", () => {
  baz.dependsOn = ["foo", "bar"] as const;
  function baz(foo: number, bar: number): number {
    return foo + bar;
  }

  // control: deps registered first
  expect(
    startContainer()
      .register("foo", () => 1)
      .register("bar", () => 2)
      .register("baz", baz)
      .seal()
      .resolve("baz")
  ).toStrictEqual(3);

  // negative 1: missing both deps at registration time (should fail at the callsite)
  expect(
    startContainer()
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type 'never'
      .register("baz", baz)
      .register("foo", () => 1)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toStrictEqual(3);

  // negative 2: only one dep registered before baz (should still fail at callsite)
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

test("circular dependency is detected (clear error path)", () => {
  a.dependsOn = ["b"] as const;
  function a(b: unknown) {
    return `a(${String(b)})`;
  }

  b.dependsOn = ["a"] as const;
  function b(a: unknown) {
    return `b(${String(a)})`;
  }

  const draft = startContainer()
    // compile-time mismatch: dependsOn mentions tokens that aren't registered yet
    // @ts-expect-error Types of property 'dependsOn' are incompatible.
    .register("a", a)
    // @ts-expect-error Types of property 'dependsOn' are incompatible.
    .register("b", b);

  // runtime cycle detection stays clear and specific
  expect(() => draft.seal().resolve("a")).toThrow("cycle detected: a > b > a");
});

test("resolve type-level: token does not exist (negative)", () => {
  expect(() =>
    startContainer()
      .seal()
      // @ts-expect-error Argument of type '"foo"' is not assignable to parameter of type 'never'
      .resolve("foo")
  ).toThrow("token is not registered: foo");
});

test("single-bind resolves to a single value (shape + typing)", () => {
  const draft = startContainer();

  f1.dependsOn = [] as const;
  function f1(): number {
    return 1;
  }

  f2.dependsOn = ["f1"] as const;
  function f2(value1: number): number {
    return value1;
  }

  const d1 = draft.register("f1", f1);
  expectTypeOf<RegistryOf<typeof d1>>().toEqualTypeOf<{ f1: number }>();

  const d2 = d1.register("f2", f2);
  expectTypeOf<RegistryOf<typeof d2>>().toEqualTypeOf<{
    f1: number;
    f2: number;
  }>();

  const c = d2.seal();
  expect(c.resolve("f1")).toStrictEqual(1);
  expect(c.resolve("f2")).toStrictEqual(1);
});

test("multi-bind resolves to an array of values (shape + order)", () => {
  const draft = startContainer();

  f1.dependsOn = [] as const;
  function f1(): number {
    return 1;
  }

  f2.dependsOn = [] as const;
  function f2(): number {
    return 2;
  }

  f3.dependsOn = [] as const;
  function f3(): number {
    return 3;
  }

  const d1 = draft.register("factory", f1);
  expectTypeOf<RegistryOf<typeof d1>>().toEqualTypeOf<{ factory: number }>();

  const d2 = d1.register("factory", f2);
  expectTypeOf<RegistryOf<typeof d2>>().toEqualTypeOf<{ factory: number[] }>();

  const d3 = d2.register("factory", f3);
  expectTypeOf<RegistryOf<typeof d3>>().toEqualTypeOf<{ factory: number[] }>();

  expect(d3.seal().resolve("factory")).toStrictEqual([1, 2, 3]);
});

test("multi-bind: enforcing consistent element type (compile-time negative at register site)", () => {
  const draft = startContainer();

  num.dependsOn = [] as const;
  function num(): number {
    return 1;
  }

  str.dependsOn = [] as const;
  function str(): string {
    return "2";
  }

  // first registration fixes element type to 'number'
  const d1 = draft.register("x", num);
  expectTypeOf<RegistryOf<typeof d1>>().toEqualTypeOf<{ x: number }>();
  expect(d1.seal().resolve("x")).toStrictEqual(1);

  // attempting to re-register 'x' with a different Result should fail HERE
  // @ts-expect-error EnforceSame violation: cannot change 'x' element type from number to string
  const d2 = d1.register("x", str);

  // if someone silences the error above, runtime would produce [1, "2"].
  // we purposely do not assert that here to avoid legitimizing the bad case.
  void d2;
});

test("containers are immutable (forking draft yields independent registries)", () => {
  sum.dependsOn = ["a", "b"] as const;
  function sum(a: number, b: number): number {
    return a + b;
  }

  const d1 = startContainer().register("a", () => 1);
  const d2 = d1.register("b", () => 2);
  const d3 = d2.register("sum", sum);

  // earlier drafts remain valid and unaffected
  expect(d1.seal().resolve("a")).toStrictEqual(1);

  expect(d2.seal().resolve("a")).toStrictEqual(1);
  expect(d2.seal().resolve("b")).toStrictEqual(2);

  expect(d3.seal().resolve("a")).toStrictEqual(1);
  expect(d3.seal().resolve("b")).toStrictEqual(2);
  expect(d3.seal().resolve("sum")).toStrictEqual(3);

  // negative lookups on earlier drafts: precise error messages
  expect(() => {
    d1.seal()
      // @ts-expect-error Argument of type '"b"' is not assignable to parameter of type '"a"'
      .resolve("b");
  }).toThrow("token is not registered: b");

  expect(() => {
    d1.seal()
      // @ts-expect-error Argument of type '"sum"' is not assignable to parameter of type '"a"'
      .resolve("sum");
  }).toThrow("token is not registered: sum");

  expect(() => {
    d2.seal()
      // @ts-expect-error Argument of type '"sum"' is not assignable to parameter of type '"a" | "b"'
      .resolve("sum");
  }).toThrow("token is not registered: sum");
});

test("re-registering on a new draft doesn't mutate previous factories (value shape proves it)", () => {
  function f1() {
    return 1;
  }
  function f2() {
    return 2;
  }

  const d0 = startContainer();
  const d1 = d0.register("x", f1);
  const d2 = d1.register("x", f2);

  expect(d2.seal().resolve("x")).toStrictEqual([1, 2]); // new draft has both
  expect(d1.seal().resolve("x")).toStrictEqual(1); // old draft remains single-bind
});

test("single sealed container caches per token (no re-exec on repeated resolves)", () => {
  let calls = 0;
  function f(): string {
    calls += 1;
    return "value";
  }

  expect(calls).toBe(0);

  const c = startContainer().register("x", f).seal();

  expect(c.resolve("x")).toBe("value");
  expect(c.resolve("x")).toBe("value");
  expect(c.resolve("x")).toBe("value");
  expect(calls).toBe(1);
});

test("cache is per container (forked containers execute independently)", () => {
  let calls = 0;
  function x(): string {
    calls += 1;
    return "value";
  }

  const c1 = startContainer().register("x", x).seal();
  const c2 = startContainer().register("x", x).seal();

  expect(calls).toBe(0);
  expect(c1.resolve("x")).toBe("value");
  expect(calls).toBe(1);
  expect(c1.resolve("x")).toBe("value");
  expect(calls).toBe(1);

  expect(calls).toBe(1);
  expect(c2.resolve("x")).toBe("value");
  expect(calls).toBe(2);
  expect(c2.resolve("x")).toBe("value");
  expect(calls).toBe(2);
});

test("re-registering a multi-bound token invalidates exactly that token in the new container", () => {
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

  // populate c1 caches
  expect(c1.resolve("x")).toStrictEqual([1, 2]);
  expect(c1.resolve("y")).toBe("y");
  expect({ x1Calls, x2Calls, x3Calls, yCalls }).toEqual({
    x1Calls: 1,
    x2Calls: 1,
    x3Calls: 0,
    yCalls: 1,
  });

  // fork and add x3
  const d2 = d1.register("x", x3);
  const c2 = d2.seal();

  // 'y' is unchanged; 'x' recomputed in the new container
  expect(c2.resolve("y")).toBe("y");
  expect(c2.resolve("x")).toStrictEqual([1, 2, 3]);
  expect({ x1Calls, x2Calls, x3Calls, yCalls }).toEqual({
    x1Calls: 2,
    x2Calls: 2,
    x3Calls: 1,
    yCalls: 1,
  });
});

test("re-registering a token invalidates only that token's cached value (not others)", () => {
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

  const d1 = startContainer().register("x", f1);
  const c1 = d1.seal();

  expect(c1.resolve("x")).toBe(1);
  expect(c1.resolve("x")).toBe(1);
  expect({ f1Calls, f2Calls }).toEqual({ f1Calls: 1, f2Calls: 0 });

  const d2 = d1.register("x", f2);
  const c2 = d2.seal();

  // x recomputes; if cache wasn't invalidated in the fork, you'd get stale 1
  expect(c2.resolve("x")).toStrictEqual([1, 2]);
  expect({ f1Calls, f2Calls }).toEqual({ f1Calls: 2, f2Calls: 1 });
});

test("bind: happy path and no-deps path", () => {
  needsFoo.dependsOn = ["foo"] as const;
  function needsFoo(foo: string) {
    return `got ${foo}`;
  }

  const c = startContainer()
    .register("foo", () => "foo")
    .seal();

  const bound = c.bind(needsFoo);
  expect(bound()).toStrictEqual("got foo");

  function noDeps() {
    return "plain";
  }
  const bound2 = c.bind(noDeps);
  expect(bound2()).toStrictEqual("plain");
});

test("bind + resolve share object identity (mutations are observed)", () => {
  type Bar = { value?: unknown };

  function bar(): Bar {
    return {};
  }

  usesBar.dependsOn = ["bar"] as const;
  function usesBar(bar: Bar) {
    expect(bar.value).toBe(123); // mutation should be visible here
    return bar;
  }

  alsoUsesBar.dependsOn = ["bar"] as const;
  function alsoUsesBar(bar: Bar) {
    expect(bar.value).toBe(123); // mutation should be visible here too
    return bar;
  }

  const container = startContainer()
    .register("bar", bar)
    .register("usesBar", usesBar)
    .seal();

  const resolvedBar = container.resolve("bar");
  expect(resolvedBar).toStrictEqual({});

  resolvedBar.value = 123;

  // resolve on a registered factory that uses 'bar'
  const barFromUses = container.resolve("usesBar");
  expect(barFromUses).toStrictEqual({ value: 123 });

  // bind another function that depends on 'bar' and verify it sees the same object
  const bound = container.bind(alsoUsesBar);
  const barFromBound = bound();
  expect(barFromBound).toStrictEqual({ value: 123 });
});

test("resolve throws at runtime for unregistered token even if type is bypassed", () => {
  const sealed = startContainer().seal();
  expect(() => (sealed as any).resolve("missing")).toThrow(
    "token is not registered: missing"
  );
});

test("dependsOn referencing missing token: compile-time error and clear runtime error", () => {
  bad.dependsOn = ["missing"] as const;
  function bad(missing: unknown): unknown {
    return missing;
  }

  const sealed = startContainer()
    // compile-time negative: 'missing' is not in the registry yet
    // @ts-expect-error Type 'readonly ["missing"]' is not assignable to type 'readonly never[]'.
    .register("bad", bad)
    .seal();

  // runtime negative: resolving 'bad' triggers the underlying 'missing' lookup
  expect(() => sealed.resolve("bad")).toThrow(
    "token is not registered: missing"
  );
});

test("multi-bind registry shape is stable and downstream deps can consume it", () => {
  // x is multi-bound: first factory fixes element type to number; second must match (number)
  x1.dependsOn = ["a", "b"] as const;
  function x1(a: number, b: string): number {
    return a + b.length; // 1 + 1 = 2
  }

  x2.dependsOn = ["c"] as const;
  function x2(c: boolean): number {
    return c ? 1 : 0; // true → 1
  }

  // y consumes 'x' as produced (an array because x is multi-bound)
  y.dependsOn = ["x"] as const;
  function y(x: unknown[]) {
    return x;
  }

  const draft = startContainer()
    .register("a", () => 1)
    .register("b", () => "b")
    .register("x", x1) // first bind → x: number
    .register("c", () => true)
    .register("x", x2) // second bind → x: number[]
    .register("y", y);

  // Registry shape is as expected
  type Reg = RegistryOf<typeof draft>;
  expectTypeOf<Reg>().toEqualTypeOf<{
    a: number;
    b: string;
    c: boolean;
    x: number[];
    y: unknown[];
  }>();

  // Control: order preserved (x1 first, x2 second); y passes through x unchanged
  const sealed = draft.seal();
  expect(sealed.resolve("x")).toStrictEqual([2, 1]);
  expect(sealed.resolve("y")).toStrictEqual([2, 1]);
});
