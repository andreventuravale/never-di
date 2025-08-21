import type {
  Container,
  ContainerDraft,
  ContainerState,
  Factory,
  ResolveContext
} from "./types";

export function createContainerDraft(): ContainerDraft {
  return _createContainerDraft(_createContainerState());
}

function _createContainerDraft(state: ContainerState): ContainerDraft {
  return { register, seal } as ContainerDraft;

  function register(tk: string, factory: Factory): ContainerDraft {
    const next = _createContainerState(state);
    const list = next.factories.get(tk);
    if (list) {
      next.factories.set(tk, list.concat(factory));
    } else {
      next.factories.set(tk, [factory]);
    }
    return _createContainerDraft(next);
  }

  function seal(): Container {
    const cache = new Map<string, unknown>();

    return { bind, resolve } as Container;

    function bind(factory: Factory): () => unknown {
      return () => {
        const deps = factory.dependsOn ?? [];
        return factory(...deps.map(resolve));
      };
    }

    function resolve(tk: string): unknown {
      return _resolveInternal(state, { cache, path: [], seen: new Set() }, tk);
    }
  }
}

function _createContainerState(prev?: ContainerState): ContainerState {
  if (prev) {
    return {
      factories: new Map(prev.factories),
    };
  }
  return { factories: new Map() };
}

function _resolveInternal(
  state: ContainerState,
  ctx: ResolveContext,
  tk: string
): unknown {
  if (ctx.cache.has(tk)) return ctx.cache.get(tk);

  if (ctx.seen.has(tk)) {
    throw new Error(`cycle detected: ${ctx.path.concat([tk]).join(" > ")}`);
  }

  const list = state.factories.get(tk);
  if (!list || list.length === 0) {
    throw new Error(`token is not registered: ${tk}`);
  }

  ctx.seen.add(tk);
  ctx.path.push(tk);

  const results = list.map((factory) => {
    const deps = factory.dependsOn ?? [];
    const args = deps.map((dep) => _resolveInternal(state, ctx, dep));
    return factory.apply(undefined, args);
  });

  ctx.seen.delete(tk);
  ctx.path.pop();

  const value = results.length === 1 ? results[0] : results;
  ctx.cache.set(tk, value);
  return value;
}
