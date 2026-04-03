# DIAGFITL-004: Add semantic tags to coup-phase non-pass actions

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — game-spec data only
**Deps**: `archive/tickets/DIAGFITL-002.md`

## Problem

Coup-phase non-pass actions in FITL lack semantic tags. That leaves the coup action vocabulary inconsistent with the rest of the authored action-tag surface and prevents future considerations or diagnostics from matching coup actions through the same tag mechanism used elsewhere.

Actions missing semantic tags:
- `coupPacifyUS` (line 205) — should have `tags: [pacify]`
- `coupPacifyARVN` (line 326) — should have `tags: [pacify]`
- `coupAgitateVC` (line 468) — should have `tags: [agitate]`
- `coupRedeployPass` already handled by DIAGFITL-002 for the `pass` tag
- `coupCommitmentResolve` (line 1019) — should have `tags: [commitment]`

Note: There is no `coupAgitateARVN` action in the current spec — agitate is VC-only in FITL. `coupRedeploy` (line 10) is a phase definition, not an action with its own tags.

## Assumption Reassessment (2026-04-02)

1. None of the listed coup actions currently have tags — confirmed by reading `30-rules-actions.md`
2. The live FITL agent library in `92-agents.md` does not yet consume coup-specific tags like `agitate`, `pacify`, `commitment`, or `redeploy` — corrected from the original ticket rationale
3. The action tag compiler already supports these tags generically — confirmed in `compile-action-tags.ts`
4. There is no distinct non-pass redeploy action id in the current spec. `coupRedeploy` is a phase id and `coupRedeployPass` is already handled by `DIAGFITL-002` — confirmed

## Architecture Check

1. Adding semantic tags follows the existing action tag design and keeps coup actions aligned with the rest of the authored action vocabulary
2. This remains a game-spec data change plus verification only; no engine behavior change is required
3. The clean boundary is to author the missing tags now and verify they appear in the compiled production action tag index, without claiming an immediate policy behavior change that the live repo does not yet author

## What to Change

### 1. Add semantic tags to coup-phase actions

In `data/games/fire-in-the-lake/30-rules-actions.md`:

**`coupPacifyUS`** (line 205):
```yaml
  - id: coupPacifyUS
    tags: [pacify]
    actor: active
    ...
```

**`coupPacifyARVN`** (line 326):
```yaml
  - id: coupPacifyARVN
    tags: [pacify]
    actor: active
    ...
```

**`coupAgitateVC`** (line 468):
```yaml
  - id: coupAgitateVC
    tags: [agitate]
    actor: active
    ...
```

**`coupCommitmentResolve`** (line 1019):
```yaml
  - id: coupCommitmentResolve
    tags: [commitment]
    actor: active
    ...
```

### 2. Verify redeploy boundary

Confirm that there are no distinct non-pass redeploy action ids that need a `redeploy` tag in this ticket. Leave redeploy untouched if the current authored surface still exposes only the phase id plus `coupRedeployPass`.

### 3. Verify the compiled production action tag index

After modifying the game spec:
1. Build: `pnpm -F @ludoforge/engine build`
2. Verify the compiled FITL production action tag index includes the tagged coup actions
3. Update any owned test that directly verifies action tag indexing

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/unit/cnl/compile-action-tags.test.ts` (modify)
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts` (modify)

## Out of Scope

- Adding tags to non-coup actions (rally, march, tax, etc.) — they already have tags from Spec 103
- Adding new FITL considerations that consume coup tags — that is separate policy-authoring work
- Modifying the pruning rules — DIAGFITL-002 handles the pass tag

## Acceptance Criteria

### Tests That Must Pass

1. Compile FITL game spec — no compiler errors
2. The compiled FITL production action tag index includes `coupAgitateVC` under `agitate`
3. The compiled FITL production action tag index includes `coupPacifyUS` and `coupPacifyARVN` under `pacify`
4. The compiled FITL production action tag index includes `coupCommitmentResolve` under `commitment`
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Tagged coup-phase non-pass actions appear in the compiled action tag index under their respective semantic tags
2. Existing non-coup action tags are unaffected

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-action-tags.test.ts` — verify generic coup action ids are indexed under correct semantic tags
2. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — verify the compiled FITL production action tag index contains the authored coup tags

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

Completed: 2026-04-02

- Corrected the ticket boundary before implementation: the live FITL agent library does not currently consume coup-specific tags, so this ticket was narrowed to coup action-tag authoring plus compiled production-index verification.
- Added authored semantic tags in `data/games/fire-in-the-lake/30-rules-actions.md` for `coupPacifyUS`, `coupPacifyARVN`, `coupAgitateVC`, and `coupCommitmentResolve`.
- Added generic tag-index coverage in `packages/engine/test/unit/cnl/compile-action-tags.test.ts` and production FITL action-tag-index assertions in `packages/engine/test/integration/fitl-production-data-compilation.test.ts`.
- Confirmed the current redeploy boundary remained unchanged: there is no distinct non-pass redeploy action id to tag in this ticket beyond the already-tagged `coupRedeployPass`.

Verification:

- `pnpm -F @ludoforge/engine build`
- `node --test "dist/test/unit/cnl/compile-action-tags.test.js" "dist/test/integration/fitl-production-data-compilation.test.js"`
- `pnpm turbo typecheck`
- `pnpm -F @ludoforge/engine test`
