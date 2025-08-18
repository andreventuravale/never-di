export interface IDiFactory<T = unknown> {
  readonly dependsOn?: readonly string[];
  (...args: unknown[]): T;
}

export interface IDiContainer {
  register(token: string, factory: IDiFactory): IDiContainer;
  seal(): IDiSealedContainer;
}

export interface IDiSealedContainer {
  resolve<T>(token: string): T;
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

    const container: IDiContainer = {
      register,
      seal,
    };

    return container;

    function register(token: string, factory: IDiFactory): IDiContainer {
      factories.set(token, factory);

      resolvers.set(token, () => {
        const dependencies = resolveDependencies(token);

        return factory.apply(undefined, dependencies);
      });

      return container;

      function resolveDependencies(token: string): unknown[] {
        const factory = factories.get(token);

        if (typeof factory !== "function") {
          throw new Error(
            `token is registered but didn't resolve to a function: ${token}`
          );
        }

        if (!factory.dependsOn) return [];

        return factory.dependsOn.map((dependencyToken) => {
          const dependencyFactory = factories.get(dependencyToken);

          if (typeof dependencyFactory !== "function") {
            throw new Error(
              `token is registered but didn't resolve to a function: ${dependencyToken}`
            );
          }

          return dependencyFactory.apply(
            undefined,
            resolveDependencies(dependencyToken)
          );
        });
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
