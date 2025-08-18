type Reconcile<T> = { [K in keyof T]: T[K] } & {};

export type DerivedRegistry<
  PreviousRegistry,
  IncomingToken extends string,
  Output
> = PreviousRegistry & {
  [K in IncomingToken]: Output;
};

export interface IDiFactory<
  Output = unknown,
  Input extends unknown[] = unknown[]
> {
  readonly dependsOn?: readonly string[];
  (...input: Input): Output;
}

export interface IDiContainer<Registry = {}> {
  register<Token extends string, Output, Input extends unknown[] = unknown[]>(
    token: Token,
    factory: IDiFactory<Output, Input>
  ): IDiContainer<Reconcile<Registry & { [K in Token]: Output }>>;

  seal(): IDiSealedContainer<Reconcile<Registry>>;
}

export interface IDiSealedContainer<Registry = {}> {
  resolve<Token extends keyof Registry>(token: Token): Registry[Token];
}

export interface IDiRuntime {
  createContainer(): IDiContainer;
}

export function DiRuntime(): IDiRuntime {
  return {
    createContainer,
  };

  function createContainer(): IDiContainer {
    const factories = new Map<string, IDiFactory>();

    const resolvers = new Map<string, IDiFactory>();

    const container = {
      register,
      seal,
    };

    return container as IDiContainer;

    function register<Token extends string, Output>(
      token: Token,
      factory: IDiFactory<Output>
    ): IDiContainer {
      factories.set(token, factory);

      resolvers.set(token, () => resolveRecursive(token, new Set()));

      return container as IDiContainer;

      function resolveRecursive(
        token: string,
        seen: Set<string>,
        path: string[] = []
      ): unknown {
        if (seen.has(token)) {
          const cyclePath = [...path.slice(path.indexOf(token)), token];

          throw new Error(`cycle detected: ${cyclePath.join(" → ")}`);
        }

        const factory = factories.get(token);

        if (typeof factory !== "function") {
          throw new Error(
            `token is registered but didn't resolve to a function: ${token}`
          );
        }

        seen.add(token);

        path.push(token);

        const dependencies =
          factory.dependsOn?.map((dep) => resolveRecursive(dep, seen, path)) ??
          [];

        seen.delete(token);

        path.pop();

        return factory(...dependencies);
      }
    }

    function seal(): IDiSealedContainer {
      const sealedResolvers = new Map(resolvers.entries());

      const sealedContainer: IDiSealedContainer = {
        resolve,
      };

      return sealedContainer;

      function resolve<T>(token: string): T {
        if (!sealedResolvers.has(token)) {
          throw new Error(`token is not registered: ${token}`);
        }

        const resolver = sealedResolvers.get(token) as IDiFactory<T>;

        if (typeof resolver !== "function") {
          throw new Error(
            `token is registered but didn't resolve to a function: ${token}`
          );
        }

        return resolver();
      }
    }
  }
}
