# 89SCOMUTEXECON-005: Mutable scope in enumerateParams (Phase 2)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/legal-moves.ts
**Deps**: archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-002-mutable-read-scope-foundations.md

## Problem

`enumerateParams` in `legal-moves.ts` still rebuilds a fresh `ReadContext`
for every condition/domain evaluation during parameter enumeration. The object
shape is already the correct fixed 11-field `ReadContext` contract, but
`enumerateParams` recreates that same shape repeatedly through the local
`makeEvalContext` helper even though only `activePlayer` and `bindings` vary
between recursive steps. For multi-parameter actions and large domains, this
creates avoidable short-lived allocations in a hot path.

## Assumption Reassessment (2026-03-28)

1. `makeEvalContext` (legal-moves.ts:328-351) wraps `createEvalContext` with a conditional spread for `freeOperationOverlay` — **confirmed**.
2. `enumerateParams` (legal-moves.ts:353-524) calls `makeEvalContext` at lines ~415 and ~488 to create ReadContext for condition evaluation — **confirmed**.
3. `enumerateParams` is recursive (calls itself with incremented `paramIndex`) — **confirmed**. Each recursion level evaluates conditions with a different `bindings` object.
4. `createEvalContext` (eval-context.ts) already materializes the fixed
   11-field `ReadContext` shape with own properties for
   `runtimeTableIndex`, `freeOperationOverlay`, and `maxQueryResults` —
   **confirmed discrepancy with the original ticket framing**.
5. The ReadContext created here is used only for `evalCondition` / `evalValue` calls within the same synchronous frame — it does not escape — **confirmed**.
6. Ticket `003` already established the dispatch-owned scope model for effect
   execution. This ticket should stay local to move enumeration and must not
   couple `legal-moves.ts` to effect-dispatch plumbing — **confirmed scope
   boundary**.
7. `createEvalContext` still has many non-`legal-moves.ts` callers across the
   kernel, so deleting `createEvalContext` is not a realistic outcome of this
   ticket alone — **confirmed discrepancy with the original cleanup option**.
8. `ReadContext` and `createEvalContext` were already aligned with the
   fixed-shape contract by ticket `002`, so this ticket does **not** need to
   revisit `eval-context.ts` unless implementation uncovers a concrete typing
   blocker — **confirmed discrepancy with earlier assumptions**.

## Architecture Check

1. Replacing per-combination object creation is beneficial, but the cleanest
   boundary is an enumeration-local mutable read scope in `legal-moves.ts`.
   Reusing the effect-dispatch `MutableReadScope` abstraction would couple two
   independent execution paths around a shared optimization primitive without
   enough architectural payoff.
2. Game-agnostic: parameter enumeration is generic across all games.
3. `makeEvalContext` itself uses a conditional spread for `freeOperationOverlay`
   even though `createEvalContext` already normalizes the final shape. A local
   mutable scope removes both the repeated construction and that wrapper-level
   spread.
4. No backwards-compatibility: `makeEvalContext` can be deleted or inlined once
   `enumerateParams` no longer needs it. `createEvalContext` is broader kernel
   infrastructure and should not be deleted by this ticket unless the audit
   unexpectedly proves it has no remaining callers.
5. Architectural caution from ticket `002`: keep the mutable scope local to
   enumeration unless there is a compelling reason to widen another boundary.
   This ticket should not introduce a broader shared abstraction than
   `enumerateParams` needs.

## Architectural Note

Prefer a single mutable scope shared across one recursive `enumerateParams`
call chain, passed explicitly through recursion, over creating a new scope per
recursive frame. The goal here is hot-path cleanup with a narrow API surface,
not exporting a new architectural primitive.

## What to Change

### 1. Create one mutable enumeration scope per recursive enumeration chain

At the top-level `enumerateParams` entry, create a mutable
`ReadContext`-compatible object local to `legal-moves.ts` using the function's
input parameters (`def`, `adjacencyGraph`, `runtimeTableIndex`,
`evalRuntimeResources`, `state`, `executionPlayer`, `bindings`,
`freeOperationOverlay`). Thread that scope through recursive calls so the
entire recursion chain reuses one object.

