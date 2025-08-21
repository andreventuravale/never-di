// impl.ts
import type { Container, ContainerDraft, Factory } from "./types";

type ContainerState = {
  factories: Map<string, Factory[]>;
};

type ResolveContext = {
  cache: Map<string, unknown>;
  path: string[];
  seen: Set<string>;
};

export function startContainer(): ContainerDraft {
  return createContainerDraft(createContainerState());
}

function createContainerDraft(state: ContainerState): ContainerDraft {
  return { register, registerMany, seal } as unknown as ContainerDraft;

  function register(tk: string, factory: Factory): ContainerDraft {
    const next = cloneState(state);
    // single binding: last call wins
    next.factories.set(tk, [factory]);
    return createContainerDraft(next);
  }

  function registerMany(
    tk: string,
    factories: readonly Factory[]
  ): ContainerDraft {
    const next = cloneState(state);
    // multi binding: preserve order
    next.factories.set(tk, factories.slice() as Factory[]);
    return createContainerDraft(next);
  }

  function seal(): Container {
    // per-container persistent cache (safe post-seal)
    const cache = new Map<string, unknown>();

    return { bind, resolve } as unknown as Container;

    function bind(factory: Factory): () => unknown {
      const deps = factory.dependsOn ?? [];
      // Optional preflight (fail early if desired)
      for (const d of deps) {
        if (!state.factories.has(d)) {
          throw new Error(`unregistered dependency in bind(): ${d}`);
        }
      }
      return () => factory(...deps.map(resolve));
    }

    function resolve(tk: string): unknown {
      return resolveInternal(state, { cache, path: [], seen: new Set() }, tk);
    }
  }
}

function createContainerState(): ContainerState {
  return { factories: new Map() };
}

function cloneState(prev: ContainerState): ContainerState {
  return { factories: new Map(prev.factories) };
}

function resolveInternal(
  state: ContainerState,
  ctx: ResolveContext,
  tk: string
): unknown {
  if (ctx.cache.has(tk)) return ctx.cache.get(tk)!;

  if (ctx.seen.has(tk)) {
    throw new Error(`cycle detected: ${ctx.path.concat([tk]).join(" > ")}`);
  }

  const list = state.factories.get(tk);
  if (!list || list.length === 0) {
    const known = [...state.factories.keys()];
    throw new Error(
      `token is not registered: ${tk}. Known: ${
        known.length ? known.join(", ") : "(none)"
      }`
    );
  }

  ctx.seen.add(tk);
  ctx.path.push(tk);

  const results = list.map((factory) => {
    const deps = factory.dependsOn ?? [];
    const args = deps.map((dep) => resolveInternal(state, ctx, dep));
    return factory.apply(undefined, args);
  });

  ctx.seen.delete(tk);
  ctx.path.pop();

  const value = results.length === 1 ? results[0] : results;
  ctx.cache.set(tk, value);
  return value;
}
