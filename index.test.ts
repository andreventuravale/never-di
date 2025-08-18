import { expect, test } from "vitest";

import { DiRuntime } from ".";

test("simplest use case", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  const sealedContainer = container.register("foo", () => "foo").seal();

  expect(sealedContainer.resolve("foo")).toMatchInlineSnapshot(`"foo"`);
});

test("dependency tracking inherently determines the registration order", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  baz.dependsOn = ["foo", "bar"] as const;

  function baz(foo: number, bar: number): number {
    return foo + bar;
  }

  // control
  expect(
    container
      .register("foo", () => 1)
      .register("bar", () => 2)
      .register("baz", baz)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);

  // missing foo and bar
  expect(
    container
      // @ts-expect-error Type '"foo" | "bar"' is not assignable to type 'never'.
      .register("baz", baz)
      .register("foo", () => 1)
      .register("bar", () => 2)
      .seal()
      .resolve("baz")
  ).toMatchInlineSnapshot(`3`);

  // missing bar
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
