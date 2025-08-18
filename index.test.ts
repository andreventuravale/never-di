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

  bar.dependsOn = ["foo"];

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
