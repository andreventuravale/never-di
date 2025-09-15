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

```ts
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

```ts
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

```ts
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

```ts
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

---

# Compile-time guarantees (with examples)

## 1) Only depend on **already-registered** tokens

✅ good
```ts
Foo.token = "Foo" as const;
function Foo() { return 123; }

Bar.token = "Bar" as const;
Bar.dependsOn = ["Foo"] as const;
function Bar(foo: number) { return foo.toString(); }

createContainerDraft()
  .assign(Foo)
  .assign(Bar)
  .seal();
```

❌ type error (unknown token)
```ts
Bar.token = "Bar" as const;
Bar.dependsOn = ["Missing"] as const;
function Bar(x: unknown) { return x; }

createContainerDraft()
  .assign(Bar);
// Error: Bar.dependsOn includes "Missing", which is not in the draft registry.
```

---

## 2) Parameter types must match dependency **token types**

✅ good
```ts
Foo.token = "Foo" as const;
function Foo() { return 123; }

Bar.token = "Bar" as const;
Bar.dependsOn = ["Foo"] as const;
function Bar(foo: number) { return foo.toFixed(2); }

createContainerDraft().assign(Foo).assign(Bar).seal();
```

❌ type error
```ts
Foo.token = "Foo" as const;
function Foo() { return 123; }

Bar.token = "Bar" as const;
Bar.dependsOn = ["Foo"] as const;
function Bar(foo: string) {
  return foo.toUpperCase();
}
// Error: Parameter 1 of Bar must be the type produced by token "Foo" (number).
```

---

## 3) Dependency **order** is enforced

✅ good
```ts
A.token = "A" as const;
function A() { return { a: 1 }; }

B.token = "B" as const;
function B() { return { b: 2 }; }

C.token = "C" as const;
C.dependsOn = ["A", "B"] as const;
function C(a: { a: number }, b: { b: number }) {
  return [a.a, b.b];
}

createContainerDraft().assign(A).assign(B).assign(C).seal();
```

❌ type error
```ts
C.token = "C" as const;
C.dependsOn = ["A", "B"] as const;
function C(b: { b: number }, a: { a: number }) {
  return [a.a, b.b];
}
// Error: Param1 must match "A", Param2 must match "B"
```

---

## 4) **Lazy** tokens resolve to **thunks**

✅ good
```ts
Foo.token = "Foo" as const;
function Foo() { return { foo: 42 }; }

Bar.token = "Bar" as const;
Bar.dependsOn = ["Foo"] as const;
function Bar(foo: () => { foo: number }) {
  return foo().foo + 1;
}

createContainerDraft()
  .defineLazy(Foo)
  .assign(Foo)
  .assign(Bar)
  .seal();
```

❌ type error
```ts
Bar.token = "Bar" as const;
Bar.dependsOn = ["Foo"] as const;
function Bar(foo: { foo: number }) {
  return foo.foo + 1;
}
// Error: Token "Foo" is lazy; dependents must accept () => { foo: number }
```

---

## 5) **Multi-bind** factories must share the same return type

✅ good
```ts
H1.token = "Handler" as const; function H1() { return "h1"; }
H2.token = "Handler" as const; function H2() { return "h2"; }

createContainerDraft()
  .assignMany([H1, H2])
  .seal();
```

❌ type error
```ts
H1.token = "Handler" as const; function H1() { return "h1"; }
H2.token = "Handler" as const; function H2() { return 123; }

createContainerDraft()
  .assignMany([H1, H2]);
// Error: All factories for token "Handler" must return the same type
```

---

## 6) `resolve(token)` is **token-safe** and value-typed

✅ good
```ts
Foo.token = "Foo" as const;
function Foo() { return 123; }

const c = createContainerDraft().assign(Foo).seal();
const x = c.resolve("Foo");   // number
x.toFixed(2);
```

❌ type error
```ts
const c = createContainerDraft().seal();
c.resolve("Nope");
// Error: "Nope" is not a registered token
```

---

## 7) Predeclare tokens with `defineLazy` and wire later

✅ good
```ts
A.token = "A" as const;
A.dependsOn = ["B"] as const;
function A(b: () => string) { return "A->" + b(); }

B.token = "B" as const;
B.dependsOn = ["A"] as const;
function B(a: () => string) { return "B->" + a(); }

const c = createContainerDraft()
  .defineLazy(A)
  .assign(A)
  .assign(B)
  .seal();

c.resolve("A");
```

---

## 8) `bind(fn)` checks the **dependency signature** too

✅ good
```ts
Svc.token = "Svc" as const;
function Svc() { return { ping: () => "pong" }; }

Runner.dependsOn = ["Svc"] as const;
function Runner(svc: { ping: () => string }) {
  return () => console.log(svc.ping());
}

const c = createContainerDraft().assign(Svc).seal();
c.bind(Runner)(); // prints "pong"
```

❌ type error
```ts
Runner.dependsOn = ["Svc"] as const;
function Runner(svc: { nope: () => void }) { }
// Error: Parameter for "Svc" must match its produced type
```

---

## 9) Bonus: end-to-end misuse is caught

❌ type error
```ts
Foo.token = "Foo" as const;
function Foo() { return 123; }

const c = createContainerDraft().assign(Foo).seal();
const v = c.resolve("Foo"); // number
v.toUpperCase();
// Error: 'toUpperCase' does not exist on type 'number'
```

---

## Notes

- No class support, no decorators, no custom scopes — intentionally out of scope.
- Contributions are welcome for:
  - Bug reports
  - Unit tests
  - Type improvements

Inspired by [typed-inject](https://github.com/nicojs/typed-inject), but with a simpler, function-only design.
