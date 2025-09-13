// ============================================================================
// DI Type System — Fully Annotated (line-by-line) with perf patches & test fixes
// Patches applied:
//  - Non-recursive SameTokenKey via IsUnion (O(1) depth, no tuple recursion)
//  - Optional fast grouping switch (GroupByTokenFast) to avoid per-key Extract
//  - Fix: use Extract<..., Factory> where ReturnType expects a callable
//  - Restore: IntraBatchDeps / IntraBatchError for assignMany test
// Notes:
//  - Every generic parameter is commented inline where declared.
//  - Every ternary is split across lines with comments per branch.
//  - Complex conditional types are expanded and explained.
// ============================================================================

// ============================================================================
// RegistryOf<C>
// Produce the *public* (ergonomic) registry shape of a sealed Container.
// ============================================================================

export type RegistryOf<
  // C: the sealed container instance/type we want to "reflect" into a plain map
  C
> =
  // C extends Container<any, R, Lz> ? ... : never
  C extends Container<
    // any: we don't care about S (compile-time state) at this point
    any,
    // infer R: capture the container's runtime registry map (token -> factory | factory[])
    infer R extends Record<string, Factory | readonly Factory[]>,
    // infer Lz: capture the union of lazy token names from the sealed container
    infer Lz extends string
  >
    ? {
        // Iterate over token keys K in R (restricted to string to avoid symbols)
        [K in keyof R & string]:
          // ── First branch: multi-bind case ───────────────────────────────────
          // If R[K] is readonly (infer AF extends Factory)[]
          R[K] extends readonly (infer AF extends Factory)[]
            // then the public shape for that token is the factory return type
            // (note: we collapse array-of-factories to the *element* ReturnType)
            ? ReturnType<AF>
            // ── Else: single-factory case ─────────────────────────────────────
            : R[K] extends Factory
              // If single factory AND token K is lazy (i.e., in Lz)
              //   -> expose as thunk () => ReturnType
              ? [K] extends [Lz]
                ? () => ReturnType<R[K]>
                // Else eager -> expose ReturnType directly
                : ReturnType<R[K]>
              // Fallback safeguard (shouldn't happen if R is well-formed)
              : never;
      }
    // If C is not a Container, then RegistryOf<C> is never
    : never;

// ============================================================================
// AssignApi<S>
// Builder API that allows adding factories to the state S (single or batch).
// - On success: returns Stage2 with merged meta/reg entries
// - On static error: returns a descriptive error type
// ============================================================================

interface AssignApi<
  // S: compile-time builder state (holds meta/reg/lazy)
  S = {}
> {
  assign<
    // F: the factory being added (has token + dependsOn + call signature)
    F extends Factory
  >(
    // f: the factory value
    f: F
  ):
    // If S passes CheckFactory<S, F> (i.e., deps covered + params match)
    S extends CheckFactory<S, F>
      // then we advance to Stage2 with updated state (meta + reg merged)
      ? Stage2<
          WithRegistry<
            WithMeta<
              S,
              Record<
                // Tk<F>: token string of F (extracted from metadata)
                Tk<F>,
                // F: the very factory we are assigning
                F
              >
            >,
            Record<Tk<F>, F>
          >
        >
      // Else: return the static type error produced by CheckFactory
      : CheckFactory<S, F>;

  assignMany<
    // Fs: a *tuple* of factories (at least one), assigned atomically
    const Fs extends readonly [Factory, ...Factory[]]
  >(
    // fs: preserve tuple-ness for accurate static grouping
    fs: readonly [...Fs]
  ):
    // First, forbid in-batch dependencies among tokens of Fs
    IntraBatchError<Fs> extends never
      ?
          // If the batch has no in-batch deps, validate each factory against S
          S extends CheckFactory<S, Fs[number]>
            // On success: return Stage2 with registry/meta updated for the batch
            ? Stage2<WithRegistryManyTuple<WithMetaManyTuple<S, Fs>, Fs>>
            // Else: the per-factory error (uncovered deps / type mismatch)
            : CheckFactory<S, Fs[number]>
      // If in-batch deps exist, return the error type detailing conflicted tokens
      : IntraBatchError<Fs>;
}

