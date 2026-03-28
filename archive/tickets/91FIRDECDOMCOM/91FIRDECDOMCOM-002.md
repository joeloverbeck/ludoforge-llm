# 91FIRDECDOMCOM-002: Domain check compilation (patterns 1-5)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — extends `first-decision-compiler.ts`
**Deps**: archive/tickets/91FIRDECDOMCOM/91FIRDECDOMCOM-001.md

## Problem

With the effect-tree walker in place (001), we need to compile the found
`FirstDecisionNode` into a fast closure that directly queries game state
for the first decision's option domain — bypassing the AST interpreter
entirely. The spec defines 5 compilable patterns; actions not matching any
pattern fall through to the interpreter.

## Assumption Reassessment (2026-03-28)

1. `OptionsQuery` on `chooseOne`/`chooseN` nodes describes the domain
   source (token query, zone query, enum list, int range). Confirmed in
   `types-ast.ts` — the `options` field on choice nodes carries the query.
2. `tryCompileCondition` from `condition-compiler.ts` (Spec 90) compiles
   `ConditionAST → CompiledConditionPredicate | null`. Guard conditions
   preceding the first decision can be composed via this.
3. The kernel does NOT expose `resolveTokenQuery` / `resolveZoneQuery`
   helpers. Query execution is centralized in `evalQuery(query, ctx)` from
   `eval-query.ts`. Any compiled first-decision check should reuse that
   surface instead of introducing parallel query-resolution helpers.
4. The 001 walker metadata is sufficient for structurally unconditional
   first decisions, but NOT for branch- or loop-dependent first-decision
   semantics. A single `FirstDecisionNode` does not preserve enough
   structure to safely compile:
   - `if` paths where a later sibling effect can become the runtime-first
     decision when the guard fails
   - `if` paths where both branches can produce different first decisions
   - `forEach` paths where zero iterations can expose a later sibling
     decision
5. `ChoiceOption` does have shape
   `{ value, legality, illegalReason, resolution? }`, but the current
   option legality pipeline derives those fields by probing downstream
   completion paths in `legal-choices.ts`. Structural “single decision”
   alone does NOT prove that the first-domain result can replace
   `legalChoicesDiscover`.
6. 001 already introduced the series-local structural walker and path
   metadata in `first-decision-compiler.ts`. 002 should extend that module
   for the safe unconditional subset, but must not pretend that
   `findFirstDecisionNode` alone can faithfully model divergent
   branch/loop topologies.

## Architecture Check

1. The beneficial architecture here is a conservative compiler for the
   unconditional subset, not a speculative “compile all 5 patterns” layer
   built on insufficient metadata. A wrong fast-path is worse than no
   fast-path.
2. The compiled closure should operate on `ReadContext`, not just
   `(state, activePlayer)`. The actual kernel query and condition surfaces
   need bindings, adjacency, runtime tables, and optional free-operation
   overlays. Using `ReadContext` avoids parallel pseudo-context APIs.
3. Query evaluation must stay DRY by delegating to `evalQuery`. The
   compiler decides WHEN a direct query check is safe; it must not
   duplicate HOW queries are evaluated.
4. `GameDefRuntime` is the right home for precomputed immutable
   first-decision checks. Hiding them in an extra module-level WeakMap is
   less explicit and less aligned with the runtime’s existing role as the
   canonical container for derived immutable kernel structures.
5. The “single-decision bypass” should be removed from this ticket’s
   scope. Until we have a proof-producing plan compiler for downstream
   post-choice legality, a pure admissibility filter is the correct
   architecture.

## What to Change

### 1. Add unconditional first-decision compilation to `first-decision-compiler.ts`

```typescript
function compileFirstDecisionDomain(
  actionEffects: readonly EffectAST[],
): FirstDecisionDomainResult
```

Internally:
1. Call `findFirstDecisionNode(actionEffects)`.
2. If `null`, return `{ compilable: false }` (no decisions — action is
   always admissible, but this is not this function's concern).
3. Reject any node with `guardConditions.length > 0` or
   `insideForEach === true`. Those topologies are not safely compilable by
   the current metadata and must fall through to the interpreter.
4. For the remaining structurally unconditional cases, compile a closure
   over `ReadContext` that returns `admissible: evalQuery(options, ctx).length > 0`.
5. This compiler deliberately covers the safe subset only:
   - direct token queries
   - direct zone queries
   - direct enum/int-range queries
   - any other direct `OptionsQuery` that `evalQuery` can already resolve
     without extra structural simulation
6. Remove `domain` / `isSingleDecision` concerns from this ticket’s
   runtime output. The result is a fast rejection filter only.

### 2. Add runtime-owned caches for compiled checks

Extend `GameDefRuntime` with immutable maps for precompiled results:

- plain-action first-decision checks keyed by `ActionId`
- pipeline-profile first-decision checks keyed by pipeline profile id

Build them in `createGameDefRuntime(def)` by compiling:

- `action.effects` for plain actions
- the first pipeline stage sequence whose earlier stages contain no
  structural decisions; if an earlier stage contains a non-compilable
  structural first decision, the profile is marked non-compilable

Do NOT add a new standalone `first-decision-cache.ts`. Keep this runtime
data explicit and colocated with the rest of the immutable runtime
derivations.

### 3. Integrate the admissibility filter into `legal-moves.ts`

At the existing plain-action and pipeline admission call sites:

1. Look up the precompiled first-decision result from `runtime`.
2. If there is no compiled check or it is not compilable, fall through to
   `isMoveDecisionSequenceAdmittedForLegalMove`.
3. If a compiled check exists, evaluate it against the already-prepared
   `ReadContext` for that call site.
4. If the compiled result returns `admissible: false`, skip the move.
5. If the compiled check throws (for example due to missing bindings in a
   query filter), fall back to the canonical interpreter path rather than
   risking a false negative.

This ticket does NOT bypass `legalChoicesDiscover`, does NOT synthesize
`ChoiceOption[]`, and does NOT alter event-card discovery.

## Files to Touch

- `packages/engine/src/kernel/first-decision-compiler.ts` (modify — add compilation)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — store compiled results)
- `packages/engine/src/kernel/legal-moves.ts` (modify — use compiled admissibility filter)
- `packages/engine/test/unit/kernel/first-decision-compiler.test.ts` (new)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify — admission-filter integration coverage)

