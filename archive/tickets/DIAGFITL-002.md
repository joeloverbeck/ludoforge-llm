# DIAGFITL-002: Add pass tags to coup-phase pass actions

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — game-spec data only
**Deps**: None

## Problem

Four coup-phase pass actions in FITL lack `tags: [pass]`:
- `coupPacifyPass` (line 184 of `30-rules-actions.md`)
- `coupAgitatePass` (line 196)
- `coupRedeployPass` (line 1001)
- `coupCommitmentPass` (line 1010)

The agent pruning rule `dropPassWhenOtherMovesExist` (defined in `92-agents.md:72-77`) checks `candidate.tag.pass` to identify pass actions. Without the tag, these actions are invisible to the pruning rule and survive even when non-pass alternatives exist. This causes the agent to waste critical decisions on no-ops (e.g., choosing `coupAgitatePass` over `coupAgitateVC` during Coup support phase).

Evidence from seed 1000 trace (Decision 5): `dropPassWhenOtherMovesExist` kept all 3 candidates (3→3), then tie-breaker selected `coupAgitatePass`.

## Assumption Reassessment (2026-04-02)

1. `coupPacifyPass`, `coupAgitatePass`, `coupRedeployPass`, `coupCommitmentPass` have no `tags` field — confirmed by reading `30-rules-actions.md`
2. The main `pass` action at line 159 correctly has `tags: [pass]` — confirmed
3. The action tag compiler (`compile-action-tags.ts:25-27`) silently skips actions without tags — confirmed
4. `dropPassWhenOtherMovesExist` checks `candidate.tag.pass` at `92-agents.md:75` — confirmed

## Architecture Check

1. Adding tags to existing actions is the correct mechanism — the tag system was designed for this purpose (Spec 103)
2. Game-spec data change only — no engine code modified
3. No backwards-compatibility concerns — Foundation 14 satisfied by updating all artifacts atomically

## What to Change

### 1. Add `tags: [pass]` to four coup-phase pass actions

In `data/games/fire-in-the-lake/30-rules-actions.md`:

**`coupPacifyPass`** (after line 184, before `actor:`):
```yaml
  - id: coupPacifyPass
    tags: [pass]
    actor: active
    ...
```

**`coupAgitatePass`** (after line 196, before `actor:`):
```yaml
  - id: coupAgitatePass
    tags: [pass]
    actor: active
    ...
```

**`coupRedeployPass`** (after line 1001, before `actor:`):
```yaml
  - id: coupRedeployPass
    tags: [pass]
    actor: active
    ...
```

**`coupCommitmentPass`** (after line 1010, before `actor:`):
```yaml
  - id: coupCommitmentPass
    tags: [pass]
    actor: active
    ...
```

### 2. Regenerate GameDef and update golden fixtures

After modifying the game spec:
1. Build: `pnpm -F @ludoforge/engine build`
2. Regenerate compiled GameDef (if golden fixtures depend on it)
3. Update any snapshot/golden test fixtures that capture the compiled action tag index

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- Golden fixture files if they capture compiled action tags (modify — regenerate)

## Out of Scope

- Adding semantic tags (agitate, pacify, etc.) to non-pass coup actions — see DIAGFITL-003
- Modifying the pruning rule itself
- Adding new pruning rules for coup-phase actions

## Acceptance Criteria

### Tests That Must Pass

1. Compile FITL game spec — no compiler errors
2. `dropPassWhenOtherMovesExist` pruning: when `coupAgitatePass` and `coupAgitateVC` are both legal, `coupAgitatePass` must be pruned
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All four coup-phase pass actions appear in the compiled action tag index under the `pass` tag
2. The `actionClass` field (already `pass` in the phase config at line 93-96) is consistent with the new tag

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-action-tags.test.ts` — verify coup-phase pass actions are indexed under `pass` tag (if not already tested)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

Completed: 2026-04-02

Added `tags: [pass]` to the four FITL coup-phase pass actions in `data/games/fire-in-the-lake/30-rules-actions.md`: `coupPacifyPass`, `coupAgitatePass`, `coupRedeployPass`, and `coupCommitmentPass`. Also added focused regression coverage in `packages/engine/test/unit/cnl/compile-action-tags.test.ts` so these actions remain indexed under the compiled `pass` tag.

Deviation from original plan: no owned goldens required regeneration. The tag change was fully covered by the targeted compile-action-tags regression and the existing engine suite.

Verification:
- `pnpm -F @ludoforge/engine build`
- `node --test "dist/test/unit/cnl/compile-action-tags.test.js"` from `packages/engine`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo typecheck`