// ============================================================================
// Container<S, R, Lz>
// The sealed runtime interface.
// - S: compile-time state threaded through for checks
// - R: runtime registry map (token -> Factory | Factory[])
// - Lz: union of lazy token names
// ============================================================================

export interface Container<
  // S: compile-time state carried by the container instance
  S = any,
  // R: runtime registry mapping token -> single or multi factories
  R extends Record<string, Factory | readonly Factory[]> = any,
  // Lz: union of token names that are lazy (require thunk on resolve/depends)
  Lz extends string = any
> {
  bind<
    // F: a *procedure* (factory not registered) executed against the container
    F extends Factory
  >(
    // f: a one-off callable (uses the same checks as assign)
    f: F
  ):
    // If S passes CheckProcedure<S, F> (deps covered + params match)
    S extends CheckProcedure<S, F>
      // success returns a thunk () => ReturnType<F> to keep a consistent discipline
      ? () => ReturnType<F>
      // else: static error surface
      : CheckProcedure<S, F>;

  resolve<
    // T: a token present in R (keyof R) and constrained to string
    T extends keyof R & string
  >(
    // token: the runtime token to resolve
    token: T
  ): Type<R, Lz, T>;
}

// ============================================================================
// DefineApi<S>
// Stage1 API for declaring a token as lazy + registering its factory.
// ============================================================================

interface DefineApi<
  // S: builder state
  S = {}
> {
  defineLazy<
    // F: the factory to declare as lazy (token inferred from metadata)
    F extends Factory
  >(
    // f: the factory value
    f: F
  ): Stage1<
    // - WithLazy: add Tk<F> to the lazy set
    // - WithMeta: record meta token -> F
    // - WithRegistry: register token -> F
    WithRegistry<
      WithMeta<
        WithLazy<S, Tk<F>>,
        Record<Tk<F>, F>
      >,
      Record<Tk<F>, F>
    >
  >;
}

// ============================================================================
// Factory & Metadata
// A factory is a callable with compile-time metadata used by the type system.
// ============================================================================

export interface Factory<
  // T: return type produced by the factory
  T = any,
  // Args: positional argument types (must match ExpectedArgs for its dependsOn)
  Args extends any[] = any[]
> extends Metadata {
  // The callable signature itself
  (...args: Args): T;
}

interface Metadata {
  // dependsOn: ordered list of dependency tokens (positional mapping)
  readonly dependsOn?: readonly string[];
  // token: the unique string key for this factory inside the container
  readonly token?: string;
}

// ============================================================================
// Stage1 & Stage2
// Two-step builder API: Stage1 allows defineLazy + assign; Stage2 allows assign + seal.
// ============================================================================

export interface Stage1<
  // S: builder state
  S = {}
> extends DefineApi<S>, AssignApi<S> {
  // Expose the structural type of the state for debugging/introspection
  readonly state: S;
}

export interface Stage2<
  // S: builder state
  S = {}
> extends AssignApi<S> {
  // Expose internal state even in Stage2
  readonly state: S;

  // seal(): produce a sealed Container or a static error (unassigned lazy)
  seal(): SealResult<S>;
}

// -------------------------------------------------------------------
// ==================== Low-level Type Utilities =====================
// -------------------------------------------------------------------

// ---------- Perf patch: non-recursive union detector ----------

type IsUnion<
  // T: candidate type to check
  T,
  // U: a copy of T (used to test assignability per branch)
  U = T
> =
  // Distribute over T (one branch per union variant)
  T extends unknown
    // If the *original* U is assignable to this branch T, it's not a union.
    // If not assignable, then T was a union (since the branch is narrower).
    ? ([U] extends [T] ? false : true)
    : never;

// ---------- Dependencies, meta, reg ----------

type AssignedKeys<
  // S: builder state
  S
> = keyof Meta<S> & string;

type Depends<
  // F: a type with possible dependsOn
  F extends Pick<Metadata, "dependsOn">
> = F extends { dependsOn: infer D extends readonly string[] } ? D : readonly [];

// NOTE: We use Extract<..., Factory> where ReturnType needs a callable, to
// avoid the "could be array" path complaining to ReturnType.

// Computes the param type for a dependency on token K, given state S.
type ParamForToken<
  // S: builder state (contains reg + lazy set)
  S,
  // K: dependency token
  K extends string,
  // R: cache of Reg<S> for convenience (defaults to Reg<S>)
  R = Reg<S>
> =
  // Check that K is a key of R (registered token)
  K extends keyof R
    ?
        // If R[K] is multi-bind (readonly Factory[])
        R[K] extends readonly Factory[]
          // parameters for multi-bind: array (runtime returns ReturnType[]). Using any[] keeps it flexible.
          ? any[]
          // Else single-factory case
          : R[K] extends Factory
            // If K is lazy (in Lazy<S>), parameter is a thunk () => ReturnType
            ? [K] extends [Lazy<S>]
              ? () => ReturnType<Extract<R[K], Factory>>
              // Else eager: plain ReturnType
              : ReturnType<Extract<R[K], Factory>>
            // defensive fallback (shouldn't occur if R is well-formed)
            : never
    // If K not in registry yet, param is never (static error path upstream)
    : never;

export type ExpectedArgs<
  // S: builder state
  S,
  // D: ordered readonly tuple of dependency tokens
  D extends readonly string[]
> = {
  // Create a mutable (via -readonly) param list corresponding to D
  -readonly [I in keyof D]: ParamForToken<S, Extract<D[I], string>>;
};

type ParamListCheck<
  // S: builder state
  S,
  // F: factory to validate
  F extends Factory
> =
  // First direction: Parameters<F> extends ExpectedArgs<...> ?
  Parameters<F> extends ExpectedArgs<S, Depends<F>>
    ?
        // Second direction: ExpectedArgs<...> extends Parameters<F> ?
        ExpectedArgs<S, Depends<F>> extends Parameters<F>
          // Success: propagate S
          ? S
          // Failure: provide precise mismatch error info
          : {
              type: "error";
              message: "dependencies type mismatch (lazy ones must be thunks)";
              // dependent token name
              dependent: Tk<F>;
              // the ordered dependencies we expected
              dependencies: Depends<F>;
            }
    // Failure of the first direction (also emit same error shape)
    : {
        type: "error";
        message: "dependencies type mismatch (lazy ones must be thunks)";
        dependent: Tk<F>;
        dependencies: Depends<F>;
      };

type CheckFactory<
  // S: builder state
  S,
  // F: factory to add
  F extends Factory
> =
  // If there are NO uncovered deps (i.e., all deps are assigned or declared lazy)
  [UncoveredDeps<S, F>] extends [never]
    // Then check the parameter list
    ? ParamListCheck<S, F>
    // Else: emit an “unassigned dependencies” error surface
    : {
        type: "error";
        message: "factory has dependencies that are not assigned";
        dependent: Tk<F>;
        unassigned_dependencies: UncoveredDeps<S, F>;
      };

type CheckProcedure<
  // S: builder state
  S,
  // F: factory to execute as a procedure
  F extends Factory
> =
  [UncoveredDeps<S, F>] extends [never]
    ? ParamListCheck<S, F>
    : {
        type: "error";
        message: "procedure has dependencies that are not assigned";
        unassigned_dependencies: UncoveredDeps<S, F>;
      };

// Union of all tokens listed in dependsOn of F.
type DepKeys<
  // F: type with dependsOn
  F extends Pick<Metadata, "dependsOn">
> = F extends { dependsOn: infer D extends readonly string[] } ? D[number] : never;

// Union of dependencies for a tuple of factories.
type DepsOf<
  // Fs: tuple/array of factories
  Fs extends readonly Factory[]
> = DepKeys<Fs[number]>;

// ============================================================================
// Grouping (precise vs fast)
// ============================================================================

