export interface IDiFactory<T = unknown, Args extends unknown[] = unknown[]> {
  readonly dependsOn?: readonly string[];
  (...args: Args): T;
}

export interface IDiContainer {
  register<T = unknown, Args extends unknown[] = unknown[]>(token: string, factory: IDiFactory<T, Args>): IDiContainer;
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

    function register<T = unknown, Args extends unknown[] = unknown[]>(token: string, factory: IDiFactory<T, Args>): IDiContainer {
      factories.set(token, factory);

      resolvers.set(token, () => resolveRecursive(token, new Set()));

      return container;

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
