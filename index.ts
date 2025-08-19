type _ElementType<T> = T extends readonly (infer U)[] ? U : T;

type _EnforceSame<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? A
    : never
  : never;

type _Reconcile<T> = { [K in keyof T]: T[K] } & {};

type _AssignArray<R, K extends string, V> = K extends keyof R
  ? _Reconcile<
      Omit<R, K> & {
        [P in K]: _EnforceSame<_ElementType<R[K]>, V>[];
      }
    >
  : _Reconcile<R & { [P in K]: V }>;

export type RegistryOf<Container> = Container extends IDiContainer<infer R>
  ? R
  : never;

export interface IDiFactory<
  Output = unknown,
  Input extends unknown[] = unknown[],
  Dependencies extends readonly string[] = readonly []
> {
  readonly dependsOn?: Dependencies;
  (...input: Input): Output;
}

export interface IDiContainer<Registry = {}> {
  register<
    Token extends string,
    Output,
    Input extends unknown[] = unknown[],
    Dependencies extends readonly Extract<keyof Registry, string>[] = []
  >(
    token: Token,
    factory: IDiFactory<Output, Input, Dependencies> & {
      dependsOn?: Dependencies;
    }
  ): IDiContainer<_AssignArray<Registry, Token, Output>>;

  seal(): IDiSealedContainer<Registry>;
}

export interface IDiSealedContainer<Registry = {}> {
  bind<Fn extends (...args: any[]) => any>(fn: Fn): () => ReturnType<Fn>;

  resolve<Token extends keyof Registry>(token: Token): Registry[Token];
}

export interface IDiRuntime {
  createContainer(): IDiContainer;
}

export function DiRuntime(): IDiRuntime {
  const cache = new Map();

  return {
    createContainer,
  };

  function createContainer(): IDiContainer {
    return Container(ContainerState());
  }

  type _ContainerState = {
    factories: Map<string, IDiFactory[]>;
    resolvers: Map<string, (state: _ContainerState) => () => unknown>;
  };

  function Container(state: _ContainerState): IDiContainer {
    return {
      register,
      seal,
    } as IDiContainer;

    function register(token: string, factory: IDiFactory): IDiContainer {
      const newState = ContainerState(state);

      const existing = newState.factories.get(token);

      if (existing) {
        cache.delete(token);

        existing.push(factory);
      } else {
        newState.factories.set(token, [factory]);
      }

      newState.resolvers.set(token, (state) =>
        _resolveToken.bind(state, {}, token)
      );

      return Container(newState);
    }

    function seal() {
      return {
        bind,
        resolve,
      } as IDiSealedContainer;

      function bind(factory: IDiFactory): Function {
        return function (this: any, ...args: any[]) {
          return factory.apply(this, args);
        }.bind(undefined, ...(factory.dependsOn ?? []).map(resolve));
      }

      function resolve(token: string): unknown {
        const resolver = state.resolvers.get(token);

        if (!resolver) {
          throw new Error(`token is not registered: ${token}`);
        }

        return resolver(state)();
      }
    }

    type _ResolveContext = {
      path?: string[];
      seen?: Set<string>;
    };

    function _resolveToken(
      this: _ContainerState,
      { path = [], seen = new Set() }: _ResolveContext,
      token: string
    ): unknown {
      if (cache.has(token)) return cache.get(token);

      if (seen.has(token)) {
        const cyclePath = [...path.slice(path.indexOf(token)), token];

        throw new Error(`cycle detected: ${cyclePath.join(" > ")}`);
      }

      const factory = this.factories.get(token) as IDiFactory[];

      seen.add(token);

      path.push(token);

      const results = factory.map((factory) => {
        const context = { path, seen };

        const dependencies =
          factory.dependsOn?.map((dependency) =>
            _resolveToken.call(this, context, dependency)
          ) ?? [];

        return factory.apply(undefined, dependencies);
      });

      seen.delete(token);

      path.pop();

      const value = results.length === 1 ? results[0] : results;

      cache.set(token, value);

      return value;
    }
  }

  function ContainerState(priorState?: _ContainerState): _ContainerState {
    return {
      factories: new Map(priorState?.factories ?? null),
      resolvers: new Map(priorState?.resolvers ?? null),
    };
  }
}
