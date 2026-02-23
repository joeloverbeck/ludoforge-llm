# FITLRULES2-002: Pass Rewards (Rule 2.3.3)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only change in GameSpecDoc YAML
**Deps**: None

## Problem

`passRewards: []` is currently declared in `data/games/fire-in-the-lake/30-rules-actions.md` under `turnOrder.config.turnFlow` (currently around line 44). Per Rule 2.3.3, passing factions should receive resource bonuses, but production FITL currently grants none.

The kernel already implements pass rewards in `packages/engine/src/kernel/turn-flow-eligibility.ts` (currently around lines 662-675). It iterates `turnFlow.passRewards`, matches by `seatClass`, and increments the named `resource` global var by `amount`. The `TurnFlowPassRewardDef` type in `packages/engine/src/kernel/types-turn-flow.ts`:

```typescript
export interface TurnFlowPassRewardDef {
  readonly seatClass: string;
  readonly resource: string;
  readonly amount: number;
}
```

No kernel/compiler changes are required for this ticket; only FITL production data and tests.

## Resource Variable Validation

The resource var names must match tracks defined in `data/games/fire-in-the-lake/40-content-data-assets.md`:
- `nvaResources` (currently around line 758)
- `vcResources` (currently around line 764)
- `arvnResources` (currently around line 770)

These compile to global vars accessible via `state.globalVars[reward.resource]`.

## What to Change

**File**: `data/games/fire-in-the-lake/30-rules-actions.md`

Replace `passRewards: []` with:

```yaml
passRewards:
  - { seatClass: '0', resource: arvnResources, amount: 3 }
  - { seatClass: '1', resource: arvnResources, amount: 3 }
  - { seatClass: '2', resource: nvaResources, amount: 1 }
  - { seatClass: '3', resource: vcResources, amount: 1 }
```

**Rules mapping (Rule 2.3.3)**:
- US (seat `'0'`) passes → +3 ARVN Resources (COIN factions share ARVN resources in this rules encoding)
- ARVN (seat `'1'`) passes → +3 ARVN Resources
- NVA (seat `'2'`) passes → +1 NVA Resources
- VC (seat `'3'`) passes → +1 VC Resources

## Scope and Architecture Assessment

- Keep pass-reward behavior fully data-driven via `turnFlow.passRewards` in GameSpec YAML.
- Do not add FITL-specific branches in kernel/compiler code.
- Do not add aliases/backward-compat fields (`factionClass`); use canonical `seatClass` only.
- This is architecturally preferable to engine changes because it preserves the agnostic kernel and keeps rules ownership in spec data.

## Invariants

1. Compiled `GameDef` must contain exactly 4 `passRewards` entries.
2. When US passes, `arvnResources` global var increases by 3.
3. When ARVN passes, `arvnResources` global var increases by 3.
4. When NVA passes, `nvaResources` global var increases by 1.
5. When VC passes, `vcResources` global var increases by 1.
6. Non-pass actions must not trigger any reward.
7. Pass rewards do not affect eligibility (passing faction stays eligible per Rule 2.3.3).

## Tests

1. **Compile test (production FITL)**: Assert `turnFlow.passRewards` contains 4 entries with exact `seatClass`/`resource`/`amount` tuples.
2. **Integration runtime — chained passes**: Execute pass for seats `0 -> 1 -> 2 -> 3` and verify cumulative track deltas:
   - `arvnResources` +6
   - `nvaResources` +1
   - `vcResources` +1
3. **Integration runtime — non-pass control**: Execute non-pass action (for example `event`) and verify pass-reward tracks remain unchanged.
4. **Regression**: Existing FITL turn-flow/eligibility integration tests remain green.

## Outcome

- **Completion date**: 2026-02-23
- **What changed**:
  - Updated production FITL `turnFlow.passRewards` in `data/games/fire-in-the-lake/30-rules-actions.md` to encode Rule 2.3.3 rewards using canonical `seatClass`.
  - Corrected stale ticket assumptions (field names, engine paths, line references, and test scope) before implementation.
  - Added/updated production-spec tests to verify both compile-time pass-reward wiring and runtime pass/non-pass behavior.
- **Deviations from original plan**:
  - Runtime non-pass control test uses `usOp` instead of `event` to avoid card-parameter coupling while still validating the invariant.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-pass-rewards-production.test.js dist/test/integration/fitl-production-data-compilation.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (255 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅
