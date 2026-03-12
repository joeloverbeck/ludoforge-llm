# FREEOPEORDPROCON-005: Emission-Time Skip Evaluation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — shared grant emission and shared sequence-readiness logic
**Deps**: archive/tickets/FREEOPEORDPROCON-001-progression-policy-contract-surface.md, archive/tickets/FREEOPEORDPROCON-002-batch-context-runtime-state.md

## Problem

Spec 60’s contract surface is only partially realized in runtime behavior.

The codebase already has:
- `sequence.progressionPolicy` on the contract surface and validators
- `TurnFlowFreeOperationSequenceBatchContext.progressionPolicy`
- `TurnFlowFreeOperationSequenceBatchContext.skippedStepIndices`
- batch-context initialization for both event-issued and effect-issued sequence grants

What is still missing is the actual ordered-skip semantics for `implementWhatCanInOrder`:
- when a `requireUsableAtIssue` step is unimplementable at emission time, the runtime still silently drops it
- the batch context never records that skipped step
- `isPendingFreeOperationGrantSequenceReady` still looks only at emitted pending grants and ignores batch context
- the shared viability probe still turns earlier unusable sequence steps into blockers for later steps, which hardcodes `strictInOrder` semantics into emission-time probing

That leaves the architecture in an inconsistent state: the explicit contract exists, but the runtime still behaves like the old implicit `strictInOrder` model.

## Reassessed Assumptions (2026-03-12)

1. `applyGrantFreeOperation` in [`packages/engine/src/kernel/effects-turn-flow.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effects-turn-flow.ts) already initializes per-batch runtime context with `progressionPolicy` and `skippedStepIndices: []`. The ticket must not treat that as missing work.
2. Event-issued grant extraction in [`packages/engine/src/kernel/turn-flow-eligibility.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/turn-flow-eligibility.ts) does the same initialization. Event/effect parity scaffolding already exists.
3. `isPendingFreeOperationGrantSequenceReady` in [`packages/engine/src/kernel/free-operation-grant-authorization.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-grant-authorization.ts) still only blocks on earlier emitted pending grants. It does not yet consult `freeOperationSequenceContexts[batchId].skippedStepIndices`.
4. Existing tests already cover:
   - schema/runtime shape for `progressionPolicy` and `skippedStepIndices`
   - strict ordered sequence-context persistence
   - `requireUsableAtIssue` suppression for event-issued and effect-issued grants
5. Existing tests do not yet cover the new runtime semantics this ticket actually needs:
   - recording skipped earlier steps for `implementWhatCanInOrder`
   - allowing later steps once earlier steps are explicitly skipped
   - parity between event-issued and effect-issued skip recording

## Architecture Reassessment

The proposed direction is still better than the current architecture.

Why:
- The explicit policy already exists in authoring, schema, validation, and runtime state. Finishing the runtime is the clean path; leaving it half-implemented is worse architecture than either fully old or fully new.
- The minimal explicit state remains the right design. `skippedStepIndices` is enough; a separate lifecycle map or alias model would be unnecessary complexity.
- The cleanest implementation is still a shared batch progression model, not event-specific or effect-specific branching.

What should not be done:
- no backwards-compatibility aliasing
- no FITL-specific exceptions
- no new standalone batch-state structure
- no readiness inference tricks like “missing earlier grant probably means skipped”

## Scope

Finish the missing runtime behavior for `implementWhatCanInOrder` using the already-landed contract/state shape.

## What to Change

### 1. Shared emission-time skip recording

When a sequence grant uses:
- `sequence.progressionPolicy: implementWhatCanInOrder`
- `viabilityPolicy: requireUsableAtIssue`

and the emission-time viability probe fails:
- do not emit the grant
- record `sequence.step` in the batch context’s `skippedStepIndices`
- preserve ascending, duplicate-free indices

This must happen in both shared issuance paths:
- effect-issued: `applyGrantFreeOperation`
- event-issued: `extractPendingFreeOperationGrants`

### 2. Shared readiness logic

Update `isPendingFreeOperationGrantSequenceReady` so that for `implementWhatCanInOrder` batches a later step is ready when every earlier step is either:
- already consumed or otherwise no longer pending, or
- explicitly listed in `skippedStepIndices`

For `strictInOrder`, preserve current behavior.

### 3. Shared viability probing

Update the shared emission-time viability path so `implementWhatCanInOrder` does not synthesize blockers from earlier unusable steps in the same batch.

This is required for both issuance paths because both rely on the same viability machinery. Without this, later steps still cannot emit even if the batch context records earlier skipped steps correctly.

### 4. Context lifecycle discipline

Preserve the current context lifecycle:
- initialize context on first emitted/considered batch step
- trim contexts when no pending grants remain in that batch
- preserve captured sequence-context data and skipped-step data immutably

## Files to Touch

- `packages/engine/src/kernel/effects-turn-flow.ts` — effect-issued skip recording
- `packages/engine/src/kernel/turn-flow-eligibility.ts` — event-issued skip recording
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` — readiness must consult batch context
- `packages/engine/src/kernel/free-operation-viability.ts` — skip-capable progression must stop treating earlier unusable steps as strict blockers
- `packages/engine/test/unit/effects-turn-flow.test.ts` — effect-issued progression cases
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — event-issued/effect-issued parity and runtime progression cases

## Out of Scope

- Contract/schema/type/validator surface changes from tickets 001-003
- General sequence-context contract work
- MACV data rework from FREEOPEORDPROCON-006
- Wider discovery/apply parity hardening beyond the readiness change required here

## Acceptance Criteria

1. `implementWhatCanInOrder` effect-issued batch:
   - unusable earlier step is not emitted
   - its step index is recorded in `skippedStepIndices`
   - later usable step is emitted
2. `implementWhatCanInOrder` event-issued batch behaves the same way.
3. `strictInOrder` batches continue to silently suppress unusable earlier steps without recording skipped indices.
4. `isPendingFreeOperationGrantSequenceReady` respects `skippedStepIndices` for `implementWhatCanInOrder`.
5. `skippedStepIndices` remains sorted, duplicate-free, and non-negative.
6. Existing strict ordered sequence-context behavior remains intact.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-turn-flow.test.ts`
   - add `implementWhatCanInOrder` effect-issued skip-recording cases
   - keep explicit coverage that `strictInOrder` still suppresses later steps
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`
   - add event-issued `implementWhatCanInOrder` skip-recording case
   - add event/effect parity assertion for batch context state

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint`
3. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - added a shared progression helper so event-issued emission, effect-issued emission, readiness, and viability all resolve `progressionPolicy` consistently
  - implemented skip recording for `implementWhatCanInOrder` in both `applyGrantFreeOperation` and event grant extraction
  - updated shared viability probing so earlier unusable steps no longer hard-block later steps for `implementWhatCanInOrder`
  - updated readiness to consult explicit batch-context skip state instead of relying only on pending-grant absence
  - aligned `EventFreeOperationGrantDef` with the already-landed contract surface so event authoring/types accept `sequence.progressionPolicy`
  - added regression coverage for effect-issued skip recording, strict preservation, event-issued skip recording, event/effect parity, and the expanded execution-path metadata contract
- Deviations from original plan:
  - the reassessed ticket started narrower than the original draft, but implementation also had to fix one remaining contract-surface inconsistency in `types-events.ts`
  - no standalone batch-state model or alias layer was introduced; the final change stayed on the existing batch-context architecture
- Verification results:
  - `pnpm turbo typecheck` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo lint` passed with pre-existing warnings only in `engine` and `runner`
