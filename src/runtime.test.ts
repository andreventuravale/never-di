import { test } from "vitest";

type Extend<R extends object, T extends string, V> = R & { [k in T]: V };

interface Factory<
  T = unknown,
  Lazy extends boolean = false,
  Deps extends readonly string[] = readonly [],
  Args extends readonly unknown[] = readonly []
> {
  readonly dependsOn?: Deps;
  readonly lazy?: Lazy;
  (...args: Args): T;
}

interface Container<R extends object> {
  resolve<T extends keyof R>(token: T): R[T];
}

interface DefineApi<R extends object> {
  define<F extends Factory>(factory: F): DraftLevel2<R>;
}

interface AssignApi<R extends object> {
  assign<T extends string, F extends Factory | Factory[]>(
    token: T,
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
    .define(Ext1)
    .define(Ext2)
    .define(Runtime)
    .assign("Exts", [Ext1, Ext2])
    .assign("Runtime", Runtime)
    .seal();

  const runtime = container.resolve("Runtime");

  console.log(runtime);
});
