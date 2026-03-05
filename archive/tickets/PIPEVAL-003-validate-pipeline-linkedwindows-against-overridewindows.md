# PIPEVAL-003: Validate pipeline linkedWindows against eligibility override windows

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/validate-gamedef-extensions.ts`
**Deps**: None

## Problem

`ActionPipelineDef.linkedWindows` contains override-window ID strings (e.g. `['us-special-window']`) that should reference `turnFlow.eligibility.overrideWindows[*].id`.

Current behavior is inconsistent across validation surfaces:
- CNL cross-validation already checks this reference (`CNL_XREF_PROFILE_WINDOW_MISSING`).
- Kernel `validateGameDef` does not check it, so direct `GameDef` callers can bypass the guard and ship silent typos.

This creates drift between compiler validation and kernel validation for the same model contract.

## Assumption Reassessment (2026-03-05)

1. `ActionPipelineDef.linkedWindows` is typed as `readonly string[]` at `types-operations.ts:35` — confirmed.
2. `linkedWindows` semantically targets `turnFlow.eligibility.overrideWindows[*].id`, not `turnFlow.durationWindows` — confirmed in `src/cnl/cross-validate.ts` and integration tests asserting FITL special-activity window IDs.
3. Existing validation does exist in CNL (`CNL_XREF_PROFILE_WINDOW_MISSING`), but not in kernel `validateGameDef` — confirmed by grep of `src/kernel/validate-gamedef-*.ts`.
4. FITL production spec uses `linkedWindows` in several pipelines and references override window IDs (e.g. `us-special-window`, `arvn-special-window`) — confirmed by integration tests.

## Architecture Check

1. Correct contract is `linkedWindows -> eligibility.overrideWindows[*].id`; validating against `durationWindows` would be architecturally incorrect because `durationWindows` is a duration enum list, not a window identifier catalog.
2. Kernel and CNL should enforce the same cross-reference rule to prevent split-brain validation behavior.
3. Game-agnostic: override windows and action pipelines are shared engine concepts; no FITL-specific branching required.

## What to Change

### 1. Build `overrideWindowCandidates` in `validateActionPipelines`

When `def.turnOrder?.type === 'cardDriven'`, extract `def.turnOrder.config.turnFlow.eligibility.overrideWindows` and build canonical candidate IDs from each `window.id`.

### 2. Validate each `linkedWindows` entry

Inside the `actionPipeline` forEach loop, add:
```typescript
(actionPipeline.linkedWindows ?? []).forEach((windowId, windowIndex) => {
  if (!overrideWindowCandidates.has(windowId)) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING',
      `${basePath}.linkedWindows[${windowIndex}]`,
      `Unknown turn-flow eligibility override window "${windowId}".`,
      windowId,
      [...overrideWindowCandidates],
    );
  }
});
```

### 3. Add diagnostic code

Diagnostic codes are string-based; no enum registration required. Reuse `pushMissingReferenceDiagnostic` pattern used by other kernel reference checks.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify — add tests)

## Out of Scope

- Validating override-window declaration shape itself (already handled elsewhere)
- Changing CNL cross-validation behavior or diagnostic naming
- Runtime behavior changes for unrecognized windows

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline with valid `linkedWindows` referencing declared `eligibility.overrideWindows[*].id` — no diagnostic
2. Pipeline with `linkedWindows: ['nonexistent']` — produces `REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING`
3. Pipeline without `linkedWindows` — no diagnostic
4. FITL production spec compiles with zero `REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING` diagnostics
5. Existing suite: `pnpm turbo test --force`

### Invariants

1. No game-specific branching in kernel validation
2. `linkedWindows` validation only active when `turnOrder.type === 'cardDriven'`
3. Validation source-of-truth for window IDs is `eligibility.overrideWindows[*].id`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — 3 new tests (valid, invalid, absent)

### Commands

1. `pnpm turbo build && pnpm turbo test --force`

## Outcome

- **Completion date**: 2026-03-05
- **What changed**:
  - Corrected the ticket contract from `linkedWindows -> durationWindows` to `linkedWindows -> turnFlow.eligibility.overrideWindows[*].id`.
  - Implemented kernel-side reference validation in `validateActionPipelines` with diagnostic code `REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING`.
  - Added/updated unit coverage in `validate-gamedef.test.ts` for valid reference, missing reference, absent field, and non-card-driven gating.
  - Extracted a shared contract utility (`turn-flow-linked-window-contract`) used by both kernel and CNL cross-validation to keep linked-window semantics centralized and prevent future validator drift.
  - Added CNL coverage for `CNL_XREF_PROFILE_WINDOW_MISSING` and contract-level unit coverage for shared helper behavior.
- **Deviations from original plan**:
  - Did not implement `REF_DURATION_WINDOW_MISSING`; that code would enforce the wrong model contract.
  - Added an extra test for the invariant that validation is skipped when `turnOrder.type !== 'cardDriven'`.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `node --test packages/engine/dist/test/unit/cross-validate.test.js` passed.
  - `node --test packages/engine/dist/test/unit/contracts/turn-flow-linked-window-contract.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-production-data-compilation.test.js` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
