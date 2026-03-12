# FREEOPEORDPROCON-003: Validation Rules — Cross-Step Context Rejection + Mixed Policy

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — validator logic in validate-events.ts and validate-effects.ts
**Deps**: archive/tickets/FREEOPEORDPROCON-001-progression-policy-contract-surface.md

## Problem

Two critical validation rules are required before the runtime can safely use `implementWhatCanInOrder`:

1. **Hard rejection rule**: If a batch uses `implementWhatCanInOrder`, no later step may `requireMoveZoneCandidatesFrom` an earlier step in the same batch. Rationale: if an earlier step can be skipped, any context it would have captured is unreliable.
2. **`implementWhatCanInOrder` on unordered grants**: The policy only makes sense for ordered sequences. It must be rejected if the grant has no `sequence` field or if the sequence is malformed.

These rules must apply to both event-issued and effect-issued grants.

## Assumption Reassessment (2026-03-12)

1. `validate-events.ts` already validates sequence context linkage via `collectSequenceContextLinkageGrantReference` (imported at line 27). Grants with `requireMoveZoneCandidatesFrom` are checked for valid batch/step references.
2. `validate-effects.ts:142-177` validates individual grant contracts via `validateFreeOperationGrantContract`.
3. The `sequenceContext` field with `requireMoveZoneCandidatesFrom` is already validated in `sequence-context-linkage-grant-reference.ts` and `free-operation-sequence-context-contract.ts`.
4. No existing validation checks batch-level progression policy consistency or cross-step context safety under skip-capable progression.

## Architecture Check

1. The cross-step context rejection is a compile-time safety net. It prevents non-deterministic runtime behavior where a later step expects context from a step that was skipped.
2. This validation applies at the GameDef level (both event-declared and effect-issued grants), preserving the compiler-validates / runtime-executes boundary.
3. No backwards-compatibility concerns — `implementWhatCanInOrder` is entirely new, so no existing data can trigger these rules.

## What to Change

### 1. Cross-step context rejection in batch validation (`validate-events.ts`)

After the existing sequence context linkage validation, add a new check:

For each batch that uses `implementWhatCanInOrder`:
- Collect all grants in the batch.
- For each grant with `sequenceContext.requireMoveZoneCandidatesFrom`, check if the referenced batch/step is an earlier step in the same batch.
- If yes, emit a diagnostic with code `FREE_OPERATION_GRANT_SKIP_CAPABLE_CROSS_STEP_CONTEXT` (severity: error).

### 2. Policy-on-unordered rejection (`validate-events.ts` + `validate-effects.ts`)

If a grant has no `sequence` field but its containing batch somehow declares `progressionPolicy`, or if `progressionPolicy` is set on a grant without `sequence.batch` and `sequence.step`, reject with a diagnostic.

### 3. Effect-issued grant validation parity (`validate-effects.ts`)

Ensure `validateFreeOperationGrantContract` also checks the cross-step context rule for effect-issued grants. The validation may need to receive batch-level context (all grants in the same batch) to perform the cross-step check.

## Files to Touch

- `packages/engine/src/kernel/validate-events.ts` (modify) — add cross-step context rejection for event-declared `implementWhatCanInOrder` batches
- `packages/engine/src/kernel/validate-effects.ts` (modify) — add same rule for effect-issued grants; reject `progressionPolicy` on non-sequenced grants
- `packages/engine/src/kernel/sequence-context-linkage-grant-reference.ts` (possibly modify) — if the cross-step detection logic fits better here

## Out of Scope

- Runtime behavior changes (readiness engine, emission logic) — those are FREEOPEORDPROCON-004 and FREEOPEORDPROCON-005.
- MACV data changes — that is FREEOPEORDPROCON-006.
- The mixed-policy-within-batch violation — that is already handled by FREEOPEORDPROCON-001's cross-grant validation layer.
- Schema/type changes — those are in tickets 001 and 002.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: a batch with `implementWhatCanInOrder` where step 1 has `requireMoveZoneCandidatesFrom` referencing step 0 in the same batch → diagnostic `FREE_OPERATION_GRANT_SKIP_CAPABLE_CROSS_STEP_CONTEXT`.
2. Unit test: same batch structure with `strictInOrder` → no diagnostic (cross-step context is safe when earlier steps are guaranteed to execute).
3. Unit test: `implementWhatCanInOrder` batch where step 1 has `requireMoveZoneCandidatesFrom` referencing a different batch → no diagnostic (only same-batch cross-step is dangerous).
4. Unit test: grant with `progressionPolicy` but no `sequence` → diagnostic (policy requires ordered sequence).
5. Unit test: event-issued and effect-issued grants produce identical diagnostics for the same violation.
6. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. `strictInOrder` batches with cross-step context requirements remain valid (no false rejections).
2. Existing game data (FITL, Texas Hold'em) does not trigger any new diagnostics — `implementWhatCanInOrder` is not used yet.
3. Validation is deterministic and path-independent (same input → same diagnostics regardless of grant processing order).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — new cases for cross-step context rejection under `implementWhatCanInOrder`
2. `packages/engine/test/unit/kernel/sequence-context-linkage-grant-reference.test.ts` — if logic is added there, new edge-case coverage
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — verify no false positives on existing FITL data

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint && pnpm turbo typecheck`
