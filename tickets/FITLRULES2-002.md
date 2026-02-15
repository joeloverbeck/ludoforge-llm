# FITLRULES2-002: Pass Rewards (Rule 2.3.3)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only change in GameSpecDoc YAML
**Deps**: None

## Problem

`passRewards: []` at `data/games/fire-in-the-lake/30-rules-actions.md:33`. Passing factions should receive resource bonuses per Rule 2.3.3, but currently no rewards are granted on pass.

The kernel already implements pass rewards at `src/kernel/turn-flow-eligibility.ts:632-639`. It iterates `turnFlow.passRewards`, matches by `factionClass`, and increments the named `resource` global var by `amount`. The `TurnFlowPassRewardDef` type at `src/kernel/types-turn-flow.ts:31-35`:

```typescript
export interface TurnFlowPassRewardDef {
  readonly factionClass: string;
  readonly resource: string;
  readonly amount: number;
}
```

## Resource Variable Validation

The resource var names must match tracks defined in `data/games/fire-in-the-lake/40-content-data-assets.md`:
- `nvaResources` — track at line 435, scope: faction
- `vcResources` — track at line 441, scope: faction
- `arvnResources` — track at line 447, scope: faction

These compile to global vars accessible via `state.globalVars[reward.resource]`.

## What to Change

**File**: `data/games/fire-in-the-lake/30-rules-actions.md`

Replace `passRewards: []` (line 33) with:

```yaml
passRewards:
  - { factionClass: '0', resource: arvnResources, amount: 3 }
  - { factionClass: '1', resource: arvnResources, amount: 3 }
  - { factionClass: '2', resource: nvaResources, amount: 1 }
  - { factionClass: '3', resource: vcResources, amount: 1 }
```

**Rules mapping (Rule 2.3.3)**:
- US (faction `'0'`) passes → +3 ARVN Resources (COIN factions share the ARVN resource pool)
- ARVN (faction `'1'`) passes → +3 ARVN Resources
- NVA (faction `'2'`) passes → +1 NVA Resources
- VC (faction `'3'`) passes → +1 VC Resources

## Invariants

1. Compiled `GameDef` must contain exactly 4 `passRewards` entries.
2. When US passes, `arvnResources` global var increases by 3.
3. When ARVN passes, `arvnResources` global var increases by 3.
4. When NVA passes, `nvaResources` global var increases by 1.
5. When VC passes, `vcResources` global var increases by 1.
6. Non-pass actions must not trigger any reward.
7. Pass rewards do not affect eligibility (passing faction stays eligible per Rule 2.3.3).

## Tests

1. **Compile test**: Compile production FITL spec and assert `turnFlow.passRewards` contains 4 entries with correct `factionClass`, `resource`, and `amount` values.
2. **Integration runtime — US pass**: Set up US as active faction, execute pass move, verify `arvnResources` increased by 3.
3. **Integration runtime — ARVN pass**: Set up ARVN as active faction, execute pass move, verify `arvnResources` increased by 3.
4. **Integration runtime — NVA pass**: Set up NVA as active faction, execute pass move, verify `nvaResources` increased by 1.
5. **Integration runtime — VC pass**: Set up VC as active faction, execute pass move, verify `vcResources` increased by 1.
6. **Integration runtime — non-pass no reward**: Execute a non-pass action and verify resource vars unchanged.
7. **Regression**: Existing FITL turn flow golden tests still pass.
