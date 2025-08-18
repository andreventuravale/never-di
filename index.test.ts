import { expect, test } from "vitest";

import { DiRuntime } from ".";

test("simplest use case", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  const sealedContainer = container.register("foo", () => "foo").seal();

  expect(sealedContainer.resolve("foo")).toMatchInlineSnapshot(`"foo"`);
});

test("dependency resolution", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  baz.dependsOn = ["foo", "bar"] as const;

  function baz(foo: number, bar: number): number {
    return foo + bar;
  }

  expect(
    container
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type 'never'.
      .register("baz", baz)
      .register("foo", () => 1)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);

  expect(
    container
      .register("foo", () => 1)
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type '"foo"'.
      .register("baz", baz)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);
});

test("dependency tracking inherently determines the registration order", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  bar.dependsOn = ["foo"];

  function bar(foo: unknown): unknown {
    return foo;
  }

  // control
  expect(
    container
      .register("foo", () => "foo")
      .register("bar", bar)
      .seal()
      .resolve("bar")
  ).toMatchInlineSnapshot(`"foo"`);

  // sut
  container
    .register("bar", (foo) => foo)
    .register("foo", () => "foo")
    .seal();
});

test("circular dependency is detected via seen set", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  a.dependsOn = ["b"];

  function a(b: unknown) {
    return `a(${b})`;
  }

  b.dependsOn = ["a"];

  function b(a: unknown) {
    return `b(${a})`;
  }

  container.register("a", a).register("b", b);

  const sealed = container.seal();

  expect(() => sealed.resolve("a")).toThrowErrorMatchingInlineSnapshot(
    `[Error: cycle detected: a → b → a]`
  );
});
