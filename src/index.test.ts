import { expect, test } from "vitest";

import { createContainerDraft } from ".";

type T = {
  say(): string;
};

test("poc", async () => {
  foo.dependsOn = ["bar"] as const;
  foo.token = "foo" as const;

  function foo(bar: T): T {
    return {
      say: () => "foo",
    };
  }

  bar.dependsOn = ["foo"] as const;
  bar.token = "bar" as const;

  function bar(foo: () => T): T {
    return {
      say: () => {
        return foo().say();
      },
    };
  }

  expect(
    createContainerDraft()
      .defineLazy(foo)
      .assign(bar)
      .assign(foo)
      .seal()
      .resolve("bar")
      .say()
  ).toStrictEqual("foo");
});

test("many", async () => {
  foo.dependsOn = ["bar"] as const;
  foo.token = "foo" as const;

  function foo(bar: T[]): T {
    return {
      say: () => `foo: ${bar.length}`,
    };
  }

  bar1.dependsOn = ["foo"] as const;
  bar1.token = "bar" as const;

  function bar1(foo: () => T): T {
    return {
      say: () => {
        return foo().say();
      },
    };
  }

  bar2.dependsOn = ["foo"] as const;
  bar2.token = "bar" as const;

  function bar2(foo: () => T): T {
    return {
      say: () => {
        return foo().say();
      },
    };
  }

  const bars = createContainerDraft()
    .defineLazy(foo)
    .assignMany([bar1, bar2])
    .assign(foo)
    .seal()
    .resolve("bar");

  bars.forEach(({ say }) => {
    expect(say()).toStrictEqual("foo: 2");
  });
});

test("many hetero deps", async () => {
  foo.token = "foo" as const;
  foo.dependsOn = ["baz"] as const;

  function foo(baz: T[]): T {
    return {
      say: () => `foo: ${baz.length}`,
    };
  }

  bar.token = "bar" as const;

  function bar(): T {
    return {
      say: () => "bar",
    };
  }

  qux.token = "qux" as const;

  function qux(): T {
    return {
      say: () => "qux",
    };
  }

  baz1.dependsOn = ["foo", "bar"] as const;
  baz1.token = "baz" as const;

  function baz1(foo: () => T, bar: T): T {
    return {
      say: () => {
        return foo().say() + " " + bar.say();
      },
    };
  }

  baz2.dependsOn = ["foo", "qux"] as const;
  baz2.token = "baz" as const;

  function baz2(foo: () => T, qux: T): T {
    return {
      say: () => {
        return foo().say() + " " + qux.say();
      },
    };
  }

  const bars = createContainerDraft()
    .defineLazy(foo)
    .assign(qux)
    .assign(bar)
    .assignMany([baz1, baz2])
    .assign(foo)
    .seal()
    .resolve("baz");

  expect(bars.length).toStrictEqual(2);

  expect(bars[0].say()).toStrictEqual("foo: 2 bar");

  expect(bars[1].say()).toStrictEqual("foo: 2 qux");
});

// a depends on b; both are in the same batch ⇒ error
test("assignMany forbids in-batch deps", () => {
  function a(_: T): T {
    return { say: () => "a" };
  }
  a.dependsOn = ["b"] as const;
  a.token = "tk" as const;

  function b(): T {
    return { say: () => "b" };
  }
  b.token = "tk" as const;

  createContainerDraft()
    .assignMany([a, b])
    // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "b"; }
    .seal();

  createContainerDraft()
    .assignMany([b, a])
    // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "b"; }
    .seal();
});

test("assignMany passes when deps are provided outside the batch", () => {
  function a(_: () => T): T {
    return { say: () => "a" };
  }
  a.dependsOn = ["b"] as const;
  a.token = "a" as const;

  function b(): T {
    return { say: () => "b" };
  }
  b.token = "b" as const;

  createContainerDraft()
    .defineLazy(b) // dep provided *outside* the batch
    .assignMany([a]) // ok
    .assign(b) // or .assign later
    .seal();
});

test("assignMany(strict) fails if a depends on b in the same batch", () => {
  type T = { say(): string };

  function a(_: T): T {
    return { say: () => "a" };
  }
  a.dependsOn = ["b"] as const;
  a.token = "tk" as const;

  function b(): T {
    return { say: () => "b" };
  }
  b.token = "tk" as const;

  // Fails due to your IntraBatchError (forbid in-batch deps)
  createContainerDraft()
    .assignMany([a, b])
    // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "b"; }
    .seal();

  // Order doesn’t help (still in-batch)
  createContainerDraft()
    .assignMany([b, a])
    // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "b"; }
    .seal();
});

test("assignMany passes when dep is outside the batch (lazy before)", () => {
  type T = { say(): string };

  function a(_: () => T): T {
    return { say: () => "a" };
  }
  a.dependsOn = ["b"] as const;
  a.token = "a" as const;

  function b(): T {
    return { say: () => "b" };
  }
  b.token = "b" as const;

  createContainerDraft()
    .defineLazy(b) // makes "b" acceptable for a
    .assignMany([a]) // ok (no in-batch deps)
    .assign(b) // later assignment
    .seal(); // ok
});

test("seal fails when a lazy token is not assigned", () => {
  type T = { say(): string };

  function x(): T {
    return { say: () => "x" };
  }
  x.token = "x" as const;

  function y(): T {
    return { say: () => "y" };
  }
  y.token = "y" as const;

  // Lazy declared but never assigned → your SealResult error
  expect(() => {
    createContainerDraft().defineLazy(x).assign(y).seal();
  }).toThrow("lazy factory is not unassigned: x");
});

test("same-token multi-bind ok (no self-deps), returns array", () => {
  type T = { say(): string };

  function foo(): T {
    return { say: () => "foo" };
  }
  foo.token = "foo" as const;

  function bar1(_: () => T): T {
    return { say: () => "bar1" };
  }
  bar1.dependsOn = ["foo"] as const;
  bar1.token = "bar" as const;

  function bar2(_: () => T): T {
    return { say: () => "bar2" };
  }
  bar2.dependsOn = ["foo"] as const;
  bar2.token = "bar" as const;

  const bars = createContainerDraft()
    .defineLazy(foo)
    .assignMany([bar1, bar2]) // same token, no self-dep on "bar" → OK
    .assign(foo)
    .seal()
    .resolve("bar");

  bars.forEach((b) => b.say()); // typed as ReturnType<typeof bar1 | typeof bar2>[]
});

test("same-token batch is forbidden if any factory depends on the token itself", () => {
  type T = { say(): string };

  function bar1(_: T): T {
    return { say: () => "bar1" };
  }
  bar1.dependsOn = ["bar"] as const; // self/peer token
  bar1.token = "bar" as const;

  function bar2(): T {
    return { say: () => "bar2" };
  }
  bar2.token = "bar" as const;

  createContainerDraft()
    .assignMany([bar1, bar2])
    // @ts-expect-error { type: "error"; message: "assignMany forbids in-batch dependencies"; tokens: "bar" }
    .seal();
});
