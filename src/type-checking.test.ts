import { expect, test } from "vitest";

import { typecheck } from "./typecheck";

test("resolve requires known token", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Foo.token = "IFoo" as const;
      function Foo() { return 1; }

      const c = createContainerDraft().assign(Foo).seal();

      c.resolve("Nope");
    `,
  });

  expect(result).toReportError(
    2345,
    `Argument of type '"Nope"' is not assignable to parameter of type '"IFoo"'`
  );
});

test("resolve result type flows (misuse as string)", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Foo.token = "IFoo" as const;
      function Foo() { return 123; }

      const c = createContainerDraft().assign(Foo).seal();

      const x = c.resolve("IFoo"); // number

      x.toUpperCase(); // misuse
    `,
  });

  expect(result).toReportError(
    2339,
    `Property 'toUpperCase' does not exist on type 'number'`
  );
});

test("bind rejects wrong dep type", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Foo.token = "IFoo" as const;
      function Foo(): number { return 42; }

      UseFoo.token = "IUseFoo" as const;
      UseFoo.dependsOn = ["IFoo"] as const;
      function UseFoo(foo: string) { return foo.length; }
      
      const c = createContainerDraft().assign(Foo).seal();

      c.bind(UseFoo)(); // expects number from IFoo, got string
    `,
  });

  expect(result).toReportError(
    2349,
    `
      Type '{
        type: "error";
        message: "dependencies type mismatch (lazy ones must be thunks)";
        dependent: "IUseFoo";
        dependencies: readonly ["IFoo"];
      }' has no call signatures.
    `
  );
});

test("bind detects tuple arg mismatch", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Foo.token = "IFoo" as const;
      function Foo() { return 1; }

      Bar.token = "IBar" as const;
      function Bar() { return "s"; }

      const c = createContainerDraft()
        .assign(Foo)
        .assign(Bar)
        .seal();

      Use.dependsOn = ["IFoo", "IBar"] as const; // expected [number, string]
      function Use(foo: string, bar: number) { return foo + bar; }

      c.bind(Use)();
    `,
  });

  expect(result).toReportError(
    2349,
    `
      This expression is not callable.
      Type '{
        type: "error";
        message: "dependencies type mismatch (lazy ones must be thunks)";
        dependent: never;
        dependencies: readonly ["IFoo", "IBar"];
      }' has no call signatures.
    `
  );
});

test("bind unknown token in dependsOn", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Foo.token = "IFoo" as const;
      function Foo() { return 1; }

      const c = createContainerDraft().assign(Foo).seal();

      Use.dependsOn = ["Nope"] as const;
      function Use(nope: number) { return nope + 1; }

      c.bind(Use)();
    `,
  });

  expect(result).toReportError(
    2349,
    `
      This expression is not callable.
      Type '{
        type: "error";
        message: "procedure has dependencies that are not assigned";
        unassigned_dependencies: "Nope";
      }' has no call signatures.
    `
  );
});

test("assign requires eager deps to be already assigned", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Dep.token = "IDep" as const;
      function Dep() { return 1; }

      Use.token = "IUse" as const;
      Use.dependsOn = ["IDep", "Missing"] as const; // 'Missing' not assigned
      function Use(a: number, b: number) { return a + b; }

      const phase = createContainerDraft().assign(Dep);

      const next = phase.assign(Use); // error-typed
      next.seal();                    // should fail (no 'seal' on error type)
    `,
  });

  expect(result).toReportError(
    2339,
    `Property 'seal' does not exist on type '{ type: "error"; message: "factory has dependencies that are not assigned"`
  );
});

test("bind with lazy dependency requires thunk parameter", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Foo.token = "IFoo" as const;
      function Foo() { return 10; }

      const c = createContainerDraft()
        .defineLazy(Foo)  // IFoo is lazy → param should be () => number
        .assign(Foo)
        .seal();

      Use.dependsOn = ["IFoo"] as const;
      function Use(foo: number) { return foo + 1; }

      c.bind(Use)(); // should be '() => number' but got 'number'
    `,
  });

  expect(result).toReportError(
    2349,
    `
      This expression is not callable.
      Type '{ type: "error"; message: "dependencies type mismatch (lazy ones must be thunks)"; dependent: never; dependencies: readonly ["IFoo"]; }' has no call signatures.
    `
  );
});

// TODO: defineLazy should enforce that the factory has a .lazy = true as const property

test("resolve of lazy token returns a thunk (misused as value)", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Foo.token = "IFoo" as const;
      function Foo() { return 7; }

      const c = createContainerDraft()
        .defineLazy(Foo)
        .assign(Foo)
        .seal();

      const x = c.resolve("IFoo"); // () => number
      const y = x + 1;             // misuse
    `,
  });

  expect(result).toReportError(
    2365,
    `Operator '+' cannot be applied to types '() => number' and 'number'`
  );
});

test("bind lazy dep + tuple mismatch (thunk position/type)", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Foo.token = "IFoo" as const;
      function Foo() { return 1; }

      Bar.token = "IBar" as const;
      function Bar() { return "abc"; }

      const c = createContainerDraft()
        .defineLazy(Foo)   // IFoo is lazy → param is () => number
        .assign(Foo)
        .assign(Bar)
        .seal();

      Use.dependsOn = ["IFoo", "IBar"] as const; // expected [() => number, string]
      function Use(first: string, second: () => number) {
        return first + second();
      }

      c.bind(Use)();
    `,
  });

  expect(result).toReportError(
    2349,
    `
      This expression is not callable.
      Type '{ type: "error"; message: "dependencies type mismatch (lazy ones must be thunks)"; dependent: never; dependencies: readonly ["IFoo", "IBar"]; }' has no call signatures
    `
  );
});

test("resolve eager token is value, not function", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      Foo.token = "IFoo" as const;
      function Foo() { return "ok"; }

      const c = createContainerDraft().assign(Foo).seal();

      const val = c.resolve("IFoo"); // string
      val();                         // misuse
    `,
  });

  expect(result).toReportError(2349, `This expression is not callable`);
});

test("assignMany forbids in-batch dependencies", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      A.token = "IA" as const;
      function A() { return 1; }

      B.token = "IB" as const;
      B.dependsOn = ["IA"] as const; // depends on in-batch token
      function B() { return 2; }

      const phase = createContainerDraft();

      const next = phase.assignMany([A, B]); // error-typed
      next.seal();                            // should fail
    `,
  });

  expect(result).toReportError(
    2339,
    `Property 'seal' does not exist on type '{ type: "error"; message: "assignMany forbids in-batch dependencies"`
  );
});

test("resolve multi-bind returns array (misuse as string)", async () => {
  const result = await typecheck({
    "case.ts": `
      import { createContainerDraft } from ".";

      One.token = "IThing" as const;
      function One() { return 1; }

      Two.token = "IThing" as const;
      function Two() { return 2; }

      const c = createContainerDraft()
        .assignMany([One, Two])
        .seal();

      const val = c.resolve("IThing"); // number[]
      val.toUpperCase();               // misuse
    `,
  });

  expect(result).toReportError(
    2339,
    `Property 'toUpperCase' does not exist on type 'number[]'`
  );
});
