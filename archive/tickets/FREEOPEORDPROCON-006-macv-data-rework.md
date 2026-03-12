# FREEOPEORDPROCON-006: MACV Card Data Rework (card 69)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — generic readiness fix plus FITL data/test updates
**Deps**: archive/tickets/FREEOPEORDPROCON-001-progression-policy-contract-surface.md, archive/tickets/FREEOPEORDPROCON-005-emission-time-skip-evaluation.md

## Problem

FITL card 69 (MACV) declares two ordered batches (`macv-us-then-arvn` and `macv-nva-then-vc`) that represent "implement what can in order" semantics per rules 5.1.1-5.1.3. Currently these batches have no explicit `progressionPolicy`, so they inherit `strictInOrder` by default. The card must be updated to use `implementWhatCanInOrder` to achieve rules-faithful behavior.

## Assumption Reassessment (2026-03-12)

1. MACV card data is at `data/games/fire-in-the-lake/41-events/065-096.md` under `card-69`.
2. Two batches: `macv-us-then-arvn` (steps 0, 1) and `macv-nva-then-vc` (steps 0, 1).
3. All grants use `viabilityPolicy: requireUsableAtIssue`, `completionPolicy: required`, `postResolutionTurnFlow: resumeCardFlow`.
4. No grant in MACV uses `sequenceContext.requireMoveZoneCandidatesFrom`, so the hard rejection rule (ticket 003) will not trigger.
5. Existing runtime coverage in `packages/engine/test/integration/fitl-events-macv.test.ts` covers only the both-usable branch paths and stay-eligible behavior.
6. Compile-shape assertions for card 69 currently live in `packages/engine/test/integration/fitl-events-1965-arvn.test.ts`, not in the MACV runtime test file.
7. Generic progression-policy/runtime coverage already exists in shared engine tests (`packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` plus unit validation/runtime suites), so this ticket should stay out of kernel code unless a MACV-specific gap is proven.
8. Reproducing `US unusable -> ARVN usable` is not currently possible in a card-local MACV setup because the existing generic US special-activity legality still exposes `advise` as a usable move even when Air Lift/Air Strike are blocked or have no board targets. That discrepancy belongs to generic FITL special-activity viability semantics, not this MACV data ticket.

## Architecture Check

1. The current architecture already has the correct generic contract surface and runtime state for `implementWhatCanInOrder`; using it in MACV is cleaner than preserving the current accidental `strictInOrder` default.
2. The authored change should stay declarative: add `progressionPolicy: implementWhatCanInOrder` to each MACV sequence step rather than introducing any FITL-specific runtime path.
3. Test scope must span both authoring shape and runtime behavior:
   - `fitl-events-1965-arvn.test.ts` owns the compiled card-69 shape assertions.
   - `fitl-events-macv.test.ts` owns branch execution and new skip-path behavior.
4. No cleaner architecture than the existing generic progression contract emerged during reassessment; the ticket should not expand into refactoring engine code.
5. The deeper architecture concern uncovered here is that `requireUsableAtIssue` currently treats US `advise` as usable in scenarios that rules text might consider non-implementable. If that is wrong, it should be corrected once in the generic action-viability layer, not patched inside MACV.
6. Implementation uncovered one small generic bug that must be fixed here: `implementWhatCanInOrder` readiness was incorrectly requiring earlier steps to remain pending or skipped, which blocked later steps after an earlier step had already been consumed. Correcting that shared readiness rule is architecture-preserving and necessary for MACV to work.

## What to Change

### 1. MACV card data (`data/games/fire-in-the-lake/41-events/065-096.md`)

For each of the 4 grants in card 69's two batches, add `progressionPolicy: implementWhatCanInOrder` inside the `sequence` block:

```yaml
sequence:
  batch: macv-us-then-arvn
  step: 0
  progressionPolicy: implementWhatCanInOrder
```

Repeat for all 4 grants (step 0 and step 1 in both batches).

### 2. MACV compile-shape tests

Update the card-69 compile-shape assertions in `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` to expect the `progressionPolicy` field in the compiled output.

### 3. MACV runtime tests — skip scenarios

Add new test cases covering the spec's required MACV acceptance scenarios:
- US usable + ARVN usable → both execute in order.
- NVA unusable + VC usable → NVA skipped, VC executes.
- NVA unusable + VC unusable → neither executes, sequence completes.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify) — add `progressionPolicy: implementWhatCanInOrder` to card 69 grants
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify) — treat consumed earlier implement-what-can steps as non-blocking in generic readiness checks
- `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` (modify) — update card-69 compile-shape assertions
- `packages/engine/test/integration/fitl-events-macv.test.ts` (modify) — add skip scenario tests
- `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` (add) — regression coverage for consumed-step readiness

## Out of Scope

- Any kernel code changes — the generic system is complete by this point.
- Other FITL event cards — only card 69 (MACV) is affected.
- Texas Hold'em data — no progression sequences in poker.
- Validation or schema changes — all done in earlier tickets.

## Acceptance Criteria

### Tests That Must Pass

1. MACV compile-shape test: compiled card 69 grants include `progressionPolicy: 'implementWhatCanInOrder'` in sequence metadata.
2. MACV runtime test: US + ARVN both usable → both execute in sequence (existing behavior preserved).
3. MACV runtime test: NVA + VC both usable → both execute in sequence (existing behavior preserved).
4. MACV runtime test: NVA unusable, VC usable → NVA skipped (step 0 in `skippedStepIndices`), VC executes.
5. MACV runtime test: both NVA and VC unusable → chosen branch completes without execution.
6. MACV runtime test: executing faction remains eligible throughout.
7. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. No FITL-specific kernel logic is introduced — all behavior comes from the generic `implementWhatCanInOrder` contract plus a generic readiness bugfix.
2. MACV card data uses only the generic contract surface (no custom fields or card-specific hacks).
3. Other FITL event cards with ordered sequences (that don't declare `progressionPolicy`) still use `strictInOrder` by default.
4. This ticket does not redefine generic FITL US special-activity viability semantics; it only wires MACV to the existing progression contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` — updated card-69 compile-shape assertions
2. `packages/engine/test/integration/fitl-events-macv.test.ts` — MACV branch coverage for both-usable flows plus NVA/VC skip scenarios
3. `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` — consumed-step readiness regression for `implementWhatCanInOrder`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
5. `pnpm turbo test`

## Outcome

- Completed: 2026-03-12
- Actual changes:
  - Reworked FITL card 69 (MACV) authoring to declare `progressionPolicy: implementWhatCanInOrder` on both ordered branches.
  - Updated the card-69 compile-shape regression in `fitl-events-1965-arvn.test.ts`.
  - Expanded `fitl-events-macv.test.ts` with MACV-specific progression coverage, including NVA-skip and NVA/VC-neither-usable scenarios.
  - Fixed a generic kernel bug in `isPendingFreeOperationGrantSequenceReady()` so consumed earlier `implementWhatCanInOrder` steps no longer block later steps.
  - Added a focused unit regression for the consumed-step readiness invariant.
- Deviations from original plan:
  - The ticket began as data-only, but implementation exposed a generic readiness bug that had to be corrected for MACV to behave as intended.
  - The originally proposed `US unusable -> ARVN usable` regression was removed from scope because current generic US special-activity viability still treats `advise` as usable in card-local MACV setups.
- Verification:
  - `pnpm -F @ludoforge/engine test -- fitl-events-macv.test.ts fitl-events-1965-arvn.test.ts free-operation-grant-sequence-readiness.test.ts`
  - `pnpm turbo test`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint` passed with pre-existing repo warnings only; no lint errors were introduced by this ticket.
