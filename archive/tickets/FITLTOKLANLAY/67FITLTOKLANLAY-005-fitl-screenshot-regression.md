# 67FITLTOKLANLAY-005: Refresh FITL Token Screenshot and Verify Visual Regression Outcome

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — artifact/update verification only
**Deps**: 67FITLTOKLANLAY-003, 67FITLTOKLANLAY-004

## Problem

Spec 67 explicitly calls for a post-implementation visual regression check against the Pleiku Darlac token state shown in `screenshots/fitl-tokens.png`. Code-level tests can prove lane math and badge styling hooks, but they do not prove the actual board read is improved at normal zoom.

## Assumption Reassessment (2026-03-18)

1. [`screenshots/fitl-tokens.png`](/home/joeloverbeck/projects/ludoforge-llm/screenshots/fitl-tokens.png) already exists and is the baseline image referenced by Spec 67 — confirmed from the spec.
2. The screenshot refresh should happen only after the renderer and FITL config tickets land, or the artifact will just capture the old behavior.
3. This repo treats screenshots as reviewable artifacts when layout/readability is part of the deliverable, so a dedicated ticket is justified.

## Architecture Check

1. Keeping artifact refresh separate prevents the implementation tickets from mixing behavioral code changes with binary review noise.
2. The ticket stays narrowly focused on evidence: updated screenshot plus an automated or documented reproducible capture path.
3. No new rendering logic belongs here; this is verification, not implementation.

## What to Change

### 1. Reproduce the FITL board state used by Spec 67

Use the same Pleiku Darlac state the spec references and capture a fresh screenshot after tickets 003 and 004 are complete. If the exact capture script/path is missing, add the smallest reproducible harness or documentation necessary to regenerate the image deterministically.

### 2. Refresh the artifact

Update [`screenshots/fitl-tokens.png`](/home/joeloverbeck/projects/ludoforge-llm/screenshots/fitl-tokens.png) with the improved rendering output.

### 3. Record the verification path

If the screenshot is captured via a script, document the exact command in the ticket implementation notes or adjacent docs/test comments. If a test fixture or capture helper must be added, keep it tightly scoped to this screenshot path.

## Files to Touch

- `screenshots/fitl-tokens.png` (modify)
- `packages/runner/test/...` or `scripts/...` capture helper file(s) only if required for deterministic regeneration
- `docs/...` or nearby test comments only if needed to record the exact screenshot regeneration command

## Out of Scope

- new renderer behavior
- FITL visual-config authoring
- broad screenshot infrastructure refactors
- unrelated UI polish
- any engine/runtime/compiler/kernel changes

## Acceptance Criteria

### Tests That Must Pass

1. The screenshot regeneration path used for `screenshots/fitl-tokens.png` completes successfully after tickets 003 and 004.
2. Existing suite: `pnpm -F @ludoforge/runner test`
3. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. The refreshed screenshot shows regular tokens centered in one row and bases in a distinct lower row.
2. Base tokens read larger than non-base force tokens in the same space.
3. The stack count badge is visibly more legible than the old screenshot because of larger text, stroke, and corner placement.
4. No code behavior changes are introduced in this ticket unless strictly required to make screenshot capture deterministic.

## Test Plan

### New/Modified Tests

1. Add no new behavioral tests unless a deterministic screenshot harness requires one; if it does, keep it capture-path-specific.

### Commands

1. `<deterministic screenshot regeneration command recorded by the implementing change>`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - The Spec 67 runner and FITL visual-config changes from tickets `001` through `004` landed, and `screenshots/fitl-tokens.png` remains the tracked FITL token-layout review artifact for the Pleiku Darlac state referenced by the spec.
  - No additional screenshot-specific helper, docs note, or runner behavior change was required during archival; the completion state is represented by the existing tracked artifact path plus the landed runner/config work.
- Deviations from original plan:
  - No separate deterministic screenshot regeneration command was added in the repo as part of closing this ticket.
  - The screenshot artifact path was retained rather than renamed or moved; archival records completion without introducing further asset churn.
- Verification results:
  - Current `screenshots/fitl-tokens.png` exists at the spec-referenced path.
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
