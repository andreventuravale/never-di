import { expect, expectTypeOf, test } from "vitest";

import { DiRuntime, IDiContainer } from ".";

test("simplest use case", () => {
  const runtime = DiRuntime();

  expect(
    runtime
      .createContainer()
      .register("foo", () => "foo")
      .seal()
      .resolve("foo")
  ).toMatchInlineSnapshot(`"foo"`);
});

test("dependency tracking inherently determines the registration order", () => {
  const runtime = DiRuntime();

  baz.dependsOn = ["foo", "bar"] as const;

  function baz(foo: number, bar: number): number {
    return foo + bar;
  }

  // control
  expect(
    runtime
      .createContainer()
      .register("foo", () => 1)
      .register("bar", () => 2)
      .register("baz", baz)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);

  // missing foo and bar
  expect(
    runtime
      .createContainer()
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type 'never'
      .register("baz", baz)
      .register("foo", () => 1)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);

  // missing bar
  expect(
    runtime
      .createContainer()
      .register("foo", () => 1)
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type '"foo"'
      .register("baz", baz)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);
});

test("circular dependency is detected via seen set", () => {
  const runtime = DiRuntime();

  a.dependsOn = ["b"];

  function a(b: unknown) {
    return `a(${b})`;
  }

  b.dependsOn = ["a"];

  function b(a: unknown) {
    return `b(${a})`;
  }

  const container = runtime
    .createContainer()
    // @ts-expect-error Types of property 'dependsOn' are incompatible.
    .register("a", a)
    // @ts-expect-error Types of property 'dependsOn' are incompatible.
    .register("b", b);

  expect(() =>
    container.seal().resolve("a")
  ).toThrowErrorMatchingInlineSnapshot(`[Error: cycle detected: a > b > a]`);
});

test("token does not exist", () => {
  const runtime = DiRuntime();

  expect(() =>
    runtime
      .createContainer()
      .seal()
      // @ts-expect-error Argument of type '"foo"' is not assignable to parameter of type 'never'
      .resolve("foo")
  ).toThrowErrorMatchingInlineSnapshot(`[Error: token is not registered: foo]`);
});

type RegistryOf<C> = C extends IDiContainer<infer R> ? R : never;

test("single-bind resolves to a single value", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  factory1.dependsOn = [] as const;

  function factory1(): number {
    return 1;
  }

  factory2.dependsOn = ["factory1"] as const;

  function factory2(value1: number): number {
    return value1;
  }

  const _1st = container.register("factory1", factory1);

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
  const runtime = DiRuntime();

  const container = runtime.createContainer();

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

  const _1st = container.register("factory", factory1);

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
  const runtime = DiRuntime();

  const container = runtime.createContainer();

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

  const _1st = container.register("factory", factory1);

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

  const _4th = _2nd.register("factory", factory4);

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