// Toggle: keep typed as union-filtered array (precise) or bucketed (fast).
// - false  → precise (per-key Extract; slower on large Fs)
// - true   → fast     (looser arrays; much cheaper on compiler)
type UseLooseGrouping = true;

// Precise version (original): per-key filtered arrays
type GroupByTokenPrecise<
  // Fs: tuple/array of factories
  Fs extends readonly Factory[]
> = {
  [K in TokenOf<Fs[number]>]: Extract<Fs[number], { token: K }>[];
};

// Loose/fast version: buckets may contain differing token items (at type level)
type GroupByTokenLoose<
  // Fs: tuple/array of factories
  Fs extends readonly Factory[]
> = Partial<Record<TokenOf<Fs[number]>, Fs[number][]>>;

// Dispatcher to choose precise vs fast at compile time
type GroupByTokenFast<
  // Fs: tuple/array of factories
  Fs extends readonly Factory[]
> =
  UseLooseGrouping extends true
    ? GroupByTokenLoose<Fs>
    : GroupByTokenPrecise<Fs>;

// ============================================================================
// Tuple helpers and state projections
// ============================================================================

type Head<
  // T: tuple/array
  T extends readonly unknown[]
> = T extends readonly [infer H, ...unknown[]] ? H : never;

type Tail<
  // T: tuple/array
  T extends readonly unknown[]
> = T extends readonly [unknown, ...infer R] ? R : readonly [];

type Lazy<
  // S: builder state
  S
> = S extends { lazy: infer L }
  ? L extends string
    ? L
    : never
  : never;

type Meta<
  // S: builder state
  S
> = S extends { meta: infer M } ? M : {};

type Reg<
  // S: builder state
  S
> = S extends { reg: infer R extends Record<string, Factory | readonly Factory[]> }
  ? R
  : never;

// Canonical return type for resolve(T), with Extract to ensure callables for ReturnType.
type Type<
  // R: runtime registry
  R extends Record<string, Factory | readonly Factory[]>,
  // Lz: union of lazy token names
  Lz extends string,
  // T: requested token (key of R)
  T extends keyof R
> =
  // If R[T] is multi-bind (array of factories)
  R[T] extends readonly (infer AF extends Factory)[]
    // resolve returns ReturnType<AF>[] (never lazy in multi-bind)
    ? AF extends Factory
      ? ReturnType<AF>[]
      : never
    // Else single-factory case
    : R[T] extends Factory
      // If token is lazy → thunk
      ? [T] extends [Lz]
        ? () => ReturnType<Extract<R[T], Factory>>
        // Else eager → direct ReturnType
        : ReturnType<Extract<R[T], Factory>>
      // defensive fallback
      : never;

// ============================================================================
// Perf patch: O(1) SameTokenKey via union-ness check (no recursion)
// ============================================================================

type TokenOf<
  // F: factory type
  F extends Factory
> = NonNullable<F["token"]>;

type TokensOf<
  // Fs: tuple/array of factories
  Fs extends readonly Factory[]
> = TokenOf<Fs[number]>;

// If TokensOf<Fs> is NOT a union, it must be a single literal → that’s our K.
// Otherwise return never. (No tuple recursion required.)
type SameTokenKey<
  // Fs: tuple/array of factories
  Fs extends readonly Factory[]
> =
  IsUnion<TokensOf<Fs>> extends false
    ? TokensOf<Fs>
    : never;

// ============================================================================
// Seal checks and uncovered deps
// ============================================================================

type UnassignedLazy<
  // S: builder state
  S
> = Exclude<
  // All lazy tokens
  Lazy<S>,
  // Remove those already assigned (keys of meta)
  AssignedKeys<S>
>;

type SealCheck<
  // S: builder state
  S
> =
  [UnassignedLazy<S>] extends [never]
    // OK: pass S through
    ? S
    // Else: emit a static error describing unassigned lazy tokens
    : {
        type: "error";
        message: "one or more lazy factories remain unassigned";
        unassigned_tokens: UnassignedLazy<S>;
      };