## Out of Scope

- Cache infrastructure — that is 91FIRDECDOMCOM-003.
- Event card effect compilation / event-path integration.
- Branch- or loop-dependent first-decision compilation (`if`, `forEach`,
  or any topology whose runtime-first decision can diverge from the 001
  node descriptor).
- Synthesizing `ChoiceOption[]` or any “single-decision full bypass”.
- Adding new query resolution functions to the kernel. The compiled
  closures must use `evalQuery`.
- Modifying `condition-compiler.ts` or `compiled-condition-cache.ts`.
- Broad repo-wide consolidation of all existing effect walkers. If future
  work needs a structural plan compiler, that should be proposed
  explicitly rather than smuggled into this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. Direct `chooseOne` / `chooseN` with `options: { query: 'enums', ... }`
   compiles and returns admissible iff `evalQuery` returns a non-empty
   result.
2. Direct `intsInRange` / `intsInVarRange` first decisions compile and
   agree with `evalQuery` result cardinality.
3. Direct token-query first decisions compile and return admissible based
   on runtime token availability.
4. Direct zone-query first decisions compile and return admissible based
   on runtime zone availability.
5. Actions whose first decision is under `if` guards are marked
   `{ compilable: false }`.
6. Actions whose first decision is inside `forEach` are marked
   `{ compilable: false }`.
7. Pipeline profiles compile only when the earliest stage that can produce
   a first decision is structurally unconditional; otherwise they are
   marked non-compilable.
8. `legalMoves(..., { probePlainActionFeasibility: true })` uses the
   compiled check to filter unconditional empty-domain plain actions
   without changing observable behavior.
9. Pipeline legal-move enumeration uses the compiled check to filter
   unconditional empty-domain pipeline actions without changing observable
   behavior.
10. Existing relevant suite plus targeted first-decision and legal-moves
    tests pass.

### Invariants

1. Compiled closures are pure functions of `ReadContext`.
2. No game-specific pattern matching — compilation is based on generic
   `EffectAST` structure plus generic `OptionsQuery` execution via
   `evalQuery`.
3. Unsupported structural topologies fail closed to
   `{ compilable: false }`; they do not guess.
4. The optimization is a fast rejection filter only. It must never
   synthesize option legality or bypass the canonical discovery engine in
   this ticket.
5. The runtime cache lives in `GameDefRuntime`, not an extra hidden
   module-level cache.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/first-decision-compiler.test.ts` —
   Unit tests for `compileFirstDecisionDomain` and pipeline-profile
   compilation over direct-query and unsupported guarded/looped cases.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` —
   Targeted plain-action and pipeline enumeration tests proving that
   unconditional empty first-decision domains are filtered while guarded /
   looped cases conservatively fall back to the interpreter.

### Commands

1. `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/kernel/first-decision-compiler.test.ts`
2. `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/kernel/legal-moves.test.ts`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-28
- What actually changed:
  - Added conservative first-decision admissibility compilation in
    `first-decision-compiler.ts` for structurally unconditional direct
    choice queries, executed through `evalQuery(ReadContext)`.
  - Added runtime-owned first-decision compilation caches to
    `GameDefRuntime`.
  - Integrated the compiled filter into the plain-action feasibility path
    and the main pipeline legal-move admission path in `legal-moves.ts`.
  - Added unit coverage for direct-query compilation, guarded/looped
    fallback, and runtime-backed legal-move filtering.
- Deviations from original plan:
  - Removed the proposed guarded / `forEach` compilation patterns from
    scope because the 001 walker metadata is not sufficient to model
    branch- and loop-dependent runtime-first-decision semantics safely.
  - Removed the proposed single-decision full-bypass / `ChoiceOption[]`
    synthesis. The implemented optimization is a fast rejection filter
    only.
  - Stored compiled results in `GameDefRuntime` instead of introducing a
    standalone cache module.
- Verification results:
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
  - `pnpm -F @ludoforge/engine test` ✅
