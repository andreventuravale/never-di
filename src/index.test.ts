// di.two-phase.flat.test.ts
import { test, expect } from "vitest";
import { startContainer } from "."; // ← adjust

// 1) define collects metadata without validating deps
test.only("define collects metadata without validating deps", () => {
  Foo.dependsOn = ["Missing"] as const; // allowed: define phase doesn't validate
  Foo.mode = "eager" as const;
  function Foo() { return "foo"; }

  const builder = startContainer().define(Foo);
  expect(builder).toBeTruthy();
});

// 2) duplicate define (same function) throws
test.only("duplicate define throws", () => {
  A.mode = "eager" as const;
  function A() { return 1; }

  const b = startContainer().define(A);
  expect(() => b.define(A)).toThrow(/already defined/i);
});

// 4) assign of a factory that was never defined throws
test.only("assigning an undefined factory throws", () => {
  Undef.mode = "eager" as const;
  function Undef() { return 0; }

  const b = startContainer();
  expect(() => b.assign("IUndef", Undef)).toThrow(/was not defined/i);
});

// 5) reassigning the same token throws
test.only("reassigning same token throws", () => {
  A2.mode = "eager" as const;
  function A2() { return 1; }

  const p = startContainer().define(A2).assign("IA2", A2);
  expect(() => p.assign("IA2", A2)).toThrow(/already assigned/i);
});

// 6) the same factory cannot be assigned twice under different tokens
test.only("same factory cannot be assigned twice", () => {
  A3.mode = "eager" as const;
  function A3() { return 1; }

  const p = startContainer().define(A3).assign("IA3", A3);
  expect(() => p.assign("IA3B", A3)).toThrow(/already assigned to token/i);
});

// 7) assign with no deps and resolve
test.only("assign with no deps resolves value", () => {
  A4.mode = "eager" as const;
  function A4() { return 7; }

  const c = startContainer().define(A4).assign("IA4", A4).seal();
  expect(c.resolve("IA4")).toBe(7);
});

// 8) resolve on unassigned token throws
test.only("resolve on unassigned token throws", () => {
  A4.mode = "eager" as const;
  function A4() { return 7; }
  const c = startContainer().define(A4).assign("A4", A4).seal();
  expect(() => c.resolve("Nope" as unknown as never)).toThrow(/unassigned token "Nope"/i);
});

// 9) singleton: resolve caches same instance
test.only("resolve caches same instance", () => {
  A5.mode = "eager" as const;
  function A5() { return {}; }

  const c = startContainer().define(A5).assign("IA5", A5).seal();
  const x = c.resolve("IA5");
  const y = c.resolve("IA5");
  expect(x).toBe(y);
});

// 10) eager dependency is passed as value
test.only("eager dependency is passed as value", () => {
  B6.mode = "eager" as const;
  function B6() { return { kind: "B" as const }; }

  A6.dependsOn = ["B6"] as const;
  A6.mode = "eager" as const;
  function A6(b: { kind: "B" }) { return b; }

  const c = startContainer()
    .define(A6)
    .define(B6)
    .assign("IB6", B6)
    .assign("IA6", A6)
    .seal();

  expect(c.resolve("IA6")).toEqual({ kind: "B" });
});

// 11) lazy dependency is passed as thunk
test.only("lazy dependency is passed as thunk", () => {
  B7.mode = "lazy" as const;
  function B7() { return { kind: "B" as const }; }

  let seenType = "";
  A7.dependsOn = ["B7"] as const;
  A7.mode = "eager" as const;
  function A7(bThunk: () => { kind: "B" }) {
    seenType = typeof bThunk;
    return { kind: "A" as const };
  }

  const c = startContainer()
    .define(A7)
    .define(B7)
    .assign("IA7", A7)
    .assign("IB7", B7)
    .seal();

  c.resolve("IA7");
  expect(seenType).toBe("function");
});

// 12) lazy thunk returns the same cached instance
test.only("lazy thunk returns the same cached instance", () => {
  B8.mode = "lazy" as const;
  function B8() { return {}; }

  let captured!: () => object;
  A8.dependsOn = ["B8"] as const;
  A8.mode = "eager" as const;
  function A8(bThunk: () => object) {
    captured = bThunk;
    return {};
  }

  const c = startContainer()
    .define(A8)
    .define(B8)
    .assign("IA8", A8)
    .assign("IB8", B8)
    .seal();

  c.resolve("IA8");
  const b1 = captured();
  const b2 = captured();
  expect(b1).toBe(b2);
});

// 13) eager–eager cycle throws on resolve
test("eager-eager direct cycle throws on resolve", () => {
  Foo9.dependsOn = ["Bar9"] as const;
  Foo9.mode = "eager" as const;
  function Foo9(bar: { k: "Bar" }) { return { k: "Foo" as const }; }

  Bar9.dependsOn = ["Foo9"] as const;
  Bar9.mode = "eager" as const;
  function Bar9(foo: { k: "Foo" }) { return { k: "Bar" as const }; }

  const c = startContainer()
    .define(Foo9)
    .define(Bar9)
    .assign("IFoo9", Foo9)
    .assign("IBar9", Bar9)
    .seal();

  expect(() => c.resolve("IFoo9")).toThrow(/cyclic dependency/i);
});

