import { expect, test } from "vitest";

import { startContainer } from ".";

test("define collects metadata without validating deps", () => {
  Foo.dependsOn = ["Missing"] as const;
  function Foo() {
    return "foo";
  }

  const draft = startContainer().define(Foo);
  expect(draft).toBeTruthy();
});

test("duplicate define throws", () => {
  function A() {
    return 1;
  }

  const draft = startContainer().define(A);
  expect(() => draft.define(A)).toThrow('Factory "A" already defined.');
});

test("assigning an undefined factory throws", () => {
  function Foo() {
    return 0;
  }

  const draft = startContainer();
  expect(() => draft.assign("IFoo", Foo)).toThrow(
    'Factory "Foo" was not defined.'
  );
});

test("reassigning same token throws", () => {
  function Foo() {
    return 1;
  }

  const draft = startContainer().define(Foo).assign("IFoo", Foo);
  expect(() => draft.assign("IFoo", Foo)).toThrow(
    'Token "IFoo" is already assigned.'
  );
});

test("same factory cannot be assigned twice", () => {
  function Foo() {
    return 1;
  }

  const draft = startContainer().define(Foo).assign("IFoo", Foo);
  expect(() => draft.assign("IBar", Foo)).toThrow(
    'Factory "Foo" is already assigned to token "IFoo".'
  );
});

test("assign with no deps resolves value", () => {
  function Foo() {
    return 7;
  }

  const container = startContainer().define(Foo).assign("IFoo", Foo).seal();
  expect(container.resolve("IFoo")).toBe(7);
});

test("resolve on unassigned token throws", () => {
  function Foo() {
    return 7;
  }

  const container = startContainer().define(Foo).assign("Foo", Foo).seal();
  // @ts-expect-error Argument of type '"Unknown"' is not assignable to parameter of type '"Foo"'
  expect(() => container.resolve("Unknown")).toThrow(
    'Cannot resolve unassigned token "Unknown".'
  );
});

test("resolve caches same instance", () => {
  function Foo() {
    return {};
  }

  const c = startContainer().define(Foo).assign("IFoo", Foo).seal();
  const x = c.resolve("IFoo");
  const y = c.resolve("IFoo");
  expect(Object.is(x, y)).toBeTruthy();
});

test("eager dependency is passed as value", () => {
  function Foo() {
    return { kind: "B" as const };
  }

  Bar.dependsOn = ["Foo"] as const;
  function Bar(b: { kind: "B" }) {
    return b;
  }

  const c = startContainer()
    .define(Bar)
    .define(Foo)
    .assign("IFoo", Foo)
    .assign("IBar", Bar)
    .seal();

  expect(c.resolve("IBar")).toEqual({ kind: "B" });
});

test("lazy dependency is passed as thunk", () => {
  Foo.mode = "lazy" as const;
  function Foo() {
    return { kind: "B" as const };
  }

  let seenType = "";
  Bar.dependsOn = ["Foo"] as const;
  function Bar(foo: () => { kind: "B" }) {
    seenType = typeof foo;
    return { kind: "A" as const };
  }

  const c = startContainer()
    .define(Bar)
    .define(Foo)
    .assign("IBar", Bar)
    .assign("IFoo", Foo)
    .seal();

  c.resolve("IBar");
  expect(seenType).toBe("function");
});

test("lazy thunk returns the same cached instance", () => {
  Foo.mode = "lazy" as const;
  function Foo() {
    return {};
  }

  let capturedFoo!: () => {};
  Bar.dependsOn = ["Foo"] as const;
  function Bar(foo: () => {}) {
    capturedFoo = foo;
    return {};
  }

  const container = startContainer()
    .define(Bar)
    .define(Foo)
    .assign("IBar", Bar)
    .assign("IFoo", Foo)
    .seal();

  container.resolve("IBar");
  expect(Object.is(capturedFoo(), capturedFoo())).toBeTruthy();
});

test("eager–eager direct cycle is rejected at assign time", () => {
  Foo.dependsOn = ["Bar"] as const;
  function Foo(_bar: { k: "Bar" }) {
    return { k: "Foo" as const };
  }

  Bar.dependsOn = ["Foo"] as const;
  function Bar(_foo: { k: "Foo" }) {
    return { k: "Bar" as const };
  }

  const builder = startContainer().define(Foo).define(Bar);

  expect(() => builder.assign("IFoo", Foo)).toThrow(
    'Cannot assign token "IFoo" for "Foo" because dependency "Bar" is neither assigned nor defined as lazy.'
  );
});

