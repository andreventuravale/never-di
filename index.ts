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

    const resolvers = new Map<string, () => unknown>();

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

      resolvers.set(token, () => resolveToken(token, new Set(), []));

      return container as IDiContainer;

      function resolveToken(
        token: string,
        seen: Set<string>,
        path: string[]
      ): unknown {
        if (seen.has(token)) {
          const cyclePath = [...path.slice(path.indexOf(token)), token];

          throw new Error(`cycle detected: ${cyclePath.join(" > ")}`);
        }

        const factory = factories.get(token) as IDiFactory[];

        seen.add(token);

        path.push(token);

        const results = factory.map((factory) => {
          const dependencies =
            factory.dependsOn?.map((dependency) =>
              resolveToken(dependency, seen, path)
            ) ?? [];

          return factory.apply(undefined, dependencies);
        });

        seen.delete(token);

        path.pop();

        return results.length === 1 ? results[0] : results;
      }
    }

    function seal(): IDiSealedContainer {
      const sealedResolvers = new Map(resolvers.entries());

      const sealedContainer: IDiSealedContainer = { resolve };

      return sealedContainer;

      function resolve<T>(token: string): T {
        const resolver = sealedResolvers.get(token);

        if (!resolver) {
          throw new Error(`token is not registered: ${token}`);
        }

        return resolver() as T;
      }
    }
  }
}
