import { test } from "vitest";

interface Metadata {
  readonly dependsOn?: string[];
  readonly lazy?: true;
  readonly token?: string;
}

interface Factory<T = any, Args extends any[] = any[]> extends Metadata {
  (...args: Args): T;
}

interface Stage1<Registry = {}> {
  defineLazy(f: Factory): Stage2<Registry>;
  defineLazyMany(f: Factory[]): Stage2<Registry>;
}

interface Stage2<Registry = {}> extends Stage1 {
  assign(f: Factory): Stage3<Registry>;
  assignMany(f: Factory[]): Stage3<Registry>;
}

interface Stage3<Registry = {}> extends Stage2 {
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
      defineLazy,
      defineLazyMany,
    } satisfies Stage2;
  }

  function defineLazyMany(f: Factory[]): Stage2 {
    return {
      defineLazy,
      defineLazyMany,
    } satisfies Stage2;
  }

  function assign(f: Factory): Stage3 {
    return {
      defineLazy,
      defineLazyMany,
      assign,
      assignMany,
    } satisfies Stage3;
  }

  function assignMany(f: Factory[]): Stage3 {
    return {
      defineLazy,
      defineLazyMany,
      assign,
      assignMany,
      seal,
    } as Stage3;
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
  createContainerDraft();
});
