import { test } from "vitest";

interface Factory {}

interface Container<R extends object> {
  resolve<K extends keyof R>(token: K): R[K];
}

interface DefineApi<R extends object> {
  define<F extends Factory | Factory[]>(factory: F): State2Api<R>;
}

interface AssignApi<R extends object> {
  assign<K extends string, F extends Factory | Factory[]>(
    token: K,
    factory: F
  ): State3Api<R & { [k in K]: F }>;
}

interface State1Api<R extends object> extends DefineApi<R> {}

interface State2Api<R extends object> extends DefineApi<R>, AssignApi<R> {}

interface State3Api<R extends object> extends AssignApi<R> {
  seal(): Container<R>;
}

export function startContainerDraft(): State1Api<{}> {
  return {
    define,
  } as State1Api<{}>;

  function define(factory: Factory): State2Api<{}> {
    for (const f of [factory].flat()) {
      f;
    }

    return {
      assign,
      define,
    } as State2Api<{}>;
  }

  function assign(token: string, factory: Factory): State3Api<{}> {
    return {
      assign,
      seal,
    } as State3Api<{}>;

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

  Runtime.assignMode = "lazy";

  Runtime.dependsOn = ["Exts"] as const;

  function Runtime(exts: Ext[]): Runtime {
    return {
      exts,
    };
  }

  type Ext = {
    name: string;
    query: () => string[];
  };

  Ext1.dependsOn = ["Runtime"] as const;

  function Ext1(runtime: () => Runtime): Ext {
    runtime();

    return {
      name: "ext-1",
      query: () => runtime().exts.map(({ name }) => name),
    };
  }

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
    .assign("Exts", [Ext1, Ext2])
    .assign("Runtime", Runtime)
    .seal();

  const runtime = container.resolve("Runtime");

  console.log(runtime);
});
