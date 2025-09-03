import type { Container, Factory, Procedure, Stage1, Stage2 } from "./types";

export * from "./types";

export function createContainerDraft(): Stage1 {
  const lazy = new Set<string>();

  const map = new Map<string, Factory | Factory[]>();

  const cache = new Map<string, unknown>();

  return { assign, assignMany, defineLazy } as any;

  function defineLazy(f: Factory): Stage2 {
    lazy.add(f.token);

    return { assign, assignMany, defineLazy } as any;
  }

  function assign(f: Factory): Stage2 {
    map.set(f.token, f);

    return { assign, assignMany, seal } as any;
  }

  function assignMany(f: Factory[]): Stage2 {
    if (f.length === 0) {
      throw new Error("empty array was  given");
    }

    const tokens = f.reduce((set, factory) => {
      set.add(factory.token);

      return set;
    }, new Set<string>());

    if (tokens.size > 1) {
      throw new Error(
        `unique token expected but many was given: ${Array.from(
          tokens.values()
        ).join(", ")}`
      );
    }

    map.set(f[0].token, f);

    return { assign, assignMany, seal } as any;
  }

  function seal(): Container {
    for (const key of lazy.keys()) {
      if (!map.has(key)) {
        throw new Error(`lazy factory is not unassigned: ${key}`);
      }
    }

    return { bind, resolve } as any;
  }

  function bind<L extends Procedure>(l: L): () => ReturnType<L> {
    return () => _resolve(l) as ReturnType<L>;
  }

  function resolve<T>(token: string): T {
    if (cache.has(token)) return cache.get(token) as T;

    const entry = map.get(token);

    if (!entry) {
      throw new Error(`token is not assigned: ${token}`);
    }

    const value = getValue(entry);

    cache.set(token, value);

    return value;

    function getValue(entry: Factory | Factory[]) {
      if (lazy.has(token)) {
        const key = `${token}:value`;

        return (() => {
          if (cache.has(key)) return cache.get(key) as T;

          const value = _resolve(entry as Factory);

          cache.set(key, value);

          return value;
        }) as T;
      } else {
        if (Array.isArray(entry)) {
          return entry.map(_resolve) as T;
        }

        return _resolve(entry) as T;
      }
    }
  }

  function _resolve(factory: Factory | Procedure): unknown {
    const { dependsOn = [] } = factory;

    const args = dependsOn.map(resolve);

    return factory.apply(undefined, args);
  }
}