// 14) lazy breaks direct cycle when thunk used after caching
test.only("lazy breaks direct cycle when thunk used after caching", () => {
  type FooT = { kind: "Foo"; getBar: () => { kind: "Bar" } };

  Bar10.dependsOn = ["Foo10"] as const;
  Bar10.mode = "lazy" as const;
  function Bar10(_foo: FooT) { return { kind: "Bar" as const }; }

  let barThunk!: () => { kind: "Bar" };
  Foo10.dependsOn = ["Bar10"] as const;
  Foo10.mode = "eager" as const;
  function Foo10(bThunk: () => { kind: "Bar" }) {
    barThunk = bThunk; // do not call yet
    return { kind: "Foo", getBar: () => bThunk() };
  }

  const c = startContainer()
    .define(Foo10)
    .define(Bar10)
    .assign("IFoo10", Foo10) // allowed: Bar10 is lazy
    .assign("IBar10", Bar10)
    .seal();

  const foo = c.resolve("IFoo10");
  const bar = foo.getBar();
  expect(bar).toEqual({ kind: "Bar" });
});

// 15) calling lazy thunk before provider is assigned throws
test("calling lazy thunk before provider is assigned throws", () => {
  Bar11.mode = "lazy" as const;
  function Bar11() { return {}; }

  let captured!: () => unknown;
  Foo11.dependsOn = ["Bar11"] as const;
  Foo11.mode = "eager" as const;
  function Foo11(bThunk: () => unknown) {
    captured = bThunk;
    return {};
  }

  const phase = startContainer()
    .define(Foo11)
    .define(Bar11)
    .assign("IFoo11", Foo11); // Bar11 not assigned yet

  const c = phase.seal();
  c.resolve("IFoo11");
  expect(() => captured()).toThrow(/unassigned token "Bar11"/i);
});

// 16) assign fails when dep is not assigned and not lazy
test.only("assign fails when dep not assigned and not lazy", () => {
  A12.dependsOn = ["B12"] as const;
  A12.mode = "eager" as const;
  function A12() { return "A"; }

  B12.mode = "eager" as const;
  function B12() { return "B"; }

  const d = startContainer().define(A12).define(B12);
  expect(() => d.assign("IA12", A12)).toThrow(/dependency "B12".*neither assigned nor defined as lazy/i);
});

// 17) assign succeeds when dependency provider is defined as lazy
test.only("assign succeeds when dep provider is lazy-defined", () => {
  A13.dependsOn = ["B13"] as const;
  A13.mode = "eager" as const;
  function A13() { return "A"; }

  B13.mode = "lazy" as const;
  function B13() { return "B"; }

  const d = startContainer().define(A13).define(B13);
  expect(() => d.assign("IA13", A13)).not.toThrow();
});

// 18) mapping by factory name works with different external tokens
test.only("dependsOn by factory name works regardless of external tokens", () => {
  Provider.mode = "eager" as const;
  function Provider() { return 42; }

  Consumer.dependsOn = ["Provider"] as const; // by factory name
  Consumer.mode = "eager" as const;
  function Consumer(x: number) { return x + 1; }

  const c = startContainer()
    .define(Provider)
    .define(Consumer)
    .assign("NumberSource", Provider) // external token differs from "Provider"
    .assign("Adder", Consumer)
    .seal();

  expect(c.resolve("Adder")).toBe(43);
});

// 19) bind returns a callable that produces a value
test.only("bind returns a callable that produces a value", () => {
  A14.mode = "eager" as const;
  function A14() { return 41; }

  const c = startContainer().define(A14).assign("IA14", A14).seal();

  PlusOne.dependsOn = ["A14"] as const;
  PlusOne.mode = "eager" as const;
  function PlusOne(a: number) { return a + 1; }

  const fn = c.bind(PlusOne);
  expect(fn()).toBe(42);
});

// 20) bind wires eager deps as values
test.only("bind wires eager deps as values", () => {
  A15.mode = "eager" as const;
  function A15() { return 2; }

  const c = startContainer().define(A15).assign("IA15", A15).seal();

  let seen: number | undefined;
  UseA.dependsOn = ["A15"] as const;
  UseA.mode = "eager" as const;
  function UseA(a: number) { seen = a; return 0; }

  c.bind(UseA)();
  expect(seen).toBe(2);
});

// 21) bind wires lazy deps as thunks
test.only("bind wires lazy deps as thunks", () => {
  A16.mode = "lazy" as const;
  function A16() { return 5; }

  const c = startContainer().define(A16).assign("IA16", A16).seal();

  let argType = "";
  UseALazy.dependsOn = ["A16"] as const;
  UseALazy.mode = "eager" as const;
  function UseALazy(aThunk: () => number) { argType = typeof aThunk; return 0; }

  c.bind(UseALazy)();
  expect(argType).toBe("function");
});

// 22) resolve error mentions token name
test("resolve error mentions token name", () => {
  const c = startContainer().seal();
  expect(() => c.resolve("Nope" as unknown as never)).toThrow(/unassigned token "Nope"/i);
});

// 23) dependency instance equals direct resolve (singleton propagation)
test.only("dependency instance equals direct resolve", () => {
  B17.mode = "eager" as const;
  function B17() { return {}; }

  A17.dependsOn = ["B17"] as const;
  A17.mode = "eager" as const;
  function A17(b: object) { return b; }

  const c = startContainer()
    .define(A17)
    .define(B17)
    .assign("IB17", B17)
    .assign("IA17", A17)
    .seal();

  const bDirect = c.resolve("IB17");
  const bViaA = c.resolve("IA17");
  expect(bViaA).toBe(bDirect);
});
