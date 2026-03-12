# FREEOPEORDPROCON-004: Sequence Readiness Engine — Reassessed and Retired

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No — ticket correction only
**Deps**: archive/tickets/FREEOPEORDPROCON-002-batch-context-runtime-state.md

## Problem

This ticket originally proposed changing `isPendingFreeOperationGrantSequenceReady` so readiness would consult `skippedStepIndices`.

After reassessing the current engine and tests against [Spec 60](/home/joeloverbeck/projects/ludoforge-llm/specs/60-free-operation-ordered-progression-contract.md), that proposal is not the right architecture.

## Assumption Reassessment (2026-03-12)

1. The contract/runtime surface this ticket assumed was missing already exists:
   - `sequence.progressionPolicy` is implemented on the grant contract/compiler path.
   - `TurnFlowFreeOperationSequenceBatchContext` already carries `progressionPolicy` and `skippedStepIndices`.
   - runtime/schema tests already enforce that shape.
2. `isPendingFreeOperationGrantSequenceReady` still checks only earlier pending grants in the same batch.
3. That is not itself a bug. A skipped step is, by design, a step that was not emitted into `pendingFreeOperationGrants`.
4. Because readiness is derived from pending grants, a skipped step should already be non-blocking without special readiness logic.
5. The real progression gate is earlier in the pipeline:
   - event-issued emission in `packages/engine/src/kernel/turn-flow-eligibility.ts`
   - effect-issued emission in `packages/engine/src/kernel/effects-turn-flow.ts`
   - usability probing in `packages/engine/src/kernel/free-operation-viability.ts`
6. `free-operation-viability.ts` already models earlier unusable sequence steps as probe blockers. That is why strict ordering is enforced before readiness is ever consulted.
7. For `implementWhatCanInOrder`, the missing work is therefore to change emission/probing so a skipped earlier step does not become a synthetic blocker. That belongs to `tickets/FREEOPEORDPROCON-005-emission-time-skip-evaluation.md`, not here.

## Scope Correction

This ticket does not need a production runtime change.

The proposed readiness-layer change would move progression semantics into the wrong layer and duplicate state interpretation that properly belongs in emission-time viability/probe logic.

This ticket is therefore retired. The remaining functional work stays in:

- `tickets/FREEOPEORDPROCON-005-emission-time-skip-evaluation.md`
- `tickets/FREEOPEORDPROCON-007-regression-matrix.md`

## Architecture Check

1. The current architecture is cleaner if readiness remains a pure function of pending emitted grants.
2. `skippedStepIndices` is emission/progression metadata, not authorization metadata. Using it in readiness would couple two layers that should stay separate.
3. The robust long-term design is:
   - emission/probe logic decides which steps emit and which steps are skipped
   - pending-grant readiness continues to answer only “is an emitted grant blocked by earlier emitted grants?”
4. No backwards-compatibility aliases or extra fallback semantics are needed.

## What Changed

1. Reassessed the ticket against the actual code paths and existing tests.
2. Corrected the ticket scope: no readiness-engine code change is required or desirable.
3. Closed this ticket so implementation effort stays focused on the real missing layer in ticket 005.

## Out Of Scope

- Any production code change in `free-operation-grant-authorization.ts`
- Any readiness/discovery/legal-move/eligibility change based on `skippedStepIndices`
- Emission/probe updates for `implementWhatCanInOrder` batches
- Regression-matrix additions

## Verification

The reassessment was validated by inspecting:

- `packages/engine/src/kernel/free-operation-grant-authorization.ts`
- `packages/engine/src/kernel/free-operation-viability.ts`
- `packages/engine/src/kernel/turn-flow-eligibility.ts`
- `packages/engine/src/kernel/effects-turn-flow.ts`
- existing ordered free-operation tests in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - corrected the ticket assumptions and scope after comparing it to the current engine architecture and tests
  - retired the proposed readiness-layer implementation as architecturally misplaced
- Deviations from original plan:
  - no engine code was changed
  - no new tests were added under this ticket because the issue is with the ticket’s premise, not with a distinct readiness defect
- Verification results:
  - code-path review confirmed that ordered progression is enforced at emission/probe time, while readiness operates only on emitted pending grants
  - remaining implementation work was traced to `FREEOPEORDPROCON-005`, not this ticket