test("lazy breaks direct cycle when thunk used after caching", () => {
  type Foo = { kind: "Foo"; bar: () => Bar };
  type Bar = { kind: "Bar" };

  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "lazy" as const;
  let capturedFooAtBar!: Foo;
  function Bar(foo: Foo) {
    capturedFooAtBar = foo;
    return { kind: "Bar" as const };
  }

  Foo.dependsOn = ["Bar"] as const;
  function Foo(bar: () => Bar) {
    return { kind: "Foo", bar };
  }

  const container = startContainer()
    .define(Foo)
    .define(Bar)
    .assign("IFoo", Foo)
    .assign("IBar", Bar)
    .seal();

  const foo = container.resolve("IFoo");

  expect(foo).toEqual(expect.objectContaining({ kind: "Foo" }));

  const bar = foo.bar();

  expect(Object.is(capturedFooAtBar, foo)).toBeTruthy();

  expect(bar).toEqual({ kind: "Bar" });
});

test("calling lazy thunk before provider is assigned throws", () => {
  Bar.mode = "lazy" as const;
  function Bar() {
    return {};
  }

  let capturedBarAtFoo!: () => {};
  Foo.dependsOn = ["Bar"] as const; // FIXME: impl is using function name!
  function Foo(bar: () => {}) {
    capturedBarAtFoo = bar;
    return {};
  }

  const draft = startContainer().define(Foo).define(Bar).assign("IFoo", Foo);

  const c = draft.seal();

  expect(() => {
    c.resolve("IFoo");
    capturedBarAtFoo();
  }).toThrow('Cannot resolve dependency "Bar" for "IFoo": token not assigned.');
});

test("assign fails when dep not assigned and not lazy", () => {
  Foo.dependsOn = ["Bar"] as const;
  function Foo() {
    return "A";
  }

  function Bar() {
    return "B";
  }

  const draft = startContainer().define(Foo).define(Bar);
  expect(() => draft.assign("IFoo", Foo)).toThrow(
    'Cannot assign token "IFoo" for "Foo" because dependency "Bar" is neither assigned nor defined as lazy.'
  );
});

test("assign succeeds when dep provider is lazy-defined", () => {
  Foo.dependsOn = ["Bar"] as const;
  function Foo() {
    return "A";
  }

  Bar.mode = "lazy" as const;
  function Bar() {
    return "B";
  }

  const draft = startContainer().define(Foo).define(Bar);
  expect(() => draft.assign("IFoo", Foo)).not.toThrow();
});

test("dependsOn by factory name works regardless of external tokens", () => {
  function Foo() {
    return 42;
  }

  Bar.dependsOn = ["Foo"] as const;
  function Bar(x: number) {
    return x + 1;
  }

  const c = startContainer()
    .define(Foo)
    .define(Bar)
    .assign("Foo", Foo)
    .assign("Bar", Bar)
    .seal();

  expect(c.resolve("Bar")).toBe(43);
});

test("bind returns a callable that produces a value", () => {
  function Foo() {
    return 41;
  }

  const c = startContainer().define(Foo).assign("IFoo", Foo).seal();

  Bar.dependsOn = ["Foo"] as const;
  function Bar(a: number) {
    return a + 1;
  }

  const fn = c.bind(Bar);
  expect(fn()).toBe(42);
});

test("bind wires eager deps as values", () => {
  function Foo() {
    return 2;
  }

  const c = startContainer().define(Foo).assign("IFoo", Foo).seal();

  let seen: number | undefined;
  Bar.dependsOn = ["Foo"] as const;
  function Bar(a: number) {
    seen = a;
    return 0;
  }

  c.bind(Bar)();
  expect(seen).toBe(2);
});

test("bind wires lazy deps as thunks", () => {
  Foo.mode = "lazy" as const;
  function Foo() {
    return 5;
  }

  const c = startContainer().define(Foo).assign("IFoo", Foo).seal();

  let capturedFooType = "";
  Bar.dependsOn = ["Foo"] as const;
  function Bar(foo: () => number) {
    capturedFooType = typeof foo;
    return 0;
  }

  c.bind(Bar)();
  expect(capturedFooType).toBe("function");
});

test("resolve error mentions token name", () => {
  function A() {
    return 1;
  }

  const c = startContainer().define(A).assign("IA", A).seal();

  // @ts-expect-error Argument of type '"Nope"' is not assignable to parameter of type '"IA"'.
  expect(() => c.resolve("Nope")).toThrow(
    'Cannot resolve unassigned token "Nope".'
  );
});

test("dependency instance equals direct resolve", () => {
  function Foo() {
    return {};
  }

  Bar.dependsOn = ["Foo"] as const;
  function Bar(foo: object) {
    return foo;
  }

  const c = startContainer()
    .define(Bar)
    .define(Foo)
    .assign("IFoo", Foo)
    .assign("IBar", Bar)
    .seal();

  const direct = c.resolve("IFoo");
  const indirect = c.resolve("IBar");
  expect(Object.is(direct, indirect)).toBeTruthy();
});
