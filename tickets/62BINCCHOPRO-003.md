# 62BINCCHOPRO-003: Wire tier-admissibility into discovery-time and apply-time validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime (effects-choice.ts, legal-choices.ts)
**Deps**: archive/tickets/62BINCCHOPRO-002.md

## Problem

Discovery-time legality (`legal-choices.ts`) and apply-time validation (`effects-choice.ts`) for `chooseN` do not enforce tier-admissibility from `prioritized` queries. Both sites must consume the shared `computeTierAdmissibility` helper so they produce consistent results — the engine must not advertise options it would later reject, and must not reject options it previously advertised.

## Assumption Reassessment (2026-03-14)

1. `effects-choice.ts` (`applyChooseN`, lines ~415-613) validates submitted arrays for cardinality, uniqueness, and domain membership, but has no tier-aware validation. Confirmed.
2. `legal-choices.ts` (`mapChooseNOptions`, lines ~225-370) probes combinations to determine option legality, but has no tier-aware filtering. Confirmed.
3. The shared helper from ticket 62BINCCHOPRO-002 (`computeTierAdmissibility`) will be available at `packages/engine/src/kernel/prioritized-tier-legality.ts`.
4. The `prioritized` query AST carries `tiers` and optional `qualifierKey`. Both are available at the choice evaluation sites.

## Architecture Check

1. Both sites call the same shared helper — no duplicated tier logic.
2. Apply-time: after validating cardinality and uniqueness, additionally validate that the submitted array respects tier ordering via the shared helper.
3. Discovery-time: before probing combinations, pre-filter options to only those that are tier-admissible given the current partial selection state (if any). This reduces the combination space and ensures consistency with apply-time.
4. `evalQuery` remains unchanged — it still flattens tiers into a single result set.

## What to Change

### 1. Wire into `effects-choice.ts` (apply-time)

In `applyChooseN`, after existing cardinality and uniqueness validation:

- Detect if the `chooseN.options` query is `prioritized`
- If so, validate the submitted array against `computeTierAdmissibility` by simulating the selection sequence
- Reject with a descriptive error if the array violates tier ordering

### 2. Wire into `legal-choices.ts` (discovery-time)

In `mapChooseNOptions` or `mapOptionsForPendingChoice`:

- Detect if the `chooseN.options` query is `prioritized`
- If so, use `computeTierAdmissibility` to pre-filter the candidate set before probing combinations
- Mark tier-inadmissible options as `illegal` with an appropriate `illegalReason`

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify — add tier validation in `applyChooseN`)
- `packages/engine/src/kernel/legal-choices.ts` (modify — add tier filtering in discovery)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify — add tier-aware discovery tests)
- `packages/engine/test/unit/effects-choice.test.ts` or `packages/engine/test/unit/kernel/apply-move.test.ts` (modify — add tier-aware apply-time tests)

## Out of Scope

- The shared helper implementation (ticket 62BINCCHOPRO-002)
- The `advanceChooseN` function (ticket 62BINCCHOPRO-004)
- `evalQuery` changes — it must not be modified
- Runner changes
- `ChoicePendingRequest` type changes (ticket 62BINCCHOPRO-001)
- Card 87 re-authoring (ticket 62BINCCHOPRO-008)
- The incremental `chooseN` sub-loop protocol (ticket 62BINCCHOPRO-004)

## Acceptance Criteria

### Tests That Must Pass

1. Apply-time: submitted `chooseN` array that violates tier ordering is rejected with descriptive error
2. Apply-time: submitted `chooseN` array that respects tier ordering passes validation
3. Apply-time: non-prioritized `chooseN` queries are unaffected (no tier validation applied)
4. Discovery-time: tier-inadmissible options are marked `illegal` in the pending request
5. Discovery-time: tier-admissible options retain their existing legality status
6. Discovery-time: non-prioritized `chooseN` queries are unaffected
7. Parity: discovery-time legality and apply-time validation agree on admissibility for the same inputs
8. `pnpm turbo build` succeeds
9. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions

### Invariants

1. Discovery-time and apply-time use the same shared helper — no duplicated logic
2. `evalQuery` remains pure — no modifications
3. Non-prioritized `chooseN` behavior is completely unchanged
4. No FITL-specific identifiers in kernel code
5. No tier metadata attached to query results

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — tier-aware discovery cases (with and without `qualifierKey`)
2. `packages/engine/test/unit/effects-choice.test.ts` or `packages/engine/test/unit/kernel/apply-move.test.ts` — tier-aware apply-time rejection/acceptance cases
3. Parity test: same fixture → discovery says legal ↔ apply accepts, discovery says illegal ↔ apply rejects

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
