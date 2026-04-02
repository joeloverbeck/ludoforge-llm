# DIAGFITL-004: Add semantic tags to coup-phase non-pass actions

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — game-spec data only
**Deps**: `tickets/DIAGFITL-002.md`

## Problem

Coup-phase non-pass actions in FITL lack semantic tags. Without tags, agent considerations that check `candidate.tag.agitate`, `candidate.tag.pacify`, etc. cannot match these actions. This means the agent has no way to distinguish between different coup action types through the consideration system — all coup actions score identically (0) unless they match a general-purpose consideration.

Actions missing semantic tags:
- `coupPacifyUS` (line 205) — should have `tags: [pacify]`
- `coupPacifyARVN` (line 326) — should have `tags: [pacify]`
- `coupAgitateVC` (line 468) — should have `tags: [agitate]`
- `coupRedeployPass` already handled by DIAGFITL-002 for the `pass` tag
- `coupCommitmentResolve` (line 1019) — should have `tags: [commitment]`

Note: There is no `coupAgitateARVN` action in the current spec — agitate is VC-only in FITL. `coupRedeploy` (line 10) is a phase definition, not an action with its own tags.

## Assumption Reassessment (2026-04-02)

1. None of the listed coup actions have tags — confirmed by reading `30-rules-actions.md`
2. The consideration library in `92-agents.md` includes `preferAgitateAction`, `preferPacifyAction`, etc. that check `candidate.tag.agitate`, `candidate.tag.pacify` — confirmed
3. The tag compiler correctly handles multi-tag arrays — confirmed at `compile-action-tags.ts`
4. No redeploy-specific non-pass action exists — `coupRedeploy` is a phase, troops are moved via `coupRedeployUS`/`coupRedeployNVA` pipeline stages. Need to verify exact action IDs.

## Architecture Check

1. Adding semantic tags follows the Spec 103 action tag system design
2. Game-spec data change only — no engine code modified
3. Tags enable the evolution pipeline to discover and weight coup-phase actions through considerations

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

### 2. Verify redeploy actions

Check if there are distinct redeploy actions (beyond `coupRedeployPass`) that need `tags: [redeploy]`. The redeploy phase uses `coupRedeploy` as a phase ID with implicit troop movement — verify whether explicit redeploy action IDs exist that need tagging.

### 3. Regenerate GameDef and update golden fixtures

After modifying the game spec:
1. Build: `pnpm -F @ludoforge/engine build`
2. Regenerate compiled GameDef
3. Update any snapshot/golden test fixtures

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- Golden fixture files if they capture compiled action tags (modify — regenerate)

## Out of Scope

- Adding tags to non-coup actions (rally, march, tax, etc.) — they already have tags from Spec 103
- Adding new considerations for coup actions — that's an evolution campaign concern
- Modifying the pruning rules — DIAGFITL-002 handles the pass tag

## Acceptance Criteria

### Tests That Must Pass

1. Compile FITL game spec — no compiler errors
2. `candidate.tag.agitate` evaluates to `true` for `coupAgitateVC` action
3. `candidate.tag.pacify` evaluates to `true` for `coupPacifyUS` and `coupPacifyARVN`
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All coup-phase non-pass actions appear in the compiled action tag index under their respective semantic tags
2. Existing non-coup action tags are unaffected

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-action-tags.test.ts` — verify coup-phase actions are indexed under correct semantic tags

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
