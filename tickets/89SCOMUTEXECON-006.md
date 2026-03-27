# 89SCOMUTEXECON-006: Audit and convert remaining createEvalContext hot-path sites (Phase 3)

**Status**: PENDING
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — multiple kernel files (scope determined by audit)
**Deps**: tickets/89SCOMUTEXECON-004.md, tickets/89SCOMUTEXECON-005.md

## Problem

After Phases 1-2, approximately 23 `createEvalContext` call sites remain across the kernel (trigger dispatch, apply-move, event execution, turn flow, terminal check, etc.). Some are hot-path (called per move or per trigger), others are cold-path (called once per game turn or less). This ticket audits all remaining sites and converts hot-path ones to use `MutableReadScope`.

## Assumption Reassessment (2026-03-28)

1. `createEvalContext` call sites exist in: `trigger-dispatch.ts`, `apply-move.ts`, `action-executor.ts`, `event-execution.ts`, `turn-flow-eligibility.ts`, `phase-lifecycle.ts`, `initial-state.ts`, `free-operation-viability.ts`, `legal-choices.ts` — **confirmed** from exploration.
2. Some of these create full `ExecutionEffectContext` (not just ReadContext) via `createExecutionEffectContext` — these are NOT candidates for MutableReadScope since they serve a different purpose (full effect execution context, not eval-only context).
3. The distinction: `createEvalContext` → ReadContext for evaluation only. `createExecutionEffectContext` → full EffectContext for effect dispatch. Only `createEvalContext` sites are candidates.
4. The spec marks Phase 3 as optional — convert hot-path sites, leave cold-path sites unchanged.

## Architecture Check

1. Each candidate site must be audited for: (a) call frequency (hot vs cold), (b) whether the context escapes the synchronous call, (c) whether a mutable scope is safe.
2. Cold-path sites (called once per move or less) have negligible optimization value — the spec explicitly says to leave them unchanged.
3. Game-agnostic: all candidate sites are in generic kernel code.
4. No backwards-compatibility: converted sites stop calling `createEvalContext`; if all callers are gone, delete `createEvalContext` (Foundation 9).

## What to Change

### 1. Audit all `createEvalContext` call sites

For each call site, document:
- File and line number
- Call frequency (per-game, per-turn, per-move, per-effect)
- Whether context escapes (stored, returned, passed to callback)
- Recommendation: convert to MutableReadScope or leave as-is

### 2. Convert hot-path sites

For sites called per-move or more frequently where context does not escape:
- Create `MutableReadScope` at the enclosing function entry
- Update fields between calls
- Pass scope to `evalCondition`/`evalValue`

### 3. Leave cold-path sites unchanged

Sites called once per turn or less (e.g., `initial-state.ts`, `phase-lifecycle.ts`) — leave as `createEvalContext`. The optimization has negligible value.

### 4. Clean up `createEvalContext` if zero callers remain

If all callers have been converted or are covered by MutableReadScope, delete `createEvalContext` from `eval-context.ts`.

## Files to Touch

Determined by audit. Candidates:

- `packages/engine/src/kernel/trigger-dispatch.ts` (modify, if hot-path)
- `packages/engine/src/kernel/apply-move.ts` (modify, if hot-path)
- `packages/engine/src/kernel/action-executor.ts` (modify, if hot-path)
- `packages/engine/src/kernel/event-execution.ts` (modify, if hot-path)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify, if hot-path)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify, if hot-path)
- `packages/engine/src/kernel/legal-choices.ts` (modify, if hot-path)
- `packages/engine/src/cnl/eval-context.ts` (modify, conditional — delete `createEvalContext` if zero callers)

NOT candidates (cold path, per-game or per-turn):
- `packages/engine/src/kernel/initial-state.ts` — called once at game start
- `packages/engine/src/kernel/phase-lifecycle.ts` — called once per phase transition

## Out of Scope

- Changes to `MutableReadScope` type or factory functions (finalized in ticket 002).
- Changes to effect dispatch or effect handlers (finalized in tickets 003-004).
- Changes to `legal-moves.ts` / `enumerateParams` (finalized in ticket 005).
- Creating new test files for cold-path sites that remain unchanged.
- Compiled effect path changes (`effect-compiler-runtime.ts`, `effect-compiler-codegen.ts`).

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests pass without weakening assertions.
2. FITL production spec full pipeline (compile → initial state → legal moves → apply moves → terminal check).
3. Texas Hold'em full pipeline.
4. Determinism tests: same seed + same actions = identical Zobrist hash.
5. Full engine test suite: `pnpm -F @ludoforge/engine test`
6. E2E tests: `pnpm -F @ludoforge/engine test:e2e`
7. Typecheck: `pnpm turbo typecheck`

### Invariants

1. Hot-path `createEvalContext` call sites (per-move or higher frequency) are converted to `MutableReadScope`.
2. Cold-path sites (per-turn or lower) remain as `createEvalContext` — explicitly documented in the audit.
3. If `createEvalContext` has zero remaining callers, it is deleted (Foundation 9).
4. No scope escapes its synchronous call boundary.
5. External API unchanged across all affected subsystems.
6. Determinism preserved: same inputs = same outputs.

## Test Plan

### New/Modified Tests

1. Audit results should be documented as comments in a commit message or spec update, not as test artifacts.
2. No new test files expected — existing tests cover all affected code paths.

### Commands

1. `grep -rn "createEvalContext" packages/engine/src/` — baseline count before changes.
2. `pnpm -F @ludoforge/engine test` (full engine suite)
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `grep -rn "createEvalContext" packages/engine/src/` — post-change count (should be ≤ cold-path sites).
