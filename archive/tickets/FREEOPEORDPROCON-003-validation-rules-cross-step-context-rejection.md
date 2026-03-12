# FREEOPEORDPROCON-003: Validation Rules — Cross-Step Context Rejection + Mixed Policy

**Status**: COMPLETED
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

1. `progressionPolicy` is already implemented on the shared contract surface, schemas, compiler lowering, and runtime batch context. This ticket is not responsible for adding or plumbing that field.
2. `validate-events.ts` already validates batch-level mixed-policy violations and sequence-context linkage via `collectSequenceContextLinkageGrantReference` plus execution-path-aware effect traversal.
3. `validate-effects.ts` only performs per-grant contract validation via `validateFreeOperationGrantContract`; it does not own cross-grant batch analysis, and forcing batch context into that helper would cut across the current architecture.
4. `requireMoveZoneCandidatesFrom` is not an arbitrary batch/step reference. The current contract is key-based and only resolves against captures in the same sequence batch, so cross-batch references are not expressible and should not appear in this ticket's scope.
5. The actual missing validator is narrower: reject same-batch earlier-step `requireMoveZoneCandidatesFrom` dependencies when the batch resolves to `implementWhatCanInOrder`.

## Architecture Check

1. The cross-step context rejection is a compile-time safety net. It prevents non-deterministic runtime behavior where a later step expects context from a step that was skipped.
2. The cleanest place for the rule is the existing sequence-context linkage validation layer in `validate-events.ts`, because that layer already reasons across grants, batches, steps, and effect execution paths for both declarative and effect-issued grants.
3. This validation applies at the GameDef level (both event-declared and effect-issued grants), preserving the compiler-validates / runtime-executes boundary.
4. No backwards-compatibility concerns — `implementWhatCanInOrder` is entirely new, so no existing data should trigger these rules.

## What to Change

### 1. Cross-step context rejection in sequence-context linkage validation (`validate-events.ts`)

Extend the existing sequence-context linkage validation:

For each same-batch `requireMoveZoneCandidatesFrom` dependency that resolves to an earlier captured step:
- Determine the batch progression policy using the existing normalization (`strictInOrder` default, `implementWhatCanInOrder` explicit).
- If the batch resolves to `implementWhatCanInOrder`, emit a diagnostic with code `FREE_OPERATION_GRANT_SKIP_CAPABLE_CROSS_STEP_CONTEXT` (severity: error).

### 2. Effect-issued grant validation parity

Do not push batch context into `validateFreeOperationGrantContract`. Instead, ensure the shared sequence-context linkage traversal emits the same diagnostic for effect-issued grants along each execution path, just as it already does for mixed-policy and capture-order validation.

## Files to Touch

- `packages/engine/src/kernel/validate-events.ts` (modify) — add cross-step context rejection for event-declared `implementWhatCanInOrder` batches
- `packages/engine/src/kernel/sequence-context-linkage-grant-reference.ts` (modify) — carry enough batch metadata for shared linkage validation to reason about progression policy
- `packages/engine/src/kernel/validate-effects.ts` (no functional change expected) — per-grant contract validation already covers malformed sequence surfaces

## Out of Scope

- Runtime behavior changes (readiness engine, emission logic) — those are FREEOPEORDPROCON-004 and FREEOPEORDPROCON-005.
- MACV data changes — that is FREEOPEORDPROCON-006.
- The mixed-policy-within-batch violation — that is already handled by FREEOPEORDPROCON-001's cross-grant validation layer.
- Schema/type changes unrelated to sequence-context linkage — those are already handled by tickets 001 and 002.
- New diagnostics for malformed unordered `progressionPolicy` usage — the current contract shape already makes that structurally impossible or reports existing sequence shape violations.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: a batch with `implementWhatCanInOrder` where step 1 has `requireMoveZoneCandidatesFrom` referencing step 0 in the same batch → diagnostic `FREE_OPERATION_GRANT_SKIP_CAPABLE_CROSS_STEP_CONTEXT`.
2. Unit test: same batch structure with `strictInOrder` → no diagnostic (cross-step context is safe when earlier steps are guaranteed to execute).
3. Unit test: event-issued and effect-issued grants produce identical diagnostics for the same violation.
4. Existing sequence-context linkage tests continue to pass unchanged for missing-capture and capture-order diagnostics.
6. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. `strictInOrder` batches with cross-step context requirements remain valid (no false rejections).
2. Existing game data (FITL, Texas Hold'em) does not trigger any new diagnostics — `implementWhatCanInOrder` is not used yet.
3. Validation is deterministic and path-independent within a given execution path (same input → same diagnostics regardless of grant traversal order).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — new cases for cross-step context rejection under `implementWhatCanInOrder`
2. `packages/engine/test/unit/kernel/sequence-context-linkage-grant-reference.test.ts` — add coverage only if the helper gains new metadata extraction behavior
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — no change expected unless a regression test is needed to prove runtime parity remains intact

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-12
- What changed:
  - Corrected the ticket assumptions before implementation. The ticket now reflects that `progressionPolicy`, mixed-policy validation, and runtime batch context were already implemented elsewhere in the series.
  - Added a shared validation rule that rejects same-batch earlier-step `requireMoveZoneCandidatesFrom` dependencies when the batch progression policy resolves to `implementWhatCanInOrder`.
  - Kept the rule in the existing sequence-context linkage validation path so declarative event grants and effect-issued grants share one cross-grant validation path.
  - Added focused unit coverage for helper metadata extraction, declarative grant rejection, strict-in-order acceptance, and effect-issued parity.
- Deviations from original plan:
  - Did not add new malformed-unordered `progressionPolicy` diagnostics because the current contract shape already makes that structurally impossible or reports existing sequence shape violations.
  - Did not push batch-aware validation into `validateFreeOperationGrantContract`; that would have weakened the current architecture by mixing per-grant and cross-grant responsibilities.
  - No FITL integration test changes were needed because the relevant engine suite already covers the free-operation runtime paths and no production data currently uses `implementWhatCanInOrder`.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "sequence context|implementWhatCanInOrder|progressionPolicy"` passed; the engine test runner executed the full engine suite, including `validate-gamedef` and FITL free-operation coverage.
  - `pnpm turbo lint` passed with existing repo warnings only; no new lint errors were introduced.
  - `pnpm turbo typecheck` passed.
