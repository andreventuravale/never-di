export interface Factory<
  Out = unknown,
  In extends unknown[] = unknown[],
  Deps extends readonly string[] = readonly []
> {
  readonly dependsOn?: Deps;
  (this: void, ...args: In): Out;
}

export type RegistryOf<Container> = Container extends ContainerDraft<infer R>
  ? R
  : never;

export type DerivedContainerDraft<
  Registry,
  IncomingTk extends string,
  IncomingFactoryOut
> = ContainerDraft<_AssignArray<Registry, IncomingTk, IncomingFactoryOut>>;

export interface ContainerDraft<Registry = {}> {
  register<
    Tk extends string,
    Out,
    In extends unknown[] = unknown[],
    Deps extends readonly Extract<keyof Registry, string>[] = []
  >(
    tk: Tk,
    factory: Factory<Out, In, Deps> & { dependsOn?: Deps }
  ): DerivedContainerDraft<Registry, Tk, Out>;

  seal(): Container<Registry>;
}

export interface Container<Registry = {}> {
  bind<F extends (...args: any[]) => any>(f: F): (this: void) => ReturnType<F>;

  resolve<Tk extends keyof Registry>(token: Tk): Registry[Tk];
}

export function startContainer(): ContainerDraft {
  return _createContainerDraft(_createContainerState());
}

function _createContainerDraft(state: _ContainerState): ContainerDraft {
  return { register, seal } as ContainerDraft;

  function register(tk: string, factory: Factory): ContainerDraft {
    const newState = _createContainerState(state);

    const existingEntries = newState.factories.get(tk);

    const newEntry = [factory];

    if (existingEntries) {
      newState.factories.set(tk, existingEntries.concat(newEntry));

      newState.cache.delete(tk);
    } else {
      newState.factories.set(tk, newEntry);
    }

    return _createContainerDraft(newState);
  }

  function seal() {
    return { bind, resolve } as Container;

    function bind(factory: Factory): Function {
      return () => {
        const { dependsOn = [] } = factory;

        return factory(...dependsOn.map(resolve));
      };
    }

    function resolve(tk: string): unknown {
      return _resolve(state, {}, tk);
    }
  }
}

function _createContainerState(prev?: _ContainerState): _ContainerState {
  return {
    cache: prev ? new Map(prev.cache) : new Map(),
    factories: prev ? new Map(prev.factories) : new Map(),
  };
}

function _resolve(
  state: _ContainerState,
  { path = [], seen = new Set() }: _ResolveContext,
  tk: string
): unknown {
  if (state.cache.has(tk)) return state.cache.get(tk);

  if (seen.has(tk)) {
    const cyclePath = [...path.slice(path.indexOf(tk)), tk];

    throw new Error(`cycle detected: ${cyclePath.join(" > ")}`);
  }

  const factory = state.factories.get(tk) as Factory[];

  if (!factory || factory.length === 0) {
    throw new Error(`token is not registered: ${tk}`);
  }

  seen.add(tk);

  path.push(tk);

  const results = factory.map((factory) => {
    const context = { path, seen };

    const { dependsOn = [] } = factory;

    const deps = dependsOn.map((tk) => _resolve(state, context, tk));

    return factory.apply(undefined, deps);
  });

  seen.delete(tk);

  path.pop();

  const value = results.length === 1 ? results[0] : results;

  state.cache.set(tk, value);

  return value;
}

type _AssignArray<R, K extends string, V> = K extends keyof R
  ? _Reconcile<
      Omit<R, K> & {
        [P in K]: _EnforceSame<_ElementType<R[K]>, V>[];
      }
    >
  : _Reconcile<R & { [P in K]: V }>;

type _ContainerState = {
  cache: Map<string, unknown>;
  factories: Map<string, Factory[]>;
};

type _ElementType<T> = T extends readonly (infer U)[] ? U : T;

type _EnforceSame<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? A
    : never
  : never;

type _Reconcile<T> = { [K in keyof T]: T[K] } & {};

type _ResolveContext = {
  path?: string[];
  seen?: Set<string>;
};
