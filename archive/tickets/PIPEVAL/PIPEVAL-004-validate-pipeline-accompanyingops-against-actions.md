# PIPEVAL-004: Validate pipeline accompanyingOps against declared actions

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/validate-gamedef-extensions.ts`
**Deps**: None

## Problem

`ActionPipelineDef.accompanyingOps` can be `'any'` or a `readonly string[]` of action IDs. When it is a string array, entries should reference valid action IDs declared in `def.actions`. This reference integrity is not currently enforced in kernel `validateGameDef`, so typos can silently compile while runtime special-activity checks never match as intended.

## Assumption Reassessment (2026-03-05)

1. `ActionPipelineDef.accompanyingOps` is typed as `'any' | readonly string[]` in `packages/engine/src/kernel/types-operations.ts` — confirmed.
2. `validateActionPipelines` already receives `actionCandidates` from `validate-gamedef-core.ts` — confirmed; no new validator plumbing required.
3. Kernel `validateActionPipelines` currently validates `actionId` and linked windows, but does not validate `accompanyingOps` references against `actionCandidates` — confirmed.
4. Runtime enforcement exists in `packages/engine/src/kernel/apply-move.ts` (`operationAllowsSpecialActivity`), so missing compile-time reference validation can produce silent behavioral drift — confirmed.
5. Existing unit coverage in `packages/engine/test/unit/validate-gamedef.test.ts` covers `actionPipelines[*].actionId` reference checks but has no `accompanyingOps` reference tests — confirmed.

## Architecture Reassessment

1. The most robust architecture is to keep reference integrity in compile-time validation (`validateGameDef`) and keep runtime execution (`apply-move`) focused on behavior, not typo detection.
2. Reusing `pushMissingReferenceDiagnostic(..., 'REF_ACTION_MISSING', ...)` keeps diagnostics consistent and engine-generic.
3. No backward-compatibility aliasing: invalid `accompanyingOps` action IDs should fail validation immediately.

## Scope

### In Scope

1. Add kernel validation for `actionPipelines[*].accompanyingOps[*]` when `accompanyingOps` is an array.
2. Emit `REF_ACTION_MISSING` for unknown referenced action IDs.
3. Add unit tests for valid/invalid/omitted/`'any'` accompanyingOps behavior.

### Out of Scope

1. Semantic validation of `accompanyingOps` against turn-flow option matrix.
2. Policy validation of when `'any'` is architecturally appropriate.
3. Runtime behavior changes in `apply-move.ts`.

## Implementation

Inside `validateActionPipelines`, within the existing action-pipeline loop:

```typescript
if (Array.isArray(actionPipeline.accompanyingOps)) {
  actionPipeline.accompanyingOps.forEach((opId, opIndex) => {
    if (!actionCandidates.includes(opId)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_ACTION_MISSING',
        `${basePath}.accompanyingOps[${opIndex}]`,
        `Unknown action "${opId}" in accompanyingOps.`,
        opId,
        actionCandidates,
      );
    }
  });
}
```

## Files to Touch

1. `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
2. `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Acceptance Criteria

1. Pipeline with `accompanyingOps: 'any'` emits no `REF_ACTION_MISSING` on `accompanyingOps`.
2. Pipeline with `accompanyingOps: ['playCard']` (declared action) emits no `REF_ACTION_MISSING` on `accompanyingOps`.
3. Pipeline with `accompanyingOps: ['nonexistent']` emits `REF_ACTION_MISSING` at `actionPipelines[0].accompanyingOps[0]`.
4. Pipeline without `accompanyingOps` emits no `REF_ACTION_MISSING` on `accompanyingOps`.
5. Existing `actionPipelines[*].actionId` validation behavior remains unchanged.

## Hard Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add 4 tests:
   - accepts `'any'`
   - accepts declared action IDs
   - rejects unknown action IDs
   - accepts omitted `accompanyingOps`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-05
- **What changed**:
  - Added kernel reference validation for `actionPipelines[*].accompanyingOps[*]` in `validateActionPipelines` so unknown operation IDs now emit `REF_ACTION_MISSING`.
  - Added four unit tests in `validate-gamedef.test.ts` covering: `accompanyingOps: 'any'`, valid declared IDs, invalid unknown IDs, and omitted `accompanyingOps`.
  - Updated an existing compile fixture in `compile-top-level.test.ts` to declare all action IDs referenced by `accompanyingOps`, aligning with the new invariant.
- **Deviations from original plan**:
  - The implementation plan stayed intact; one additional test fixture correction was required because the new validation surfaced a previously unchecked inconsistent fixture.
- **Verification results**:
  - `node --test packages/engine/dist/test/unit/compile-top-level.test.js packages/engine/dist/test/unit/validate-gamedef.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅
