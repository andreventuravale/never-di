import { expect, test, vi } from "vitest";

import { startContainer } from ".";

test("resolves a single binding", () => {
  fA.dependsOn = [] as const;
  function fA() {
    return 1;
  }

  fB.dependsOn = [] as const;
  function fB() {
    return "bee";
  }

  const c = startContainer().register("a", fA).register("b", fB).seal();

  expect(c.resolve("a")).toBe(1);
  expect(c.resolve("b")).toBe("bee");
});

test("registerMany resolves to an array preserving order", () => {
  f1.dependsOn = [] as const;
  function f1() {
    return "x1";
  }

  f2.dependsOn = [] as const;
  function f2() {
    return "x2";
  }

  const c = startContainer().registerMany("xs", [f1, f2]).seal();

  expect(c.resolve("xs")).toEqual(["x1", "x2"]);
});

test("bind() resolves dependencies and returns a callable", () => {
  fA.dependsOn = [] as const;
  function fA() {
    return 2;
  }

  fB.dependsOn = ["a"] as const;
  function fB(a: number) {
    return `b:${a * 3}`;
  }

  fMake.dependsOn = ["a", "b"] as const;
  function fMake(a: number, b: string) {
    return `${b}|a=${a}`;
  }

  const c = startContainer().register("a", fA).register("b", fB).seal();

  const make = c.bind(fMake);
  expect(make()).toBe("b:6|a=2");
});

test("throws on unregistered token", () => {
  const c = startContainer().seal();
  // @ts-expect-error
  expect(() => c.resolve("missing")).toThrowError(
    /token is not registered: missing/
  );
});

test("detects cycles and prints a readable path", () => {
  fA.dependsOn = ["b"] as const;
  function fA() {
    return "a";
  }

  fB.dependsOn = ["a"] as const;
  function fB() {
    return "b";
  }

  const c = startContainer().register("a", fA).register("b", fB).seal();

  expect(() => c.resolve("a")).toThrowError(/cycle detected: a > b > a/);
});

test("per-container cache: computing a token happens once across resolves", () => {
  const spy = vi.fn().mockImplementation(() => 42);
  fX.dependsOn = [] as const;
  function fX() {
    return spy();
  }

  const c = startContainer().register("x", fX).seal();

  expect(c.resolve("x")).toBe(42);
  expect(c.resolve("x")).toBe(42);
  expect(spy).toHaveBeenCalledTimes(1);
});

test("shared dependency is computed once even when resolving multiple dependents", () => {
  const baseSpy = vi.fn().mockImplementation(() => 10);
  fBase.dependsOn = [] as const;
  function fBase() {
    return baseSpy();
  }

  fX.dependsOn = ["base"] as const;
  function fX(b: number) {
    return b + 1;
  }

  fY.dependsOn = ["base"] as const;
  function fY(b: number) {
    return b + 2;
  }

  const c = startContainer()
    .register("base", fBase)
    .register("x", fX)
    .register("y", fY)
    .seal();

  expect(c.resolve("x")).toBe(11);
  expect(c.resolve("y")).toBe(12);
  expect(baseSpy).toHaveBeenCalledTimes(1);
});

test("bind() preflight throws on unregistered dependency", () => {
  fNeedsZ.dependsOn = ["zzz"] as const;
  function fNeedsZ(z: unknown) {
    return z;
  }

  const c = startContainer().seal();
  // @ts-expect-error
  expect(() => c.bind(fNeedsZ)).toThrowError(
    /unregistered dependency in bind\(\): zzz/
  );
});

test("register vs registerMany: last call wins (single after many)", () => {
  f1.dependsOn = [] as const;
  function f1() {
    return "a1";
  }

  f2.dependsOn = [] as const;
  function f2() {
    return "a2";
  }

  fSingle.dependsOn = [] as const;
  function fSingle() {
    return "only";
  }

  const c = startContainer()
    .registerMany("a", [f1, f2])
    .register("a", fSingle)
    .seal();

  expect(c.resolve("a")).toBe("only");
});

test("register vs registerMany: last call wins (many after single)", () => {
  fSingle.dependsOn = [] as const;
  function fSingle() {
    return "only";
  }

  f1.dependsOn = [] as const;
  function f1() {
    return "a1";
  }

  f2.dependsOn = [] as const;
  function f2() {
    return "a2";
  }

  const c = startContainer()
    .register("a", fSingle)
    .registerMany("a", [f1, f2])
    .seal();

  expect(c.resolve("a")).toEqual(["a1", "a2"]);
});

test("registerMany with an empty array makes the token unresolved (throws on resolve)", () => {
  const c = startContainer().registerMany("empty", []).seal();
  expect(() => c.resolve("empty")).toThrowError(
    /token is not registered: empty/
  );
});

test("error lists known tokens when missing", () => {
  fA.dependsOn = [] as const;
  function fA() {
    return 1;
  }

  const c = startContainer().register("a", fA).seal();

  // @ts-expect-error
  expect(() => c.resolve("b")).toThrowError(/Known: a/);
});
