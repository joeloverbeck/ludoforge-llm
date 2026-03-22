# OUTPOLCON-001: Outcome policy enforcement contract documentation

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — comments only
**Deps**: None

## Problem

The outcome policy for free-operation grants (`mustChangeGameplayState`) is enforced at two sites with a conditional split: optional grants are pre-filtered at enumeration time (`legal-moves.ts`), while required grants are surfaced unconditionally at enumeration and enforced at apply time (`apply-move.ts`). This split is only partially documented in source. `FREEOP-OUTCOME-001` introduced enumeration-time filtering that unknowingly contradicted the established contract for required grants, causing integration failures before the behavioral tests corrected the regression.

The current source code documents the enumeration side with a short comment, but the apply-time enforcement side has no matching contract note or cross-reference. Existing tests prove the behavior, but contributors reading the kernel code still have to reconstruct the split indirectly. That is the gap this ticket should close.

## Assumption Reassessment (2026-03-22)

1. `legal-moves.ts:604-605` has the comment `// Required grants must always be surfaced so the obligation is visible; // the outcome policy is enforced at applyMove time.` — this is the only documentation of the enumeration side.
2. `apply-move.ts:123` defines `validateFreeOperationOutcomePolicy` with no contract comment explaining it is the enforcement side of the documented split.
3. `apply-move.ts:1255` calls `validateFreeOperationOutcomePolicy` with no inline cross-reference.
4. Existing behavioral coverage already proves the split, including:
   - `packages/engine/test/unit/kernel/apply-move.test.ts`
     - `rejects free operations that fail mustChangeGameplayState outcome policy`
     - `marks completed free operations that fail mustChangeGameplayState as non-viable during probing`
     - `ignores non-material variable changes when enforcing mustChangeGameplayState outcome policy`
   - `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`
     - `blocks pass during required grant windows and rejects free operations that fail outcome policy`
     - `rejects overlapping free operations that fail required outcome policy even when pending grants are reordered`
5. Therefore, the real gap is not missing behavior coverage; it is missing bidirectional source-level contract documentation at the two enforcement sites.

## Architecture Check

1. The current split is architecturally justified:
   - Enumeration must keep required grants visible so the obligation is explicit to the caller.
   - Apply-time enforcement must remain authoritative because only post-execution state can prove whether gameplay state materially changed.
2. Comment-only change — zero risk of behavioral regression. The work strengthens discoverability of a critical invariant without duplicating logic or introducing alias paths.
3. Engine-agnostic: the outcome policy mechanism is generic (not game-specific). The comments document the generic contract.
4. No shims or aliases introduced.

## What to Change

### 1. Add contract JSDoc on `validateFreeOperationOutcomePolicy` at `apply-move.ts:123`

Add a JSDoc comment explaining:
- This function is the enforcement half of the outcome policy contract
- The enumeration half (`legal-moves.ts`) surfaces required grants unconditionally so the obligation is visible
- This function rejects moves that fail to change gameplay state when `outcomePolicy: 'mustChangeGameplayState'` applies
- Cross-reference: `legal-moves.ts` `isFreeOperationCandidateAdmitted`

### 2. Add inline cross-reference at `apply-move.ts:1255`

Add: `// CONTRACT: Outcome policy enforcement (pair: legal-moves.ts isFreeOperationCandidateAdmitted). Required grants surfaced at enumeration, enforced here.`

### 3. Expand the existing comment at `legal-moves.ts:604-605`

Add a cross-reference to `apply-move.ts validateFreeOperationOutcomePolicy` so the bidirectional link is complete.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify — expand comment at line ~604)
- `packages/engine/src/kernel/apply-move.ts` (modify — add contract comments at lines ~123 and ~1255)

## Out of Scope

- Any behavioral code changes
- Refactoring the enumeration/apply split into a new abstraction; the current architecture is sound for this invariant because it depends on both pre-execution visibility and post-execution state comparison
- Documenting other enumeration/enforcement splits beyond outcome policy
- Adding new behavioral tests unless the source review exposes an uncovered invariant

## Acceptance Criteria

### Tests That Must Pass

1. No new tests are expected unless source review reveals a missing invariant
2. Targeted regression coverage for the documented contract
3. Existing suite: `pnpm turbo lint`
4. Existing suite: `pnpm turbo typecheck`
5. Existing suite: `pnpm turbo test`

### Invariants

1. No behavioral changes — diff must contain only comment lines
2. Cross-references between `legal-moves.ts` and `apply-move.ts` must be bidirectional

## Test Plan

### New/Modified Tests

1. Expected: none — comment-only source change
2. Verification must still rerun the existing unit and integration tests that prove the split

### Commands

1. `pnpm -F @ludoforge/engine test:unit`
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
5. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Corrected the ticket assumptions to acknowledge that the outcome-policy split was already proven by existing unit and integration tests, and narrowed the gap to missing bidirectional source-level contract documentation.
  - Added the missing contract documentation in `packages/engine/src/kernel/apply-move.ts` and completed the cross-reference from `packages/engine/src/kernel/legal-moves.ts`.
- Deviations from original plan:
  - No behavioral or test changes were needed. The original ticket framed the gap as wholly undocumented; the final implementation reflects that tests already documented behavior, while source comments did not.
  - The final source change kept the existing enumeration/apply split intact because it is the clean architecture for this invariant: visibility belongs at enumeration, authoritative outcome validation belongs after execution.
- Verification results:
  - `pnpm -F @ludoforge/engine test:unit` ✅
  - `pnpm -F @ludoforge/engine test:integration:fitl-rules` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo test` ✅
