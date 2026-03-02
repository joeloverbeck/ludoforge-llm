# SEATRES-019: Add seat-resolution lifecycle regression guards for hot-path callers

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — explicit seat-resolution context threading in hot paths plus lifecycle regression guards
**Deps**: archive/tickets/SEATRES-011-seat-resolution-index-lifecycle-hardening-and-hot-path-deduplication.md

## Problem

Current tests primarily verify seat-resolution correctness, but they do not enforce lifecycle discipline at caller boundaries (for example, that hot-path operations do not regress into repeated index builds).

## Assumption Reassessment (2026-03-02)

1. `seat-resolution` resolver correctness is covered, including explicit-index APIs.
2. Existing tests already include operation-scoped context parity coverage in `turn-flow-runtime-invariants.test.ts`, but do not guard lifecycle ownership across legal-moves and decision-point hot-path call chains.
3. The original ticket assumption referencing active tickets `SEATRES-012` through `SEATRES-017` is stale; active follow-on lifecycle tickets are `SEATRES-033`, `SEATRES-034`, and `SEATRES-035`.
4. Current hot paths still allow duplicate context construction within a single operation scope:
   - `legalMoves(...)` turn-order filter/variant stages can resolve active seat via separate helper calls.
   - `advanceToDecisionPoint(...)` coup implicit-pass loop can allocate context per iteration.

## Architecture Check

1. Lifecycle guard tests are necessary but not sufficient when architecture still allows duplicate context creation in operation hot paths.
2. Coverage is runtime-contract and game-agnostic; no game-specific behavior is introduced in kernel logic.
3. Preferred architecture is explicit operation ownership: build one seat-resolution context at operation boundaries and thread it through helper chains.
4. No compatibility paths are added; signatures/callers are tightened directly.

## What to Change

### 1. Eliminate duplicate lifecycle ownership in hot-path call chains

1. Thread one operation-scoped `SeatResolutionContext` through legal-moves turn-order stages (`isActiveSeatEligibleForTurnFlow`, `applyTurnFlowWindowFilters`, `applyPendingFreeOperationVariants`).
2. Thread one operation-scoped `SeatResolutionContext` through `advanceToDecisionPoint(...)` coup implicit-pass iterations.
3. Keep runtime behavior/diagnostics unchanged while removing implicit duplicate lifecycle work.

### 2. Add focused lifecycle regression guards

1. Add architecture-focused regression tests (AST/source guards and targeted behavior parity) so hot-path operation boundaries continue enforcing explicit context ownership.
2. Ensure tests fail clearly when lifecycle discipline regresses.

## Files to Touch

- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify)

## Out of Scope

- Changing seat identity semantics
- Seat-catalog compile diagnostics
- Runner visual/model behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Caller-level lifecycle tests fail if hot paths reintroduce repeated index construction within a single operation scope.
2. Existing seat-resolution behavior remains unchanged under lifecycle guard coverage.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-resolution lifecycle expectations are codified in tests, not only comments/convention.
2. Operation boundaries own context lifecycle explicitly; helpers consume provided context.
3. Kernel/runtime stay game-agnostic and strict-seat-contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add lifecycle architecture guard coverage for explicit operation-scoped context threading in legal-moves turn-order paths.
2. `packages/engine/test/unit/phase-advance.test.ts` — add lifecycle architecture guard coverage for `advanceToDecisionPoint(...)` coup-loop context reuse.
3. Existing legal-moves/phase-advance behavior tests remain as semantic parity validation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- Completion date: 2026-03-02
- What changed:
  - Threaded one operation-scoped `SeatResolutionContext` through `legalMoves(...)` turn-order lifecycle stages and related apply-move turn-flow window preflight.
  - Threaded one operation-scoped `SeatResolutionContext` through `advanceToDecisionPoint(...)` coup implicit-pass iterations.
  - Added architecture regression guards in legal-moves and phase-advance unit tests to lock explicit context-threading call boundaries.
  - Updated a legal-moves unit test call site to pass explicit context to the tightened turn-order helper API.
- What changed versus the original ticket plan:
  - Implemented code-level lifecycle ownership hardening in addition to tests because reassessment showed hot-path duplicate context construction remained in active code paths.
  - Replaced brittle runtime spy strategy with AST/source architecture guard tests for deterministic, stable lifecycle regression coverage.
- Verification:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` passed.
  - `node --test packages/engine/dist/test/unit/phase-advance.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
