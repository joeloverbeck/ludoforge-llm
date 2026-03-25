# 81WHOSEQEFFCOM-004: Compile turn flow effects (setActivePlayer, advancePhase, popInterruptPhase)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts, kernel unit tests
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md

## Problem

Three lifecycle effects (tags 2, 24, 26) still fall back to the interpreter inside compiled sequences. `setActivePlayer` is a frequent lifecycle leaf. `advancePhase` and `popInterruptPhase` are phase-transition effects that already encapsulate lifecycle dispatch, usage reset, and incremental hash behavior in dedicated runtime handlers. These effects are part of the generic turn machinery and materially affect compiled-sequence coverage.

## Assumption Reassessment (2026-03-25)

1. `setActivePlayer` (tag 2) is implemented in `packages/engine/src/kernel/effects-var.ts`, not `effects-turn-flow.ts`. It resolves a single player selector, updates `state.activePlayer`, and maintains `_runningHash` when a cached Zobrist table is present.
2. `advancePhase` (tag 24) is implemented in `packages/engine/src/kernel/effects-turn-flow.ts` and delegates the real transition logic to `phase-advance.ts` via `advancePhase(buildAdvancePhaseRequest(...))`.
3. `popInterruptPhase` (tag 26) is implemented in `packages/engine/src/kernel/effects-turn-flow.ts`. It throws on an empty interrupt stack, dispatches `phaseExit`, resumes the stored `resumePhase`, resets usage counters, and dispatches `phaseEnter`.
4. `gotoPhaseExact` (tag 23) is already compiled, but the more relevant architectural precedent is the growing family of compiled fragments that call existing runtime handlers directly (`gotoPhaseExact`, `transferVar`, marker effects).
5. Existing runtime tests already cover important semantics for these handlers:
   - `packages/engine/test/unit/effects-turn-flow.test.ts` covers `advancePhase` and `popInterruptPhase` behavior.
   - `packages/engine/test/unit/kernel/zobrist-incremental-vars.test.ts` covers `setActivePlayer` incremental hash correctness.
   - `packages/engine/test/unit/kernel/zobrist-incremental-phase.test.ts` covers `advancePhase` incremental hash correctness.
6. `pushInterruptPhase` (tag 25) remains out of scope for this ticket and is still deferred.

## Architecture Check

1. The important architectural boundary is no longer "inline vs delegate"; it is "no interpreter re-entry from compiled lifecycle fragments unless unavoidable". Direct calls into existing effect handlers satisfy that goal and preserve one source of truth for semantics.
2. `advancePhase` and `popInterruptPhase` should remain delegated to their existing runtime handlers. Re-encoding that logic inside the compiler would duplicate lifecycle behavior and make future phase-rule changes riskier.
3. `setActivePlayer` is simple enough to inline, but the codebase already has multiple delegate-style compiled fragments with near-identical plumbing. For consistency and long-term maintainability, this ticket should prefer the same delegate bridge unless a clear performance reason emerges to inline it.
4. The repeated wrapper shape in `effect-compiler-codegen.ts` is already large enough to justify extraction now. This ticket should introduce a shared helper for compiled fragments that invoke an existing effect handler with compiled-context adaptation and optional binding preservation.
5. This is beneficial relative to the current architecture because it increases compiled coverage without creating a second implementation of phase-transition semantics. It improves performance at the dispatch boundary while keeping lifecycle rules centralized in their existing handlers.

## What to Change

### 1. Add pattern descriptors for all 3 turn flow effects

In `effect-compiler-patterns.ts`:
- `SetActivePlayerPattern`: player selector expression
- `AdvancePhasePattern`: no payload fields beyond the effect tag
- `PopInterruptPhasePattern`: no payload fields beyond the effect tag
- Add `matchSetActivePlayer`, `matchAdvancePhase`, `matchPopInterruptPhase`
- Wire into `classifyEffect` switch cases for tags 2, 24, 26

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- Extract a shared compiled-handler bridge for leaf fragments that call existing runtime handlers with compiled-context adaptation
- `compileSetActivePlayer(desc)` — use the shared bridge to call `applySetActivePlayer`
- `compileAdvancePhase(desc)` — use the shared bridge to call `applyAdvancePhase`
- `compilePopInterruptPhase(desc)` — use the shared bridge to call `applyPopInterruptPhase`
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify)

## Out of Scope

- `pushInterruptPhase` (tag 25) — deferred to ticket 008
- `gotoPhaseExact` — already compiled
- Token effects (ticket 005)
- Marker effects (ticket 003)
- Variable/binding effects (ticket 002)
- Deleting `createFallbackFragment` (ticket 010)
- Refactoring existing `applyAdvancePhase`, `applyPopInterruptPhase`, or `applySetActivePlayer` semantics beyond what the shared compiled-handler bridge needs

## Acceptance Criteria

### Tests That Must Pass

1. Pattern tests classify tags 2, 24, and 26 into non-null descriptors with the correct descriptor kinds.
2. Codegen parity test: compiled `setActivePlayer` matches interpreted output, including active player and hash-sensitive state.
3. Codegen parity test: compiled `advancePhase` matches interpreted output across phase transition, lifecycle side effects, and emitted events.
4. Codegen parity test: compiled `popInterruptPhase` matches interpreted output for the normal resume path.
5. Error parity test: compiled `popInterruptPhase` on an empty interrupt stack throws the same runtime error class as the interpreter.
6. Coverage-oriented tests are updated so sequences containing these tags no longer treat them as fallback-only nodes.
7. Relevant engine tests pass, plus `pnpm turbo typecheck` and `pnpm turbo lint`.

### Invariants

1. `setActivePlayer` selector resolution and `_runningHash` behavior remain identical to the existing runtime handler.
2. `advancePhase` lifecycle dispatch behavior remains identical to the existing runtime handler.
3. `popInterruptPhase` stack manipulation, error behavior, lifecycle dispatch, and usage reset remain identical to the existing runtime handler.
4. Coverage ratio increases for sequences containing these turn-flow tags.
5. The change does not introduce new duplicated implementations of phase-transition semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add tests for all 3 compiled turn flow effect generators
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add tests for all 3 turn flow match functions

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-25
- What actually changed:
  - Added compiler pattern descriptors and `classifyEffect` coverage for `setActivePlayer`, `advancePhase`, and `popInterruptPhase`.
  - Added compiled codegen fragments for those three effects.
  - Extracted a shared compiled delegate bridge in `effect-compiler-codegen.ts` and reused it for the new turn-flow effects plus existing delegate-style compiled effects (`gotoPhaseExact`, `transferVar`, and marker effects), reducing duplicated wrapper plumbing.
  - Added pattern tests, codegen parity tests, empty-stack error parity coverage, and a coverage-ratio test proving the three tags now count as compiled nodes.
- Deviations from original plan:
  - `setActivePlayer` was implemented via the shared delegate bridge rather than bespoke inline compiled logic. This kept one runtime source of truth and fit the cleaner long-term architecture better.
  - The ticket assumptions and acceptance criteria were corrected first because the original ticket mislocated `setActivePlayer`, understated existing runtime test coverage, and did not fully account for the already-repeated delegate-wrapper architecture in codegen.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/effect-compiler-patterns.test.js packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
