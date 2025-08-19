export type RegistryOf<C> = C extends IDiContainer<infer R> ? R : never;

type ElementType<T> = T extends readonly (infer U)[] ? U : T;

type EnforceSame<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? A
    : never
  : never;

type Reconcile<T> = { [K in keyof T]: T[K] } & {};

type AssignArray<R, K extends string, V> = K extends keyof R
  ? Reconcile<
      Omit<R, K> & {
        [P in K]: EnforceSame<ElementType<R[K]>, V>[];
      }
    >
  : Reconcile<R & { [P in K]: V }>;

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
  ): IDiContainer<AssignArray<Registry, Token, Output>>;

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

  type ContainerState = {
    factories: Map<string, IDiFactory[]>;
    resolvers: Map<string, (state: ContainerState) => () => unknown>;
  };

  function Container(state: ContainerState): IDiContainer {
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

    type ResolveContext = {
      path?: string[];
      seen?: Set<string>;
    };

    function _resolveToken(
      this: ContainerState,
      { path = [], seen = new Set() }: ResolveContext,
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

  function ContainerState(priorState?: ContainerState): ContainerState {
    return {
      factories: new Map(priorState?.factories ?? null),
      resolvers: new Map(priorState?.resolvers ?? null),
    };
  }
}
