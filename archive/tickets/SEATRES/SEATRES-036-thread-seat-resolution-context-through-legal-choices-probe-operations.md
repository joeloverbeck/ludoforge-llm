# SEATRES-036: Thread seat-resolution context through legal-choices probe operations

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel legal-choices free-operation discovery/probe call chains
**Deps**: archive/tickets/SEATRES/SEATRES-035-remove-implicit-seat-resolution-context-fallback-from-active-seat-invariants.md

## Problem

`legalChoices` free-operation probing currently builds seat-resolution context inside inner decision/probe flow. This leaves operation ownership partially implicit in a hot path and can reintroduce duplicated lifecycle work during repeated choice-option probing.

## Assumption Reassessment (2026-03-03)

1. `legalChoicesWithPreparedContextInternal(...)` currently creates `createSeatResolutionContext(def, state.playerCount)` inside the `partialMove.freeOperation === true` branch.
2. `resolveFreeOperationDiscoveryAnalysis(...)` now requires explicit `SeatResolutionContext`, so legal-choices currently satisfies the contract but still constructs context in an inner path rather than at operation boundary.
3. Existing active lifecycle tickets (`SEATRES-033`, `SEATRES-034`, `SEATRES-035`) do not explicitly scope legal-choices operation-boundary context ownership.
4. Ticket test-path assumptions were stale: legal-choices unit coverage lives in `packages/engine/test/unit/kernel/legal-choices.test.ts` (not `packages/engine/test/unit/legal-choices.test.ts`).
5. Current tests verify probe-context preparation callback behavior, but do not yet assert seat-resolution context lifecycle/count across recursive free-operation probe/evaluate calls.

## Architecture Check

1. Building one operation-scoped `SeatResolutionContext` at legal-choices entry and threading it through probe/evaluation helpers is cleaner than re-creating context in nested discovery branches.
2. This is runtime-contract hardening only; no game-specific behavior is added and `GameDef`/simulator remain game-agnostic.
3. No compatibility aliases/shims: call signatures are tightened directly and all call sites must pass explicit context.

## What to Change

### 1. Make legal-choices operation boundary own seat-resolution lifecycle

1. Build one `SeatResolutionContext` per legal-choices operation entry (including probe/evaluate flows).
2. Thread the context through helper chains that call free-operation discovery/validation, including recursive probe paths used for option-legality evaluation.
3. Remove local/nested context construction in `legal-choices.ts` for free-operation analysis.

### 2. Keep free-operation semantics and diagnostics stable

1. Preserve existing legality outcomes and denial-cause mapping.
2. Preserve existing runtime/effect diagnostic messages and context payload semantics.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify only if helper threading surface requires minor extension)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` (modify/add only if lifecycle guard overlap is required)

## Out of Scope

- Seat identity semantics changes
- Compiler/validator seat-catalog diagnostics
- Runner/visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. `legalChoices` free-operation probe/evaluation flow uses one explicit operation-scoped seat-resolution context per operation boundary.
2. Free-operation legality outcomes/denial contracts remain behaviorally identical.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Legal-choices operation boundaries own seat-resolution lifecycle explicitly.
2. Kernel/runtime remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — add lifecycle ownership regression coverage for free-operation probing paths; ensure behavior parity.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — add guard that probe/evaluation flow does not require nested context reconstruction patterns (single operation-scoped seat-resolution context instance reused across recursive probing).

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-03
- **What changed**:
  - `legalChoices` now creates `SeatResolutionContext` once at operation entry (`legalChoicesDiscover` / `legalChoicesEvaluate`) and threads it through recursive probe/evaluation flows via prepared context.
  - Nested free-operation branch context construction was removed from `legalChoicesWithPreparedContextInternal(...)`.
  - Added regression guard coverage in `packages/engine/test/unit/kernel/legal-choices.test.ts` to prevent reintroducing nested free-operation seat-context reconstruction.
  - Corrected stale ticket assumptions/paths to current test locations.
- **Deviations from original plan**:
  - `packages/engine/src/kernel/turn-flow-eligibility.ts` did not require changes; existing API already accepted explicit context threading.
  - `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` did not require changes; lifecycle guard was added in legal-choices unit coverage where behavior resides.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` passed.
