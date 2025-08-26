import { expect, test } from "vitest";

import { startContainer } from ".";
import { typecheck } from "./typecheck";

test("resolve requires known token", async () => {
  const result = await typecheck({
    "case.ts": `
      import { startContainer } from ".";
      function Foo() { return 1; }
      const c = startContainer().define(Foo).assign("IFoo", Foo).seal();
      c.resolve("Nope");
    `,
  });
  expect(result).toReportError(
    2345,
    `
      Argument of type '"Nope"' is not assignable to parameter of type '"IFoo"'.
    `
  );
});

test("resolve result type flows", async () => {
  const result = await typecheck({
    "case.ts": `
      import { startContainer } from ".";
      function Foo() { return 123; }
      const c = startContainer().define(Foo).assign("IFoo", Foo).seal();
      const x = c.resolve("IFoo");
      x.toUpperCase();
    `,
  });
  expect(result).toReportError(
    2339,
    `
      Property 'toUpperCase' does not exist on type 'number & __Meta<() => number, readonly []>'.
    `
  );
});

test("bind rejects wrong dep type", async () => {
  const result = await typecheck({
    "case.ts": `
      import { startContainer } from ".";
      function Foo() { return 42; }
      const c = startContainer().define(Foo).assign("IFoo", Foo).seal();

      function UseFoo(a: string) { return a.length; }
      UseFoo.dependsOn = ["IFoo"] as const;

      c.bind(UseFoo);
    `,
  });
  expect(result).toReportError(
    2345,
    `
      Types of parameters 'a' and 'args_0' are incompatible.
      Type 'number & __Meta<() => number, readonly []>' is not assignable to type 'string'.
    `
  );
});

test("bind detects tuple arg mismatch", async () => {
  const result = await typecheck({
    "case.ts": `
      import { startContainer } from ".";
      function Foo() { return 1; }
      function Bar() { return "s"; }
      const c = startContainer()
        .define(Foo)
        .define(Bar)
        .assign("IFoo", Foo)
        .assign("IBar", Bar)
        .seal();

      Use.dependsOn = ["IFoo","IBar"] as const;

      function Use(foo: string, bar: number) { return foo + bar; }

      c.bind(Use);
    `,
  });

  expect(result).toReportError(
    2345,
    `
      Argument of type 'typeof Use' is not assignable to parameter of type 'Factory<string, readonly [number & __Meta<() => number, readonly []>, string & __Meta<() => string, readonly []>], readonly ["IFoo", "IBar"]>'.
      Types of parameters 'foo' and 'args_0' are incompatible.
      Type 'number & __Meta<() => number, readonly []>' is not assignable to type 'string'.
    `
  );
});

test("bind unknown token in dependsOn", async () => {
  const result = await typecheck({
    "case.ts": `
      import { startContainer } from ".";
      function Foo() { return 1; }
      const c = startContainer().define(Foo).assign("IFoo", Foo).seal();

      Use.dependsOn = ["Nope"] as const;
      function Use(nope: number) { return nope + 1; }

      c.bind(Use);
    `,
  });
  expect(result).toReportError(
    2322,
    `
      Argument of type '{ (nope: number): number; dependsOn: readonly ["Nope"]; }' is not assignable to parameter of type 'Factory<number, readonly (number & __Meta<() => number, readonly []>)[], readonly "IFoo"[]>'.
      Types of property 'dependsOn' are incompatible.
      Type 'readonly ["Nope"]' is not assignable to type 'readonly "IFoo"[]'.
      Type '"Nope"' is not assignable to type '"IFoo"'.ts(2345)
    `
  );
});

test("assign requires eager deps to be already assigned", async () => {
  function Foo() {
    return 1;
  }

  Baz.dependsOn = ["IFoo", "IBar"] as const;
  function Baz(foo: number, bar: number) {
    return foo + bar;
  }

  const phase = startContainer()
    .define(Foo)
    .define(Baz)
    .assign("IFoo", Foo)
    .assign("IBaz", Baz)

  // const result = await typecheck({
  //   "case.ts": `
  //     import { startContainer } from ".";

  //     function Dep() { return 1; }
  //     const phase = startContainer()
  //       .define(Dep)
  //       .assign("IDep", Dep); // only "IDep" is in the registry

  //     // Eager factory that (incorrectly) claims another token "Missing"
  //     Use.dependsOn = ["IDep", "Missing"] as const;
  //     function Use(a: number, b: number) { return a + b; }

  //     // Should fail: "Missing" is not a known token in the assigned registry
  //     phase.assign("IUse", Use);
  //   `,
  // });

  // // We assert the key part of the diagnostic so it’s robust across TS minor versions
  // expect(result).toReportError(
  //   2345,
  //   `
  //     Argument of type 'typeof Use' is not assignable to parameter of type 'Factory<number, readonly (number & __Meta<() => number, readonly []>)[], readonly "IFoo"[]>'.
  //     Types of property 'dependsOn' are incompatible.
  //     Type 'readonly ["Nope"]' is not assignable to type 'readonly "IFoo"[]'.
  //     Type '"Nope"' is not assignable to type '"IFoo"'.
  //   `
  // );
});
