import { test } from "vitest";

type Extend<R extends object, T extends string, V> = R & { [k in T]: V };

type Lazy<T> = () => T;

interface Metadata {
  readonly token: string;
  readonly dependsOn?: readonly string[];
  readonly lazy?: true;
}

interface Factory extends Metadata {
  (...args: any | Lazy<any>): unknown;
}

interface Container<R extends object> {
  resolve<T extends keyof R>(token: T): R[T];
}

interface DefineApi<R extends object> {
  define<F extends Factory | Factory[]>(factory: F): DraftLevel2<R>;
}

interface AssignApi<R extends object> {
  assign<T extends string, F extends Factory | Factory[]>(
    factory: F
  ): DraftLevel3<Extend<R, T, F>>;
}

interface DraftLevel1<R extends object> extends DefineApi<R> {}

interface DraftLevel2<R extends object> extends DefineApi<R>, AssignApi<R> {}

interface DraftLevel3<R extends object> extends AssignApi<R> {
  seal(): Container<R>;
}

export function startContainerDraft(): DraftLevel1<{}> {
  return {
    define,
  } as DraftLevel1<{}>;

  function define(factory: Factory): DraftLevel2<{}> {
    for (const f of [factory].flat()) {
      f;
    }

    return {
      assign,
      define,
    } as DraftLevel2<{}>;
  }

  function assign(token: string, factory: Factory): DraftLevel3<{}> {
    return {
      assign,
      seal,
    } as DraftLevel3<{}>;

    function seal(): Container<{}> {
      return {
        resolve,
      } as Container<{}>;

      function resolve(token: string) {}
    }
  }
}

test("happy path", () => {
  type Runtime = {
    exts: Ext[];
  };

  Runtime.token = "Runtime" as const;

  Runtime.dependsOn = ["Ext"] as const;

  Runtime.lazy = true as const;

  function Runtime(exts: Ext[]): Runtime {
    return {
      exts,
    };
  }

  type Ext = {
    name: string;
    query: () => string[];
  };

  Ext1.token = "Ext" as const;

  Ext1.dependsOn = ["Runtime"] as const;

  function Ext1(runtime: () => Runtime): Ext {
    runtime();

    return {
      name: "ext-1",
      query: () => runtime().exts.map(({ name }) => name),
    };
  }

  Ext2.token = "Ext" as const;

  Ext2.dependsOn = ["Runtime"] as const;

  function Ext2(runtime: () => Runtime): Ext {
    return {
      name: "ext-2",
      query: () => runtime().exts.map(({ name }) => name),
    };
  }

  const container = startContainerDraft()
    .define([Ext1, Ext2])
    .define(Runtime)
    .assign([Ext1, Ext2])
    .assign(Runtime)
    .seal();

  const runtime = container.resolve("Runtime");

  console.log(runtime);
});
