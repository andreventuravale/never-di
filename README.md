# never-di

A lightweight, immutable, dependency-free, function-only dependency injection (DI) container for TypeScript.
No decorators, no reflection, no classes - just plain functions with strong compile-time type safety.

---

## Key Aspects

- **Immutability** – every register call produces a new container.
- **Compile-time type safety** – dependencies must already exist in the container when declared; errors are caught before runtime.
- **Multi-binding** – registering the same token multiple times resolves to an array of values.
- **Lightweight** – minimal, clear, and easy to reason about.
- **Dependency-free** – no runtime dependencies.
- **Functional-only** – designed for factory functions; no classes, no decorators.

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
