
export function createContainerDraft(): Stage1 {
  const lazy = new Set<string>();

  const map = new Map<string, Factory | Factory[]>();

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

    return { resolve } as any;
  }

  function resolve<T>(token: string): T {
    const entry = map.get(token);

    if (!entry) {
      throw new Error(`token is not assigned: ${token}`);
    }

    if (lazy.has(token)) {
      if (Array.isArray(entry)) {
        return (() => entry.map(_resolve)) as T;
      }

      return (() => _resolve(entry)) as T;
    } else {
      if (Array.isArray(entry)) {
        return entry.map(_resolve) as T;
      }

      return _resolve(entry) as T;
    }
  }

  function _resolve(factory: Factory): unknown {
    const { dependsOn = [] } = factory;

    const args = dependsOn.map(resolve);

    return factory.apply(undefined, args);
  }
}
