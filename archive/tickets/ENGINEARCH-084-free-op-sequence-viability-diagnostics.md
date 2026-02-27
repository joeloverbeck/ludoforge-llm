# ENGINEARCH-084: Free-Operation Sequence Viability Diagnostics and Authoring Guardrails

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiler diagnostics and runtime legality metadata for grant sequencing
**Deps**: specs/17-fitl-turn-sequence-eligibility-and-card-flow.md

## Problem

Ordered free-operation grants (`sequence.chain`/`step`) can be authored in ways that deadlock later steps when earlier grants are not currently legal. Runtime sequencing is enforced, but authoring-time risk visibility is still weak and illegal free-operation attempts currently expose only coarse failure reason text.

## Assumption Reassessment (2026-02-27)

1. Confirmed: sequence ordering is already enforced strictly at runtime via pending grant batch/index checks.
2. Confirmed: earlier sequence steps can block later grants (including cross-faction chains) when earlier grants remain unconsumed.
3. Confirmed: integration coverage already exists for same-faction and cross-faction sequence ordering behavior.
4. Discrepancy corrected: ticket originally implied missing runtime ordering enforcement; this is already implemented.
5. Remaining gap: compiler only validates `grantFreeOperation.sequence` shape, not viability risk patterns.
6. Remaining gap: `FREE_OPERATION_NOT_GRANTED` errors do not currently provide structured sequence-block context.

## Architecture Reassessment

1. Keep sequencing semantics unchanged; add diagnostics/observability around existing generic mechanics.
2. Prefer data-driven, game-agnostic checks over card-specific fixes.
3. Prefer structured legality metadata over ad-hoc trace-only strings so callers/tests can assert stable causes.
4. No backwards-compatibility aliasing or shim layers.

## Updated Scope

### 1. Static compiler diagnostics (new warning-level checks)

Add warning diagnostics for obviously risky sequence authoring patterns in `grantFreeOperation` chains (for example mismatched action classes/action IDs or mixed filtered/unfiltered sequencing where an earlier step is stricter than a later step in the same chain).

### 2. Runtime blocking observability (structured legality metadata)

When a free operation is rejected, include machine-readable metadata that distinguishes sequence-lock from other non-granted causes (action mismatch, zone filter mismatch, or no applicable grant).

### 3. Tests

Add/extend unit and integration tests to assert both diagnostic emission and structured runtime cause reporting.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/legal-moves.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Changing free-operation sequence semantics.
- Game-specific special-casing for individual cards.
- Introducing compatibility aliases or dual-path behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler emits warning diagnostics for deadlock-prone sequence authoring patterns.
2. Runtime illegal move metadata surfaces explicit free-operation block causes, including sequence lock.
3. Existing engine suites continue passing under Node test runner.

### Invariants

1. Free-operation semantics remain game-agnostic and deterministic.
2. Diagnostics and runtime metadata remain generic and data-driven (no game IDs/branches hardcoded).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — sequence viability warning diagnostics.
2. `packages/engine/test/unit/legal-moves.test.ts` — free-operation block cause coverage at move applicability boundaries.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — end-to-end sequence lock metadata on illegal free-operation attempt.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-27
- What changed:
  - Added compiler warning diagnostics for risky `grantFreeOperation.sequence` chains (duplicate steps, shifting action class/action IDs, and differing zone filters across ordered steps).
  - Added structured free-operation block explanation metadata to illegal move failures (`FREE_OPERATION_NOT_GRANTED`) via `block.cause` and related context.
  - Consolidated free-operation matching into one canonical analyzer in turn-flow eligibility so applicability, zone-filter projection, execution-player resolution, grant checks, and block explanations share a single source of truth.
  - Added/updated tests in compile-effects, legal-moves, and FITL free-operation integration coverage.
- Deviations from original plan:
  - Did not add new turn-flow trace entry kinds; used structured illegal-move metadata for robust, machine-readable observability at the exact failure boundary.
  - Corrected ticket assumptions that runtime sequence enforcement and core ordering tests were missing; both already existed.
- Verification results:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine test:e2e` passed.
  - `pnpm turbo lint` passed.