type SealResult<
  // S: builder state
  S
> =
  SealCheck<S> extends S
    ? Container<
        // S: carry the same compile-time state
        S,
        // Reg<S>: the finalized registry map
        Reg<S>,
        // Lazy<S>: the finalized lazy token set
        Lazy<S>
      >
    : SealCheck<S>;

type Tk<
  // M: type carrying { token?: string }
  M extends Metadata
> = M extends { token: infer K extends string } ? K : never;

// Dependencies of F that are neither already assigned nor declared lazy.
type UncoveredDeps<
  // S: builder state
  S,
  // F: a type with dependsOn
  F extends Pick<Metadata, "dependsOn">
> = Exclude<
  // All dependency tokens of F
  DepKeys<F>,
  // Tokens that are *covered* either by meta (assigned) or by lazy set
  keyof Meta<S> | Lazy<S>
>;

// ============================================================================
// In-batch dependency detection (assignMany)
// (Deduplicated: uses the earlier DepKeys/DepsOf definitions.)
// ============================================================================

type IntraBatchDeps<
  // Fs: tuple/array of factories
  Fs extends readonly Factory[]
> = Extract<DepsOf<Fs>, TokensOf<Fs>>;

type IntraBatchError<
  // Fs: tuple/array of factories
  Fs extends readonly Factory[]
> =
  IntraBatchDeps<Fs> extends never
    ? never
    : {
        type: "error";
        message: "assignMany forbids in-batch dependencies";
        tokens: IntraBatchDeps<Fs>;
      };

// ============================================================================
// State merge helpers (meta / reg / lazy)
// ============================================================================

type WithLazy<
  // S: builder state
  S,
  // Token: token to mark as lazy
  Token
> = S extends { lazy: infer Prev }
  // If lazy set already exists, union
  ? S & { lazy: Prev | Token }
  // Else initialize
  : S & { lazy: Token };

type WithMeta<
  // S: builder state
  S,
  // Merged: a map to merge into meta
  Merged
> = S extends { meta: infer Prev }
  // If meta exists, merge (intersection)
  ? S & { meta: Prev & Merged }
  // Else initialize
  : S & { meta: Merged };

type WithMetaManyTuple<
  // S: builder state
  S,
  // Fs: tuple of factories being assigned together
  Fs extends readonly Factory[]
> =
  // If all share the same token, prefer the compact Record<K, Fs> form
  SameTokenKey<Fs> extends infer K extends string
    ? S extends { meta: infer M }
      // merge into existing meta
      ? Omit<S, "meta"> & { meta: M & Record<K, Fs> }
      // or initialize meta
      : S & { meta: Record<K, Fs> }
    // Else: group by token (precise or fast, based on UseLooseGrouping)
    : S extends { meta: infer M }
      ? Omit<S, "meta"> & { meta: M & GroupByTokenFast<Fs> }
      : S & { meta: GroupByTokenFast<Fs> };

type WithRegistry<
  // S: builder state
  S,
  // F: a map token -> Factory
  F extends Record<string, Factory>
> = S extends { reg: infer Prev extends Record<string, Factory> }
  // If reg exists, merge
  ? S & { reg: Prev & F }
  // Else initialize
  : S & { reg: F };

type WithRegistryManyTuple<
  // S: builder state
  S,
  // Fs: tuple of factories
  Fs extends readonly Factory[]
> =
  SameTokenKey<Fs> extends infer K extends string
    ? S extends { reg: infer R }
      // Merge compact form: token K -> Fs (tuple)
      ? Omit<S, "reg"> & { reg: R & Record<K, Fs> }
      // Initialize reg
      : S & { reg: Record<K, Fs> }
    // Mixed tokens case: grouped map (precise or fast)
    : S extends { reg: infer R }
      ? Omit<S, "reg"> & { reg: R & GroupByTokenFast<Fs> }
      : S & { reg: GroupByTokenFast<Fs> };

// ============================================================================
// End — fully annotated, perf-conscious, and test-complete
// ============================================================================
