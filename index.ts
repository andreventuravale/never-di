export interface IDiFactory<T = unknown> {
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
    const map = new Map<string, IDiFactory>();

    const container: IDiContainer = {
      register,
      seal,
    };

    return container;

    function register(token: string, factory: IDiFactory): IDiContainer {
      map.set(token, factory);

      return container;
    }

    function seal(): IDiSealedContainer {
      const sealedMap = new Map(map.entries());

      const sealedContainer: IDiSealedContainer = {
        resolve,
      };

      return sealedContainer;

      function resolve<T>(token: string): T {
        if (!sealedMap.has(token)) {
          throw new Error(`token is not registered: ${token}`);
        }

        const factory = sealedMap.get(token);

        if (typeof factory !== "function") {
          throw new Error(
            `token is registered but didn't resolve to a function: ${token}`
          );
        }

        return factory() as T;
      }
    }
  }
}
