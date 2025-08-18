type Reconcile<T> = { [K in keyof T]: T[K] } & {};

type Assign<R, K extends string, V> = K extends keyof R
  ? Reconcile<Omit<R, K> & { [P in K]: Push<R[K], V> }>
  : Reconcile<R & { [P in K]: V }>;

type Push<Existing, New> = Existing extends readonly [...infer R]
  ? [...R, New]
  : Existing extends any[]
  ? [...Existing, New]
  : [Existing, New];

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
  ): IDiContainer<Assign<Registry, Token, Output>>;

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
    const factories = new Map<string, IDiFactory[]>();

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
      const existing = factories.get(token);

      if (existing) {
        existing.push(factory);
      } else {
        factories.set(token, [factory]);
      }

      resolvers.set(token, () => _resolveToken(token, new Set(), []));

      return container as IDiContainer;

      function _resolveToken(
        token: string,
        seen: Set<string>,
        path: string[]
      ): unknown {
        if (seen.has(token)) {
          const cyclePath = [...path.slice(path.indexOf(token)), token];

          throw new Error(`cycle detected: ${cyclePath.join(" → ")}`);
        }

        const list = factories.get(token) as IDiFactory[];

        seen.add(token);

        path.push(token);

        const results = list.map((factory) => {
          const dependencies =
            factory.dependsOn?.map((dep) => _resolveToken(dep, seen, path)) ??
            [];

          return factory(...(dependencies as unknown[]));
        });

        seen.delete(token);

        path.pop();

        return results.length === 1 ? results[0] : results;
      }
    }

    function seal(): IDiSealedContainer {
      const sealedResolvers = new Map(resolvers.entries());

      const sealedContainer: IDiSealedContainer = {
        resolve,
      };

      return sealedContainer;

      function resolve<T>(token: string): T {
        const resolver = sealedResolvers.get(token) as T;

        if (typeof resolver !== "function") {
          throw new Error(`token is not registered: ${token}`);
        }

        return resolver();
      }
    }
  }
}
