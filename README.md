# never-di

A lightweight, dependency-free, **function-only** dependency injection (DI) container for TypeScript.  
No decorators, no reflection, no classes — just plain functions with strong type safety.

---

## Design

`never-di` is intentionally minimal and built with these principles:

- **Function-only**: factories are plain functions. No classes, no decorators.
- **Compile-time type safety**: dependency errors are caught at compile time, not runtime.
- **Multi-binding**: register multiple factories for the same token and resolve an array.
- **Lazy dependencies**: explicitly mark tokens as lazy, and they resolve to thunks.
- **Singletons by design**: factories run once and results are cached.
- **Lightweight**: small, simple, no external dependencies.

---

## Scope Model

There is exactly **one scope**: **singleton**.

- Each token is resolved once per container.
- Factories run only on first resolution, then results are cached.
- Similar to ESM modules: load once, reuse everywhere.

If you need per-request behavior, create a new container instance.  
If you need transient behavior, put it inside your factory.

---

## API

### `createContainerDraft()`

Start building a container draft:

```
import { createContainerDraft } from "never-di";
```

The draft exposes:

- `assign(factory)` – assign a single factory to its token.
- `assignMany([factories])` – assign multiple factories for the same token (multi-binding).
- `defineLazy(factory)` – mark a factory’s token as lazy; the container enforces that it must be assigned before sealing. Intended to allow direct cyclic dependencies.
- `seal()` – finalize the container; returns a runtime `Container` with `resolve` and `bind`.

---

## Usage

### Basics

```
import { createContainerDraft } from "never-di";

foo.token = "foo" as const;
function foo(): number {
  return 1;
}

bar.token = "bar" as const;
bar.dependsOn = ["foo"] as const;
function bar(foo: number): string {
  return `bar(${foo})`;
}

const container = createContainerDraft()
  .assign(foo)
  .assign(bar)
  .seal();

console.log(container.resolve("bar")); // "bar(1)"
```

### Multi-binding

```
import { createContainerDraft } from "never-di";

h1.token = "handler" as const;
function h1(): string { return "h1"; }

h2.token = "handler" as const;
function h2(): string { return "h2"; }

const container = createContainerDraft()
  .assignMany([h1, h2])
  .seal();

console.log(container.resolve("handler")); // ["h1", "h2"]
```

### Lazy dependencies ( breaking cycles )

```
import { createContainerDraft } from "never-di";

Foo.token = "Foo" as const;
Foo.dependsOn = ["Bar"] as const;
function Foo(b: { bar: string }) {
  return { foo: "foo->" + b.bar };
}

Bar.token = "Bar" as const;
Bar.dependsOn = ["Foo"] as const;
function Bar(foo: () => { foo: string }) {
  return { bar: "bar->" + foo().foo };
}

const c = createContainerDraft()
  .defineLazy(Foo)
  .assign(Foo)
  .assign(Bar)
  .seal();

const bar = c.resolve("Bar");

console.log(bar.bar);
```

### The bind method ( usually for side-effects )

```
import { createContainerDraft } from "never-di";

Foo.token = "Foo" as const;
Foo.dependsOn = ["Bar"] as const;
function Foo(b: { bar: string }) {
  return { foo: "foo->" + b.bar };
}

Bar.dependsOn = ["Foo"] as const;
function Bar(foo: () => { foo: string }) {
  console.log({ bar: "bar->" + foo().foo });
}

const c = createContainerDraft()
  .defineLazy(Foo)
  .assign(Foo)
  .seal();

const bar = c.bind(Bar);

bar();
```

### Type safety

- Tokens must match existing assignments when declaring dependencies.
- Multi-bind factories must share the same return type.
- Lazy tokens must be explicitly assigned before sealing, otherwise `seal()` throws.

---

## Notes

- No class support, no decorators, no custom scopes — intentionally out of scope.
- Contributions are welcome for:
  - Bug reports
  - Unit tests
  - Type improvements

Inspired in part by [typed-inject](https://github.com/nicojs/typed-inject), but with a simpler, function-only design.
