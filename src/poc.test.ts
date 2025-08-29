import { expect, test } from "vitest";

interface Metadata {
  readonly dependsOn?: readonly string[];
  readonly lazy?: true;
  readonly token?: string;
}

type WithLazy<S, Token> = S extends {
  lazy: infer Prev;
}
  ? S & { lazy: Prev | Token }
  : S & { lazy: Token };

type WithMeta<S, Meta> = S extends {
  meta: infer Prev;
}
  ? S & { meta: Prev & Meta }
  : S & { meta: Meta };

type WithRegistry<S, F extends Record<string, Factory>> = S extends {
  reg: infer Prev extends Record<string, Factory>;
}
  ? S & { reg: Prev & F }
  : S & { reg: F };

type Tk<M extends Metadata> = M extends { token: infer Tk extends string }
  ? Tk
  : never;

interface Factory<T = any, Args extends any[] = any[]> extends Metadata {
  (...args: Args): T;
}

interface DefineApi<S = {}> {
  defineLazy<F extends Factory>(f: F): Stage2<WithLazy<S, Tk<F>>>;
}

//--------------------

type Meta<Reg> = Reg extends { meta: infer M } ? M : {};

type LazyKeys<Reg> = Reg extends { lazy: infer L }
  ? L extends string
    ? L
    : never
  : never;

type DepKeys<F extends Metadata> = F extends {
  dependsOn: infer D extends readonly string[];
}
  ? D[number]
  : never;

type UncoveredDeps<Reg, F extends Metadata> = Exclude<
  DepKeys<F>,
  keyof Meta<Reg> | LazyKeys<Reg>
>;

type Check<Reg, F extends Metadata> = [UncoveredDeps<Reg, F>] extends [never]
  ? Reg
  : { [k in Tk<F>]: { depends: { on: UncoveredDeps<Reg, F> } } };

type Reg<S> = S extends { reg: infer R extends Record<string, Factory> }
  ? R
  : never;

//--------------------

interface AssignApi<S = {}> {
  assign<F extends Factory>(
    f: F
  ): S extends Check<S, F>
    ? Stage3<WithRegistry<WithMeta<S, Record<Tk<F>, F>>, Record<Tk<F>, F>>>
    : Check<S, F>;
}

interface Stage1<S = {}> extends DefineApi<S> {}

interface Stage2<S = {}> extends DefineApi<S>, AssignApi<S> {}

interface Stage3<S = {}> extends AssignApi<S> {
  seal(): Container<Reg<S>>;
}

interface Container<Reg extends Record<string, Factory> = {}> {
  resolve<T extends keyof Reg>(token: T): ReturnType<Reg[T]>;
}

function createContainerDraft(): Stage1 {
  return {
    defineLazy,
  } as any;

  function defineLazy(f: Factory): Stage2 {
    return {
      assign,
      defineLazy,
    } as any;
  }

  function assign(f: Factory): Stage3 {
    return {
      assign,
      seal,
    } as any;
  }

  function seal(): Container {
    return {
      resolve,
    } as any;
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
