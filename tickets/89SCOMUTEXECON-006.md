# 89SCOMUTEXECON-006: Audit and convert remaining createEvalContext hot-path sites (Phase 3)

**Status**: PENDING
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — multiple kernel files (scope determined by audit)
**Deps**: archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-004-finish-scope-convergence-in-complex-handlers.md, archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-005.md

## Problem

After Phases 1-2, approximately 21 `createEvalContext` call sites remain across
the kernel (trigger dispatch, apply-move, event execution, turn-flow
eligibility, terminal checks, authorization helpers, etc.). Some are hot-path
(called per move or per trigger), others are cold-path (called once per game
turn or less). This ticket audits the remaining sites and converts only the
ones where reuse is materially cleaner than the current architecture.

## Assumption Reassessment (2026-03-28)

1. Current `createEvalContext` call sites exist in files including:
   `free-operation-grant-authorization.ts`, `action-executor.ts`,
   `condition-annotator.ts`, `space-marker-rules.ts`,
   `turn-flow-eligibility.ts`, `effect-compiler-codegen.ts`, `terminal.ts`,
   `trigger-dispatch.ts`, `effects-turn-flow.ts`, `apply-move.ts`,
   `action-applicability-preflight.ts`, `action-actor.ts`,
   `validate-gamedef-structure.ts`, `event-execution.ts`, and `map-model.ts`
   — **confirmed discrepancy with the original candidate list**.
2. Some of these create full `ExecutionEffectContext` (not just ReadContext) via `createExecutionEffectContext` — these are NOT candidates for MutableReadScope since they serve a different purpose (full effect execution context, not eval-only context).
3. The distinction: `createEvalContext` → ReadContext for evaluation only. `createExecutionEffectContext` → full EffectContext for effect dispatch. Only `createEvalContext` sites are candidates.
4. Ticket `003` already established the dispatch-owned scope model for effect
   handlers and updated compiled delegate plumbing. This ticket should not
   reopen that design; it should audit only the remaining non-handler
   `createEvalContext` sites.
5. The spec's “convert hot-path sites, leave cold-path sites unchanged” rule
   still holds, but “hot path” must be justified per site, not assumed from the
   file name alone.

## Architecture Check

1. Each candidate site must be audited for: (a) call frequency (hot vs cold), (b) whether the context escapes the synchronous call, (c) whether a mutable scope is safe.
2. Cold-path sites (called once per move or less) have negligible optimization
   value — the spec explicitly says to leave them unchanged.
3. Game-agnostic: all candidate sites are in generic kernel code.
4. No backwards-compatibility: converted sites stop calling
   `createEvalContext`; if all callers are gone, delete `createEvalContext`
   (Foundation 9).
5. Architectural caution from ticket `002`: do not assume every hot site should
   grow a shared mutable-scope abstraction. Some sites may be better served by a
   tiny local fixed-shape helper, and that can be the cleaner end state.
6. `effect-compiler-codegen.ts` is now partly aligned with the dispatch-owned
   scope model after ticket `003`, but it still contains `createEvalContext`
   usage for compiled eval helpers. This ticket should treat that as an audit
   candidate rather than assuming all compiled-path work is out of scope.

## Architectural Note

The audit must explicitly compare:

1. Replacing a site with `MutableReadScope`.
2. Replacing a site with a smaller local fixed-shape eval helper.
3. Leaving the site on `createEvalContext`.

Recommendation: prefer the smallest clean abstraction per site, not blanket convergence on `MutableReadScope`.

## What to Change

### 1. Audit all `createEvalContext` call sites

For each call site, document:
- File and line number
- Call frequency (per-game, per-turn, per-move, per-effect)
- Whether context escapes (stored, returned, passed to callback)
- Recommendation: convert to MutableReadScope or leave as-is
- Alternative, when cleaner: convert to a local fixed-shape helper rather than `MutableReadScope`

### 2. Convert hot-path sites

For sites called per-move or more frequently where context does not escape:
- Choose the smallest clean abstraction (`MutableReadScope` or a local fixed-shape helper)
- Update fields between calls
- Pass the reused eval object to `evalCondition`/`evalValue`

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
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify, if hot-path)
- `packages/engine/src/kernel/condition-annotator.ts` (modify, if hot-path)
- `packages/engine/src/kernel/space-marker-rules.ts` (modify, if hot-path)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify, if hot-path)
- `packages/engine/src/kernel/map-model.ts` (modify, if hot-path)
- `packages/engine/src/cnl/eval-context.ts` (modify, conditional — delete `createEvalContext` if zero callers)

Likely cold-path / low-priority candidates unless the audit proves otherwise:
- `packages/engine/src/kernel/validate-gamedef-structure.ts`
- `packages/engine/src/kernel/terminal.ts`
- `packages/engine/src/kernel/effects-turn-flow.ts`

## Out of Scope

- Changes to `MutableReadScope` type or factory functions (finalized in ticket 002).
- Changes to effect dispatch or effect handlers (finalized in tickets 003-004).
- Changes to `legal-moves.ts` / `enumerateParams` (finalized in ticket 005).
- Creating new test files for cold-path sites that remain unchanged.
- Changes to interpreted effect dispatch or handler signatures (finalized in
  tickets 003-004).

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

1. Hot-path `createEvalContext` call sites (per-move or higher frequency) are converted to the smallest clean reuse abstraction, which may be `MutableReadScope` or a local fixed-shape helper.
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
