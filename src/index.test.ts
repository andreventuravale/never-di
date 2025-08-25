import { expect, test } from "vitest";

import { startContainer } from ".";

test.only("define collects metadata without validating deps", () => {
  Foo.dependsOn = ["Missing"] as const;
  Foo.mode = "eager" as const;
  function Foo() {
    return "foo";
  }

  const draft = startContainer().define(Foo);
  expect(draft).toBeTruthy();
});

// 2) duplicate define (same function) throws
test("duplicate define throws", () => {
  A.mode = "eager" as const;
  function A() {
    return 1;
  }

  const draft = startContainer().define(A);
  expect(() => draft.define(A)).toThrow('Factory "A" already defined.');
});

// 4) assign of a factory that was never defined throws
test("assigning an undefined factory throws", () => {
  Undef.mode = "eager" as const;
  function Undef() {
    return 0;
  }

  const draft = startContainer();
  expect(() => draft.assign("IUndef", Undef)).toThrow(
    'Factory "Undef" was not defined.'
  );
});

// 5) reassigning the same token throws
test("reassigning same token throws", () => {
  Foo.mode = "eager" as const;
  function Foo() {
    return 1;
  }

  const draft = startContainer().define(Foo).assign("IFoo", Foo);
  expect(() => draft.assign("IFoo", Foo)).toThrow(
    'Token "IFoo" is already assigned.'
  );
});

// 6) the same factory cannot be assigned twice under different tokens
test("same factory cannot be assigned twice", () => {
  Foo.mode = "eager" as const;
  function Foo() {
    return 1;
  }

  const draft = startContainer().define(Foo).assign("IFoo", Foo);
  expect(() => draft.assign("IBar", Foo)).toThrow(
    'Factory "Foo" is already assigned to token "IFoo".'
  );
});

// 7) assign with no deps and resolve
test("assign with no deps resolves value", () => {
  Foo.mode = "eager" as const;
  function Foo() {
    return 7;
  }

  const container = startContainer().define(Foo).assign("IFoo", Foo).seal();
  expect(container.resolve("IFoo")).toBe(7);
});

// 8) resolve on unassigned token throws
test("resolve on unassigned token throws", () => {
  Foo.mode = "eager" as const;
  function Foo() {
    return 7;
  }
  const container = startContainer().define(Foo).assign("Foo", Foo).seal();
  expect(() => container.resolve("Nope" as unknown as never)).toThrow(
    'Cannot resolve unassigned token "Nope".'
  );
});

// 9) singleton: resolve caches same instance
test("resolve caches same instance", () => {
  Foo.mode = "eager" as const;
  function Foo() {
    return {};
  }

  const c = startContainer().define(Foo).assign("IFoo", Foo).seal();
  const x = c.resolve("IFoo");
  const y = c.resolve("IFoo");
  expect(Object.is(x, y)).toBeTruthy();
});