### 2. Replace `makeEvalContext` calls with in-place field updates

At each site that currently calls `makeEvalContext`, update the shared scope's
`bindings` and `activePlayer` / `actorPlayer` in place before passing it
directly to `evalCondition` and any other `ReadContext` consumers used during
enumeration.

### 3. Handle `freeOperationOverlay` once at scope construction

Set `scope.freeOperationOverlay = options?.freeOperationOverlay ?? undefined`
at scope creation. Do not rebuild wrapper objects with conditional spreads.

### 4. Audit `makeEvalContext` callers

If `makeEvalContext` has no remaining callers after this migration, delete it
(Foundation 9). Do not broaden this ticket into a `createEvalContext`
decommissioning effort; that belongs to ticket 006.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify) — scope creation, field updates, replace makeEvalContext calls
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify) — add coverage for the new enumeration-local scope contract and behavior

## Out of Scope

- Changes to effect-dispatch.ts or any effects-*.ts files (Phase 1 tickets).
- Changes to `effect-context.ts` (already handled by tickets 001-004).
- Migrating non-`legal-moves.ts` `createEvalContext` call sites in
  `trigger-dispatch.ts`, `apply-move.ts`, `event-execution.ts`, etc. (ticket
  006).
- Changes to `MutableReadScope` interface or factory functions in
  `effect-context.ts`.
- Performance benchmarking of the combined Phase 1 + Phase 2 impact.

## Acceptance Criteria

### Tests That Must Pass

1. All legal move enumeration tests pass — especially:
   - Tests exercising multi-parameter actions (FITL operations with zone + token params)
   - Tests exercising `freeOperationOverlay` paths
   - Tests exercising phase pre-conditions during enumeration
   - Tests exercising execution-player-dependent parameter domains across recursive enumeration
2. FITL production spec compile + enumeration tests.
3. Texas Hold'em legal move tests.
4. Determinism tests: same seed + same actions = identical Zobrist hash.
5. Full engine test suite: `pnpm -F @ludoforge/engine test`
6. Typecheck: `pnpm turbo typecheck`

### Invariants

1. `enumerateParams` creates exactly one mutable enumeration scope per
   recursive enumeration chain.
2. Scope does not escape `enumerateParams` or its recursive calls.
3. The scope always materializes `runtimeTableIndex`, `freeOperationOverlay`,
   and `maxQueryResults` as own properties.
4. Legal moves produced are identical to pre-change output for any given game state + seed.
5. External API unchanged: `legalMoves(def, state)` returns the same results.

## Test Plan

### New/Modified Tests

1. No new test files required — existing legal move tests exercise `enumerateParams` comprehensively through `legalMoves()`.
2. Add a targeted legal-moves test that locks the new architecture down:
   `enumerateParams` should no longer reconstruct contexts through the local
   `makeEvalContext` helper and should instead use one local mutable scope
   threaded through recursion.
3. Add or strengthen behavior tests for:
   - recursive multi-parameter enumeration
   - `freeOperationOverlay`-dependent domains
   - execution-player-sensitive parameter domains

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-28
- Actual changes:
  - Replaced `legal-moves.ts`'s per-call `makeEvalContext` allocation path with a private mutable enumeration-local `ReadContext` helper that is created once and threaded through the recursive `enumerateParams` chain.
  - Deleted the local `makeEvalContext` wrapper from `legal-moves.ts`; `enumerateParams` now updates `state`, `activePlayer`, `actorPlayer`, and `bindings` in place before each evaluation step.
  - Added behavioral and source-guard coverage in `packages/engine/test/unit/kernel/legal-moves.test.ts` to lock the new scope threading down and to verify executor-derived `activePlayer` updates still enumerate the full move set.
- Deviations from original plan:
  - The ticket originally framed `createEvalContext` itself as part of the hot-path shape problem. The implementation confirmed that `createEvalContext` is already aligned with the fixed-shape `ReadContext` contract, so no `eval-context.ts` changes were needed.
  - The implementation stayed local to `legal-moves.ts` rather than reusing the effect-dispatch `MutableReadScope` abstraction. That keeps move enumeration decoupled from effect-dispatch plumbing while still achieving the optimization target.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
