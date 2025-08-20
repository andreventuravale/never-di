# never-di

A lightweight, immutable, dependency-free, **function-only** dependency injection (DI) container for TypeScript.  
No decorators, no reflection, no classes - just plain functions with strong type safety.

---

## Design

`never-di` is intentionally minimal and built with these principles:

- **Immutable**: containers are never mutated, each `.register` returns a new draft.
- **Compile-time type safety**: dependency errors are caught at compile time, not runtime.
- **Function-only**: only plain functions as factories - no classes, no decorators.
- **Multi-binding**: register the same token multiple times and resolve an array of values.
- **Singletons by design**: factories run once and values are cached. Inspired by how ESM modules are loaded only once per process.
- **Lightweight**: small, simple, with no external dependencies.

---

## Scope Model

Unlike many DI frameworks, `never-di` has **one scope only**: **singleton**.

- **Singleton** (default and only scope)
  - Each token is resolved once per container.
  - Factories run only on first resolution, then values are cached.
  - Behavior is similar to ESM modules: loaded once, reused everywhere.

### Why only singletons?

- This library is built around the semantics of ESM modules.  
  It provides a way to decouple modules while preserving the same "load once and reuse" behavior.
- Simplifies reasoning: no hidden object lifetimes, no surprise instantiations.
- Ideal for **parallel testing**: immutable containers mean you can build fresh isolated containers per test.
- Keeps runtime lean: no scope tracking, no context objects, no lifecycle hooks.

### What about other scopes?

- **Transient** (new instance every resolve) is **not planned**.
  - If you need transient behavior, implement it inside your factory (e.g. return `() => new Foo()`).
- **Per-request scope** would require creating a container per request.
  - This is supported naturally since containers are immutable and cheap to create.
- **Custom scopes** are intentionally excluded.
  - The philosophy is that **factories should own their own lifecycle**.

---

## Philosophy

- **Functions are enough**: no need for classes or decorators.
- **Types lead the way**: the compiler enforces dependency correctness.
- **Runtime clarity**: resolution is explicit, caching is predictable.
- **Simplicity wins**: the API is intentionally small and minimal.

---

## Usage

### Basic Example

```ts
import { startContainer } from "never-di";

foo.dependsOn = [] as const;
function foo(): number {
  return 1;
}

bar.dependsOn = ["foo"] as const;
function bar(foo: number): string {
  return `bar(${foo})`;
}

const container = startContainer()
  .register("foo", foo)
  .register("bar", bar)
  .seal();

console.log(container.resolve("bar")); // "bar(1)"
```

### Multi-binding Example

```ts
import { startContainer } from "never-di";

handler1.dependsOn = [] as const;
function handler1(): string {
  return "h1";
}

handler2.dependsOn = [] as const;
function handler2(): string {
  return "h2";
}

const container = startContainer()
  .register("handler", handler1)
  .register("handler", handler2)
  .seal();

console.log(container.resolve("handler")); // ["h1", "h2"]
```

---

## Contributing

`never-di` is purposely minimal.

- Extra features (e.g., class support, custom scopes) are **out of scope** - fork if you need them.
- Contributions are welcome for:
  - Bug reports
  - Unit tests
  - Type improvements

The goal is to keep the core **simple, type-safe, immutable, and function-only**.