// 10) eager dependency is passed as value
test("eager dependency is passed as value", () => {
  Foo.mode = "eager" as const;
  function Foo() {
    return { kind: "B" as const };
  }

  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "eager" as const;
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

// 11) lazy dependency is passed as thunk
test("lazy dependency is passed as thunk", () => {
  Foo.mode = "lazy" as const;
  function Foo() {
    return { kind: "B" as const };
  }

  let seenType = "";
  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "eager" as const;
  function Bar(bThunk: () => { kind: "B" }) {
    seenType = typeof bThunk;
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

// 12) lazy thunk returns the same cached instance
test("lazy thunk returns the same cached instance", () => {
  Foo.mode = "lazy" as const;
  function Foo() {
    return {};
  }

  let captured!: () => object;
  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "eager" as const;
  function Bar(bThunk: () => object) {
    captured = bThunk;
    return {};
  }

  const c = startContainer()
    .define(Bar)
    .define(Foo)
    .assign("IBar", Bar)
    .assign("IFoo", Foo)
    .seal();

  c.resolve("IBar");
  const b1 = captured();
  const b2 = captured();
  expect(b1).toBe(b2);
});

// 13) eager–eager cycle throws on resolve
test("eager-eager direct cycle throws on resolve", () => {
  Foo.dependsOn = ["Bar"] as const;
  Foo.mode = "eager" as const;
  function Foo(bar: { k: "Bar" }) {
    return { k: "Foo" as const };
  }

  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "eager" as const;
  function Bar(foo: { k: "Foo" }) {
    return { k: "Bar" as const };
  }

  const c = startContainer()
    .define(Foo)
    .define(Bar)
    .assign("IFoo", Foo)
    .assign("IBar", Bar)
    .seal();

  expect(() => c.resolve("IFoo")).toThrow(/cyclic dependency/i);
});

// 14) lazy breaks direct cycle when thunk used after caching
test("lazy breaks direct cycle when thunk used after caching", () => {
  type FooT = { kind: "Foo"; getBar: () => { kind: "Bar" } };

  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "lazy" as const;
  function Bar(_foo: FooT) {
    return { kind: "Bar" as const };
  }

  let barThunk!: () => { kind: "Bar" };
  Foo.dependsOn = ["Bar"] as const;
  Foo.mode = "eager" as const;
  function Foo(bThunk: () => { kind: "Bar" }) {
    barThunk = bThunk; // do not call yet
    return { kind: "Foo", getBar: () => bThunk() };
  }

  const c = startContainer()
    .define(Foo)
    .define(Bar)
    .assign("IFoo", Foo) // allowed: Bar is lazy
    .assign("IBar", Bar)
    .seal();

  const foo = c.resolve("IFoo");
  const bar = foo.getBar();
  expect(bar).toEqual({ kind: "Bar" });
});

// 15) calling lazy thunk before provider is assigned throws
test("calling lazy thunk before provider is assigned throws", () => {
  Bar.mode = "lazy" as const;
  function Bar() {
    return {};
  }

  let captured!: () => unknown;
  Foo.dependsOn = ["Bar"] as const;
  Foo.mode = "eager" as const;
  function Foo(bThunk: () => unknown) {
    captured = bThunk;
    return {};
  }

  const phase = startContainer()
    .define(Foo)
    .define(Bar)
    .assign("IFoo", Foo); // Bar not assigned yet

  const c = phase.seal();
  c.resolve("IFoo");
  expect(() => captured()).toThrow(/unassigned token "Bar"/i);
});

// 16) assign fails when dep is not assigned and not lazy
test("assign fails when dep not assigned and not lazy", () => {
  Foo.dependsOn = ["Bar"] as const;
  Foo.mode = "eager" as const;
  function Foo() {
    return "A";
  }

  Bar.mode = "eager" as const;
  function Bar() {
    return "B";
  }

  const d = startContainer().define(Foo).define(Bar);
  expect(() => d.assign("IFoo", Foo)).toThrow(
    /dependency "Bar".*neither assigned nor defined as lazy/i
  );
});

// 17) assign succeeds when dependency provider is defined as lazy
test("assign succeeds when dep provider is lazy-defined", () => {
  Foo.dependsOn = ["Bar"] as const;
  Foo.mode = "eager" as const;
  function Foo() {
    return "A";
  }

  Bar.mode = "lazy" as const;
  function Bar() {
    return "B";
  }

  const d = startContainer().define(Foo).define(Bar);
  expect(() => d.assign("IFoo", Foo)).not.toThrow();
});

// 18) mapping by factory name works with different external tokens
test("dependsOn by factory name works regardless of external tokens", () => {
  Provider.mode = "eager" as const;
  function Provider() {
    return 42;
  }

  Consumer.dependsOn = ["Provider"] as const; // by factory name
  Consumer.mode = "eager" as const;
  function Consumer(x: number) {
    return x + 1;
  }

  const c = startContainer()
    .define(Provider)
    .define(Consumer)
    .assign("NumberSource", Provider) // external token differs from "Provider"
    .assign("Adder", Consumer)
    .seal();

  expect(c.resolve("Adder")).toBe(43);
});

// 19) bind returns a callable that produces a value
test("bind returns a callable that produces a value", () => {
  Foo.mode = "eager" as const;
  function Foo() {
    return 41;
  }

  const c = startContainer().define(Foo).assign("IFoo", Foo).seal();

  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "eager" as const;
  function Bar(a: number) {
    return a + 1;
  }

  const fn = c.bind(Bar);
  expect(fn()).toBe(42);
});

// 20) bind wires eager deps as values
test("bind wires eager deps as values", () => {
  Foo.mode = "eager" as const;
  function Foo() {
    return 2;
  }

  const c = startContainer().define(Foo).assign("IFoo", Foo).seal();

  let seen: number | undefined;
  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "eager" as const;
  function Bar(a: number) {
    seen = a;
    return 0;
  }

  c.bind(Bar)();
  expect(seen).toBe(2);
});

// 21) bind wires lazy deps as thunks
test("bind wires lazy deps as thunks", () => {
  Foo.mode = "lazy" as const;
  function Foo() {
    return 5;
  }

  const c = startContainer().define(Foo).assign("IFoo", Foo).seal();

  let argType = "";
  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "eager" as const;
  function Bar(aThunk: () => number) {
    argType = typeof aThunk;
    return 0;
  }

  c.bind(Bar)();
  expect(argType).toBe("function");
});

// 22) resolve error mentions token name
test("resolve error mentions token name", () => {
  const c = startContainer().seal();
  expect(() => c.resolve("Nope" as unknown as never)).toThrow(
    /unassigned token "Nope"/i
  );
});

// 23) dependency instance equals direct resolve (singleton propagation)
test("dependency instance equals direct resolve", () => {
  Foo.mode = "eager" as const;
  function Foo() {
    return {};
  }

  Bar.dependsOn = ["Foo"] as const;
  Bar.mode = "eager" as const;
  function Bar(b: object) {
    return b;
  }

  const c = startContainer()
    .define(Bar)
    .define(Foo)
    .assign("IFoo", Foo)
    .assign("IBar", Bar)
    .seal();

  const bDirect = c.resolve("IFoo");
  const bViaA = c.resolve("IBar");
  expect(bViaA).toBe(bDirect);
});
