# never-di

A lightweight, immutable, dependency-free, **function-only** dependency injection (DI) container for TypeScript.
No decorators, no reflection, no classes — just plain functions with strong type safety.

---

## Why

Most DI libraries are heavy, rely on decorators or reflection, and introduce runtime magic.  
`never-di` was created to provide:

- **Type-driven DI**: errors are caught at compile time, not runtime.  
- **Function-only approach**: only factory functions.
- **Minimal footprint**: no runtime bloat, no decorators, no metadata reflection.  
- **Predictable runtime**: clear dependency resolution and cycle detection.

---

## Goals

- ✅ **Type safety**: dependencies must already exist in the container when declared.  
- ✅ **Runtime safety**: detects cycles and missing tokens at runtime.  
- ✅ **Multi-binding**: register the same token multiple times and resolve an array of values.  
- ✅ **Clean IntelliSense**: no nested or noisy types — the registry evolves cleanly.  
- ✅ **Lightweight**: designed to be easy to understand and use.  

---

## Philosophy

- **Functions are enough**: no need for classes or decorators.  
- **Types should lead**: the compiler enforces dependency correctness.  
- **Runtime clarity**: resolution is explicit, cycles are reported with clear paths.  
- **Less is more**: the API is intentionally small and minimal.  

---

## Comparison

| Feature                   | never-di             | InversifyJS / tsyringe   |
|----------------------------|--------------------|---------------------------|
| Decorators required        | ❌ No              | ✅ Yes                    |
| Reflection / metadata      | ❌ No              | ✅ Yes                    |
| Class-based                | ❌ No              | ✅ Yes                    |
| Type-checked dependencies  | ✅ Compile time    | ⚠️ Partial (runtime)      |
| Multi-binding support      | ✅ Arrays          | ✅ Arrays                 |
| Cycle detection            | ✅ Explicit error  | ⚠️ Often runtime only     |
| Bundle size                | Tiny (<2 KB)      | Large                      |

---

## Usage

### Basic Example

```ts
import { DiRuntime } from "never-di";

const runtime = DiRuntime();

const draft = runtime.startContainer();

foo.dependsOn = [] as const;

function foo(): number {
  return 1;
}

bar.dependsOn = ["foo"] as const;

function bar(foo: number): string {
  return `bar(${foo})`;
}

const container = draft
  .register("foo", foo)
  .register("bar", bar)
  .seal();

console.log(sealed.resolve("bar")); // "bar(1)"
```

### Multi-binding Example

```ts
handler1.dependsOn = [] as const;

function handler1(): string {
  return "h1";
}

handler2.dependsOn = [] as const;

function handler2(): string {
  return "h2";
}

const container = draft
  .register("handler", handler1)
  .register("handler", handler2)
  .seal();

console.log(container.resolve("handler")); // ["h1", "h2"]
```

## Contributing

never-di is intentionally minimal.

- If you want **extra features** (e.g., class support, different resolver strategies), please **fork the library**.
- This project will not support classes or reflection-based resolvers by design.

You are welcome to:

- Report issues.
- Contribute **unit tests** to expand coverage and validate more scenarios.

The goal is to keep the core **simple, type-safe, and function-only**.