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
  - If you need transient behavior, implement it inside your factory.
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

> From the second registration onward, the token’s type becomes an array of its original element type.

```ts
import { startContainer } from "never-di";

function handler1(): string {
  return "h1";
}

function handler2(): string {
  return "h2";
}

const container = startContainer()
  .register("handler", handler1)
  .register("handler", handler2)
  .seal();

console.log(container.resolve("handler")); // ["h1", "h2"]
```

### The bind method

> Returns a function of the same return type, with dependencies pre-bound from the container.

```ts
import { startContainer } from "never-di";

add.dependsOn = ["x", "y"] as const;

function add(x: number, y: number): number {
  return x + y;
}

const container = startContainer()
  .register("x", () => 2)
  .register("y", () => 3)
  .seal();

const addFn = container.bind(add);

console.log(addFn()); // 5
```

### Multi-binding Type Safety

> Registering a factory under an existing token with a different type breaks the fluent chain, forcing the user to correct the types.

```ts
import { startContainer } from "never-di";

n1.dependsOn = [] as const;

function n1(): number { return 1; }

s1.dependsOn = [] as const;

function s1(): string { return "oops"; }

const c1 = startContainer().register("value", n1);

// ❌ Compile-time error: cannot change multi-bind element type from number -> string
// @ts-expect-error
const c2 = c1.register("value", s1);

// If you force it with @ts-expect-error, runtime still works, but types collapse to `never`
console.log(c2.seal().resolve("value")); // [1, "oops"]
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
