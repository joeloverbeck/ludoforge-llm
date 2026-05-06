# 156PREVOBSUTMET-003: Per-candidate selectionReason field

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts` (selectionReason population), one new unit test
**Deps**: `archive/tickets/156PREVOBSUTMET-001.md`

## Implementation Outcome

Completed on 2026-05-06. The action-selection candidate metadata emitter now sets `selectionReason: 'gated'` only for candidates whose `previewOutcome` is `'gated'`; every surviving non-gated candidate uses the intentional `'prior'` placeholder until Spec 157 refines allocator reasons.

Added `packages/engine/test/unit/agents/preview-selection-reason-gated-parity.test.ts`, an `architectural-invariant` FITL fixture that checks:

1. `Σ candidate.selectionReason === 'gated'` equals `metadata.previewGatedCount`.
2. `previewUsage.outcomeBreakdown.unknownGated` remains in parity with `metadata.previewGatedCount`.
3. Every non-gated candidate uses `selectionReason: 'prior'`.
4. `selectionReason` arrays are byte-identical across two identical evaluations.

Ticket corrections applied: `previewUsage.previewGatedCount` -> live `metadata.previewGatedCount`; focused `test:unit -- agents/...` command -> build plus direct compiled `node --test` file.

Schema/artifact fallout: none expected; ticket 001 already added the required schema/type field and enum.

Source file size ledger: `packages/engine/src/agents/policy-eval.ts` was preexisting over repo guidance at 1318 lines; this ticket adds one local metadata expression there. Extraction would widen the ticket beyond the owned trace-field population slice, so it is deferred with no new residual owner.

Deferred sibling/spec scope: Spec 157 owns `coverage` / `widening` refinements; ticket 004 owns synthetic-decision trace; ticket 005 owns inner-frontier `scoreContributions`; ticket 006 owns cookbook documentation.

Verification:

1. `pnpm -F @ludoforge/engine build` — pass.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/preview-selection-reason-gated-parity.test.js` — pass (rerun after `pnpm turbo typecheck` rebuilt `dist/`).
3. `pnpm -F @ludoforge/engine test` — pass; schema artifact check plus default lane, 63/63 files passed.
4. `pnpm turbo typecheck` — pass.

Late-edit proof validity: final status/proof transcription changed only this ticket's status and evidence ledger after the green lanes. It did not change code, tests, schema/artifact surfaces, command semantics, scope, thresholds, dependencies, or acceptance boundaries, so no proof lane was invalidated by the terminal status edit.

## Problem

Spec 156's `selectionReason` enum has six values (`coverage`, `prior`, `shallowDelta`, `widening`, `cache`, `gated`). Today only the `gated` semantics is well-defined: a candidate that was excluded from the preview budget by `pickTopKByMoveOnlyScore` is `'gated'`. The other five enumerators are populated by Specs 157 (`coverage`, `prior`, `widening`), Spec 159 (`fallback` as a synthetic-decision selectionReason — different surface), and future caching work (`cache`, `shallowDelta`).

Ticket 001 added the field to the schema and types with default `'gated'`. This ticket completes the mechanical wiring for the only enumerator that has well-defined semantics today: every candidate marked via `evaluation.markPreviewGated()` (`policy-eval.ts:606`) sets `selectionReason: 'gated'` in its trace; every candidate that survived the gate sets `selectionReason: 'prior'` as a placeholder until Spec 157 distinguishes the post-gate enumerators. A parity test asserts the count of `'gated'` candidates equals the legacy `previewGatedCount` field.

## Assumption Reassessment (2026-05-06)

1. `evaluation.markPreviewGated(candidate)` is the single call site that flags a gated candidate today (`policy-eval.ts:606`). Every other candidate in `activeCandidates` survived the gate and gets the `'prior'` placeholder. Confirm via `grep -n markPreviewGated packages/engine/src/agents/`.
2. `previewGatedCount` is computed at `policy-eval.ts:594-608` and stamped on policy evaluation metadata. Parity check: `Σ candidates where selectionReason === 'gated'` MUST equal `metadata.previewGatedCount`. The two fields coexist this iteration; a future cleanup spec may consolidate.
3. Per-candidate trace metadata is the `PolicyEvaluationCandidateMetadata` type (`policy-eval.ts:97`). Ticket 001 added `selectionReason` as a required field with default `'gated'`. This ticket sets the actual value at metadata-composition time.
4. The placeholder `'prior'` is a documented, intentional placeholder. Spec 157 will refine to `'coverage' | 'prior' | 'widening'` based on which allocator phase selected the candidate. No alias issue.

