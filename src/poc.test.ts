import { expect, test } from "vitest";

interface Metadata {
  readonly dependsOn?: readonly string[];
  readonly lazy?: true;
  readonly token?: string;
}

interface Factory<T = any, Args extends any[] = any[]> extends Metadata {
  (...args: Args): T;
}

interface DefineApi<Registry = {}> {
  defineLazy(f: Factory): Stage2<Registry>;
  defineLazyMany(f: Factory[]): Stage2<Registry>;
}

interface AssignApi<Registry = {}> {
  assign(f: Factory): Stage3<Registry>;
  assignMany(f: Factory[]): Stage3<Registry>;
}

interface Stage1<Registry = {}> extends DefineApi<Registry> {}

interface Stage2<Registry = {}>
  extends DefineApi<Registry>,
    AssignApi<Registry> {}

interface Stage3<Registry = {}> extends AssignApi<Registry> {
  seal(): Container<Registry>;
}

interface Container<Registry = {}> {
  resolve<T extends keyof Registry>(token: string): Registry[T];
}

function createContainerDraft(): Stage1 {
  return {
    defineLazy,
    defineLazyMany,
  } satisfies Stage1;

  function defineLazy(f: Factory): Stage2 {
    return {
      assign,
      assignMany,
      defineLazy,
      defineLazyMany,
    } satisfies Stage2;
  }

  function defineLazyMany(f: Factory[]): Stage2 {
    return {
      assign,
      assignMany,
      defineLazy,
      defineLazyMany,
    } satisfies Stage2;
  }

  function assign(f: Factory): Stage3 {
    return {
      assign,
      assignMany,
      seal,
    } satisfies Stage3;
  }

  function assignMany(f: Factory[]): Stage3 {
    return {
      assign,
      assignMany,
      seal,
    } satisfies Stage3;
  }

  function seal(): Container {
    return {
      resolve,
    } as Container;
  }

  function resolve<T>(token: string): T {
    return undefined as T;
  }
}

test("poc", async () => {
  foo.dependsOn = ["bar"] as const;
  foo.lazy = true as const;
  foo.token = "foo" as const;

  type Foo = {
    say(): string;
  };

  function foo(): Foo {
    return {
      say: () => "foo",
    };
  }

  bar.dependsOn = ["foo"] as const;
  bar.lazy = true as const;
  bar.token = "bar" as const;

  type Bar = {
    say(): string;
  };

  function bar(foo: () => Foo): Bar {
    return {
      say: foo().say,
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
  ).toMatch("foo");
});
