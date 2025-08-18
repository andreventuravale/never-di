import { expect, test } from "vitest";

import { DiRuntime, IDiFactory } from ".";

test("simplest use case", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  const sealedContainer = container.register("foo", () => "foo").seal();

  expect(sealedContainer.resolve("foo")).toMatchInlineSnapshot(`"foo"`);
});

test("dependency resolution", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  bar.dependsOn = ["foo"]

  function bar(foo: unknown): unknown {
    return foo;
  }

  expect(
    container
      .register("foo", () => "foo")
      .register("bar", bar)
      .seal()
      .resolve("bar")
  ).toMatchInlineSnapshot(`"foo"`);
});

test.skip("dependency tracking inherently determines the registration order", () => {
  const runtime = DiRuntime();

  const container = runtime.createContainer();

  // control
  expect(
    container
      .register("foo", () => "foo")
      .register("bar", (foo) => foo)
      .seal()
      .resolve("bar")
  ).toMatchInlineSnapshot(`"foo"`);

  // sut
  container
    .register("foo", () => "foo")
    .register("bar", (foo) => foo)
    .seal();
});