## Architecture Check

1. Single-call-site marking (`markPreviewGated` already exists) keeps the new field's semantics close to the existing `previewGatedCount` accounting. Alternative (compute selectionReason at trace-emit time from candidate state) would re-derive what `markPreviewGated` already records.
2. No game-specific logic: the field is engine-generic enum-valued, populated by engine-internal gating decisions. Same code path applies to every game.
3. No backwards-compatibility shims. The placeholder `'prior'` is honest: ticket 001's schema field has a required default, this ticket replaces the default with a placeholder semantically distinct from `'gated'`. Spec 157 will fill in the real enumerators in the same change as the allocator lands.

## What to Change

### 1. Population — `packages/engine/src/agents/policy-eval.ts`

In the per-candidate metadata composition (the loop at `policy-eval.ts:1000+` building `PolicyEvaluationCandidateMetadata`), add:

```ts
selectionReason: candidate.previewOutcome === 'gated' ? 'gated' : 'prior',
```

Or, if the gating state is tracked separately from `previewOutcome`: query `evaluation.isPreviewGated(candidate)` (matching `markPreviewGated`'s setter). Choose the cheaper path during implementation.

### 2. Parity invariant test

`packages/engine/test/unit/agents/preview-selection-reason-gated-parity.test.ts` (new) — for every action-selection decision in a constructed FITL fixture, assert `Σ (candidate.selectionReason === 'gated') === metadata.previewGatedCount`. `architectural-invariant`.

### 3. Replay-identity test extension

Extend `packages/engine/test/unit/trace/policy-trace-shape.test.ts` (or add a dedicated replay test): two runs over the same GameDef + seed produce byte-identical `selectionReason` arrays.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — populate `selectionReason`)
- `packages/engine/test/unit/agents/preview-selection-reason-gated-parity.test.ts` (new)

## Out of Scope

- Distinguishing `coverage`, `prior`, `widening` enumerators beyond the placeholder. (Spec 157.)
- `shallowDelta`, `cache` enumerators. (Future.)
- Synthetic-decision `selectionReason` (different surface; reuses the field name but in `SyntheticDecisionTraceEntry`, not on the candidate metadata). (Ticket 004.)
- Removing the legacy `previewGatedCount` field. (Future cleanup spec.)

## Acceptance Criteria

### Tests That Must Pass

1. New: parity test — for every action-selection decision, `Σ candidates where selectionReason === 'gated'` equals `metadata.previewGatedCount`.
2. New: every non-gated candidate has `selectionReason: 'prior'` (placeholder invariant) until Spec 157 refines.
3. Existing engine suite: `pnpm -F @ludoforge/engine test`.
4. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) `selectionReason ∈ {'coverage', 'prior', 'shallowDelta', 'widening', 'cache', 'gated'}` for every candidate trace (Ajv enforcement from ticket 001).
2. (architectural-invariant) `Σ candidates where selectionReason === 'gated' === previewGatedCount` over the same decision (parity).
3. (architectural-invariant) `selectionReason` is deterministic across runs (replay-identity).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/preview-selection-reason-gated-parity.test.ts` (new) — `architectural-invariant`. Parity invariant.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/preview-selection-reason-gated-parity.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`

Focused command correction: the package `test:unit` script runs the compiled `dist/test/unit/**/*.test.js` glob and is not the reliable focused-file entrypoint for this new witness. Build first, then run the concrete compiled test file with `node --test`.

## Outcome

Completed: 2026-05-06.

What changed:

- `packages/engine/src/agents/policy-eval.ts` now emits per-candidate `selectionReason: 'gated'` only when `previewOutcome` is `'gated'`; every non-gated action-selection candidate emits the intentional `'prior'` placeholder.
- Added `packages/engine/test/unit/agents/preview-selection-reason-gated-parity.test.ts` to prove gated-count parity, non-gated placeholder behavior, and deterministic `selectionReason` arrays on a FITL production fixture.

Deviations from original plan:

- The draft's `previewUsage.previewGatedCount` wording was corrected to the live `metadata.previewGatedCount` field.
- The focused test command was corrected from `test:unit -- agents/...` to build plus direct compiled `node --test` execution.

Verification:

- `pnpm -F @ludoforge/engine build` — pass.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/preview-selection-reason-gated-parity.test.js` — pass, including rerun after `pnpm turbo typecheck` rebuilt `dist/`.
- `pnpm -F @ludoforge/engine test` — pass; schema artifact check plus default lane, 63/63 files passed.
- `pnpm turbo typecheck` — pass.
