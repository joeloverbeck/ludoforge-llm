# 204FITLVCCOM-008: P4-P5 - VC witness suite and final reattestation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None expected - profile-quality tests and possible YAML threshold tuning only
**Deps**: `archive/tickets/204FITLVCCOM-007.md`

## Problem

Spec 204 requires the expanded VC doctrine to be proven by profile-quality witnesses and by replay-identity/regression reattestation of the existing VC witnesses. After ticket 007 activates the completed doctrine in `vc-baseline`, this ticket adds the new witness coverage and runs the final verification needed before Spec 204 can be archived.

## Assumption Reassessment (2026-06-01)

1. Existing VC witnesses live flat under `packages/engine/test/policy-profile-quality/`, and new tests should follow that convention.
2. Spec 204 §7 names eight new witnesses, while P5 also preserves `vc-avoids-conventional-attack-without-ambush` and `vc-protects-bases-from-nva-infiltrate`.
3. Threshold tuning belongs here only when the activated doctrine is too weak or too strong for the intended profile-quality claims; engine behavior should not be changed unless a generic capability gap is proven.

## Architecture Check

1. Profile-quality witnesses live outside engine determinism tests, preserving the Foundations distinction between engine invariants and policy-quality assertions.
2. New tests should assert observable doctrine behavior, not just that a template ID exists.
3. Any threshold tuning remains GameSpecDoc YAML data and keeps runtime/engine code generic.

## What to Change

### 1. Add new VC profile-quality witnesses

Add focused tests under `packages/engine/test/policy-profile-quality/` for the eight Spec 204 §7 claims:

- `vc-terror-high-pop-non-coin-controlled.test.ts`
- `vc-tax-funds-future-terror-rally.test.ts`
- `vc-subvert-drops-arvn-patronage.test.ts`
- `vc-march-spreads-underground.test.ts`
- `vc-attack-only-with-ambush.test.ts`
- `vc-agitation-prep-before-coup.test.ts`
- `vc-blocks-nva-near-win.test.ts`
- `vc-tax-on-populated-support-vetoed.test.ts`

Prefer the existing `vc-plan-witness-helpers.ts` or sibling helper patterns when they provide enough observability. If a named test proves unconstructible from current helpers, update the test design to the nearest observable invariant and record the correction in the ticket before closeout.

### 2. Reattest existing VC witnesses

Run and preserve:

- `vc-avoids-conventional-attack-without-ambush.test.ts`
- `vc-protects-bases-from-nva-infiltrate.test.ts`

### 3. Final Spec 204 verification evidence

Run a focused policy-profile-quality subset for all VC-related tests and a broad engine/package lane suitable for final spec closeout. Record any advisory output or skipped broad lane truthfully.

## Files to Touch

- `packages/engine/test/policy-profile-quality/*.test.ts` (add/modify)
- `packages/engine/test/policy-profile-quality/vc-plan-witness-helpers.ts` (modify only if needed)
- `data/games/fire-in-the-lake/92-agents.md` (modify only for threshold tuning or witness-driven YAML correction)
- `specs/204-fitl-vc-completion.md` (modify to record final evidence and close remaining open-question/status details)

## Out of Scope

- New engine-specific FITL behavior.
- Reworking already-archived ticket boundaries unless a witness exposes an actual defect.
- Archiving Spec 204; that happens after this ticket is archived and all same-family tickets are complete.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build`
2. Focused Node policy-quality run covering the two existing VC witnesses and the eight new VC witnesses.
3. A broader engine verification lane such as `pnpm -F @ludoforge/engine test` or a clearly justified stronger substitute.
4. `pnpm run check:ticket-deps`

### Invariants

1. New tests assert policy-quality behavior through the public profile/witness seam.
2. Existing two VC witnesses pass under the expanded profile.
3. Any YAML tuning is documented as profile data, not engine behavior.

## Test Plan

### New/Modified Tests

- The eight files listed in `What to Change`, plus helper edits only if needed.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `cd packages/engine && node --test dist/test/policy-profile-quality/vc-*.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
