# never-di

A lightweight, immutable, dependency-free, **function-only** dependency injection (DI) container for TypeScript.  
No decorators, no reflection, no classes - just plain functions with strong type safety.

---

## Design

`never-di` is intentionally minimal and built with these principles:

- **Immutable**: container drafts are never mutated[^1]  - each call to `.register` produces a new draft.
- **Compile-time type safety**: dependency errors are caught at compile time, not runtime.
- **Function-only**: only plain functions as factories - no classes, no decorators.
- **Multi-binding**: register the same token multiple times and resolve an array of results.
- **Singletons by design**: factories run once and results are cached.
- **Lightweight**: small, simple, with no external dependencies.

*[^1]: Immutability applies only to drafts. Once `seal()` is called, the resulting container is mutable in the sense that resolved values update its internal cache/state.*

---

## Scope Model

Unlike many DI frameworks, `never-di` has **one scope only**: **singleton**.

- **Singleton** (default and only scope)
  - Each token is resolved once per container.
  - Factories run only on first resolution, then results are cached.
  - Behavior is similar to ESM modules: loaded once, reused everywhere.

### Why only singletons?

- This library was created out of the need to test ESM modules in parallel while keeping their dependencies decoupled.
  It provides a way to separate modules while still preserving the familiar “load once and reuse” behavior.
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

### Basics

```ts
import { createContainerDraft } from "never-di";

function foo(): number {
  return 1;
}

bar.dependsOn = ["foo"] as const;

function bar(foo: number): string {
  return `bar(${foo})`;
}

const container = createContainerDraft()
  .register("foo", foo)
  .register("bar", bar)
  .seal();

console.log(container.resolve("bar")); // "bar(1)"
```

### Multi-binding

> From the second registration onward, the token’s type becomes an array of its original element type.

```ts
import { createContainerDraft } from "never-di";

function handler1(): string {
  return "h1";
}

function handler2(): string {
  return "h2";
}

const container = createContainerDraft()
  .register("handler", handler1)
  .register("handler", handler2)
  .seal();

console.log(container.resolve("handler")); // ["h1", "h2"]
```

### The bind method

> Returns a function of the same return type, with dependencies pre-bound from the container.

```ts
import { createContainerDraft } from "never-di";

add.dependsOn = ["x", "y"] as const;

function add(x: number, y: number): number {
  return x + y;
}

const container = createContainerDraft()
  .register("x", () => 2)
  .register("y", () => 3)
  .seal();

const addFn = container.bind(add);

console.log(addFn()); // 5
```

### Multi-binding type safety

> Registering a factory under an existing token with a different type breaks the fluent chain, forcing the user to correct the types.

```ts
import { createContainerDraft } from "never-di";

function n1(): number {
  return 1;
}

function s1(): string {
  return "oops";
}

const c1 = createContainerDraft().register("value", n1);

// ❌ Compile-time error: cannot change multi-bind element type from number -> string
const c2 = c1.register("value", s1);

// ❌ Compile-time error: if forced with @ts-expect-error, runtime still succeeds,
// but the types collapse to never,
// producing a type error when sealing.
console.log(c2.seal().resolve("value")); // [1, "oops"]
```

---

## Notes

**never-di** is purposely minimal.

- Extra features (e.g., class support, custom scopes) are **out of scope** - fork if you need them.
- Contributions are welcome for:
  - Bug reports
  - Unit tests
  - Type improvements

The goal is to keep the core **simple, type-safe, immutable, and function-only**.

We’ve borrowed a few concepts from [typed-inject](https://github.com/nicojs/typed-inject) - it’s worth checking out.  
Credit goes to them for ideas around type-checking, the fluent API, and their decorator-less approach using the `inject` static property.
