# 89SCOMUTEXECON-005: Mutable scope in enumerateParams (Phase 2)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/legal-moves.ts
**Deps**: 89SCOMUTEXECON-002 (MutableReadScope factories must exist). Independent of 003/004 (can run in parallel after 002).

## Problem

`enumerateParams` in `legal-moves.ts` creates a new ReadContext via `makeEvalContext` → `createEvalContext` for every parameter combination during legal move enumeration. Each call produces a fresh 11-field object. For actions with multiple parameters and large domains, this generates hundreds of short-lived objects per move enumeration call.

## Assumption Reassessment (2026-03-28)

1. `makeEvalContext` (legal-moves.ts:328-351) wraps `createEvalContext` with a conditional spread for `freeOperationOverlay` — **confirmed**.
2. `enumerateParams` (legal-moves.ts:353-524) calls `makeEvalContext` at lines ~415 and ~488 to create ReadContext for condition evaluation — **confirmed**.
3. `enumerateParams` is recursive (calls itself with incremented `paramIndex`) — **confirmed**. Each recursion level evaluates conditions with a different `bindings` object.
4. `createEvalContext` (eval-context.ts) constructs a ReadContext from individual fields — **confirmed**.
5. The ReadContext created here is used only for `evalCondition` / `evalValue` calls within the same synchronous frame — it does not escape — **confirmed**.

## Architecture Check

1. Replace per-combination object creation with a mutable scope created once at `enumerateParams` entry, updated per parameter combination. Same pattern as Phase 1 but for the move enumeration hot path.
2. Game-agnostic: parameter enumeration is generic across all games.
3. `makeEvalContext` itself uses a conditional spread for `freeOperationOverlay` — the mutable scope avoids this by always having the field present (same monomorphism principle).
4. No backwards-compatibility: `makeEvalContext` can be deleted or inlined once all call sites are migrated. If `makeEvalContext` has callers outside `enumerateParams`, keep it; otherwise delete.

## What to Change

### 1. Create mutable scope at `enumerateParams` entry

At the top of `enumerateParams`, create a `MutableReadScope` using the function's input parameters (def, adjacencyGraph, runtimeTableIndex, evalRuntimeResources, state, executionPlayer, bindings, freeOperationOverlay).

### 2. Replace `makeEvalContext` calls with scope field updates

At each site that currently calls `makeEvalContext`, instead update `scope.bindings` and `scope.activePlayer` (and `scope.state` if state changes between combinations). Then pass `scope` directly to `evalCondition`/`evalValue`.

### 3. Handle `freeOperationOverlay` monomorphically

Set `scope.freeOperationOverlay = options?.freeOperationOverlay ?? undefined` at scope creation. No conditional spread.

### 4. Audit `makeEvalContext` callers

If `makeEvalContext` has no remaining callers after this migration, delete it (Foundation 9). If other callers exist, leave it.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify) — scope creation, field updates, replace makeEvalContext calls
- `packages/engine/src/kernel/eval-context.ts` (modify, conditional) — delete `createEvalContext` if zero callers remain outside legal-moves.ts; otherwise leave unchanged

## Out of Scope

- Changes to effect-dispatch.ts or any effects-*.ts files (Phase 1 tickets).
- Changes to `effect-context.ts` (already handled by tickets 001-004).
- Migrating `createEvalContext` call sites in trigger-dispatch.ts, apply-move.ts, event-execution.ts, etc. (ticket 006).
- Changes to `MutableReadScope` interface or factory functions.
- Performance benchmarking of the combined Phase 1 + Phase 2 impact.

## Acceptance Criteria

### Tests That Must Pass

1. All legal move enumeration tests pass — especially:
   - Tests exercising multi-parameter actions (FITL operations with zone + token params)
   - Tests exercising `freeOperationOverlay` paths
   - Tests exercising phase pre-conditions during enumeration
2. FITL production spec compile + enumeration tests.
3. Texas Hold'em legal move tests.
4. Determinism tests: same seed + same actions = identical Zobrist hash.
5. Full engine test suite: `pnpm -F @ludoforge/engine test`
6. Typecheck: `pnpm turbo typecheck`

### Invariants

1. `enumerateParams` creates exactly ONE `MutableReadScope` per top-level invocation (recursive calls update the same scope or use the recursion's own scope — audit needed during implementation).
2. Scope does not escape `enumerateParams` or its recursive calls.
3. `freeOperationOverlay` field is always present on scope (no conditional spread).
4. Legal moves produced are identical to pre-change output for any given game state + seed.
5. External API unchanged: `legalMoves(def, state)` returns the same results.

## Test Plan

### New/Modified Tests

1. No new test files required — existing legal move tests exercise `enumerateParams` comprehensively through `legalMoves()`.
2. Consider adding a targeted test that verifies `enumerateParams` with multiple parameter combinations produces identical moves (already covered by determinism tests).

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "legal"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full engine suite)
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
