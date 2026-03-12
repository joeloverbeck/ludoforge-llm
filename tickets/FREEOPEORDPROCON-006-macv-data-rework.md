# FREEOPEORDPROCON-006: MACV Card Data Rework (card 69)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No — game data and tests only
**Deps**: archive/tickets/FREEOPEORDPROCON-001-progression-policy-contract-surface.md, tickets/FREEOPEORDPROCON-005-emission-time-skip-evaluation.md

## Problem

FITL card 69 (MACV) declares two ordered batches (`macv-us-then-arvn` and `macv-nva-then-vc`) that represent "implement what can in order" semantics per rules 5.1.1-5.1.3. Currently these batches have no explicit `progressionPolicy`, so they inherit `strictInOrder` by default. The card must be updated to use `implementWhatCanInOrder` to achieve rules-faithful behavior.

## Assumption Reassessment (2026-03-12)

1. MACV card data is at `data/games/fire-in-the-lake/41-events/065-096.md`, lines 1312-1384.
2. Two batches: `macv-us-then-arvn` (steps 0, 1) and `macv-nva-then-vc` (steps 0, 1).
3. All grants use `viabilityPolicy: requireUsableAtIssue`, `completionPolicy: required`, `postResolutionTurnFlow: resumeCardFlow`.
4. No grant in MACV uses `sequenceContext.requireMoveZoneCandidatesFrom`, so the hard rejection rule (ticket 003) will not trigger.
5. Existing MACV tests in `packages/engine/test/integration/fitl-events-macv.test.ts` cover branch execution.

## Architecture Check

1. This is a data-only change plus test updates — no kernel code touched.
2. Adding `progressionPolicy: implementWhatCanInOrder` to each grant's `sequence` block is the only authoring change needed.
3. The MACV tests must be expanded to cover the skip scenarios (US unusable but ARVN proceeds, etc.).

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

Update any compile-shape assertion in the MACV test file to expect the `progressionPolicy` field in the compiled output.

### 3. MACV runtime tests — skip scenarios

Add new test cases covering the spec's required MACV acceptance scenarios:
- US usable + ARVN usable → both execute in order.
- US unusable + ARVN usable → US skipped, ARVN executes.
- NVA unusable + VC usable → NVA skipped, VC executes.
- Both steps unusable → neither executes, sequence completes.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify) — add `progressionPolicy: implementWhatCanInOrder` to card 69 grants
- `packages/engine/test/integration/fitl-events-macv.test.ts` (modify) — update compile-shape assertions, add skip scenario tests

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
4. MACV runtime test: US unusable, ARVN usable → US skipped (step 0 in `skippedStepIndices`), ARVN executes.
5. MACV runtime test: NVA unusable, VC usable → NVA skipped, VC executes.
6. MACV runtime test: both US and ARVN unusable → sequence completes without execution.
7. MACV runtime test: executing faction remains eligible throughout.
8. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. No FITL-specific kernel logic is introduced — all behavior comes from the generic `implementWhatCanInOrder` contract.
2. MACV card data uses only the generic contract surface (no custom fields or card-specific hacks).
3. Other FITL event cards with ordered sequences (that don't declare `progressionPolicy`) still use `strictInOrder` by default.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-macv.test.ts` — updated compile-shape assertions + 4 new skip-scenario integration tests

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo lint && pnpm turbo typecheck`
