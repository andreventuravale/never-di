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

export interface ContainerDraft<Registry = {}> {
  register<
    Tk extends string,
    Out,
    In extends unknown[] = unknown[],
    Deps extends readonly Extract<keyof Registry, string>[] = []
  >(
    tk: Tk,
    factory: Factory<Out, In, Deps> & {
      dependsOn?: Deps;
    }
  ): ContainerDraft<_AssignArray<Registry, Tk, Out>>;

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
  const cache = new Map();

  return {
    register,
    seal,
  } as ContainerDraft;

  function register(tk: string, factory: Factory): ContainerDraft {
    const newState = _createContainerState(state);

    const value = newState.factories.get(tk);

    if (value) {
      newState.factories.set(tk, value.concat([factory]));
    } else {
      newState.factories.set(tk, [factory]);
    }

    newState.resolvers.set(tk, (state) =>
      _resolveToken.bind(undefined, state, {}, tk)
    );

    return _createContainerDraft(newState);
  }

  function seal() {
    return {
      bind,
      resolve,
    } as Container;

    function bind(factory: Factory): Function {
      const wrapper = function (this: any, ...args: any[]) {
        return factory.apply(this, args);
      };

      return wrapper.bind(undefined, ...(factory.dependsOn ?? []).map(resolve));
    }

    function resolve(tk: string): unknown {
      const resolver = state.resolvers.get(tk);

      if (!resolver) {
        throw new Error(`token is not registered: ${tk}`);
      }

      return resolver(state)();
    }
  }

  function _resolveToken(
    state: _ContainerState,
    { path = [], seen = new Set() }: _ResolveContext,
    tk: string
  ): unknown {
    if (cache.has(tk)) return cache.get(tk);

    if (seen.has(tk)) {
      const cyclePath = [...path.slice(path.indexOf(tk)), tk];

      throw new Error(`cycle detected: ${cyclePath.join(" > ")}`);
    }

    const factory = state.factories.get(tk) as Factory[];

    seen.add(tk);

    path.push(tk);

    const results = factory.map((factory) => {
      const context = { path, seen };

      const dependencies =
        factory.dependsOn?.map((dependency) =>
          _resolveToken(state, context, dependency)
        ) ?? [];

      return factory.apply(undefined, dependencies);
    });

    seen.delete(tk);

    path.pop();

    const value = results.length === 1 ? results[0] : results;

    cache.set(tk, value);

    return value;
  }
}

function _createContainerState(prev?: _ContainerState): _ContainerState {
  return {
    factories: new Map(prev?.factories ?? null),
    resolvers: new Map(prev?.resolvers ?? null),
  };
}

type _AssignArray<R, K extends string, V> = K extends keyof R
  ? _Reconcile<
      Omit<R, K> & {
        [P in K]: _EnforceSame<_ElementType<R[K]>, V>[];
      }
    >
  : _Reconcile<R & { [P in K]: V }>;

type _ContainerState = {
  factories: Map<string, Factory[]>;
  resolvers: Map<string, (state: _ContainerState) => () => unknown>;
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
