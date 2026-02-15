# FITLRULES1-005: US ARVN Resource Spending Constraint

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — precondition/cost guard additions

## Problem

Rule 1.8.1 states that when the US player performs Operations or Pacification that spend ARVN Resources, the US may only spend ARVN Resources that exceed the Total Econ level. Only the ARVN player may spend Resources at or below Econ.

Currently, US actions that spend ARVN Resources (e.g., Train with ARVN pieces, Pacification) deduct a flat 3 from `arvnResources` without checking whether the post-deduction amount would drop to or below `totalEcon`.

## What to Change

**File**: `data/games/fire-in-the-lake/30-rules-actions.md`

For every US action or profile that spends ARVN Resources, add a guard ensuring `arvnResources > totalEcon` before the spending occurs. Specifically, the constraint is:

```yaml
# ARVN Resources must exceed totalEcon by at least the cost amount
# For a cost of 3:
op: '>'
left: { ref: gvar, var: arvnResources }
right: { op: '+', left: { ref: gvar, var: totalEcon }, right: 3 }
```

Or equivalently: `arvnResources - cost > totalEcon`, i.e., after spending, resources must still be above Econ.

### Actions to Audit

Grep results for `arvnResources` spending in `30-rules-actions.md` show these lines involve `addVar: { scope: global, var: arvnResources, delta: -3 }`:

1. **Line 476**: Train action — placing ARVN cubes costs 3 ARVN Resources
2. **Line 684**: US Pacification — costs 3 ARVN Resources per space
3. **Line 712**: US Pacification — another branch costing 3 ARVN Resources
4. **Line 810**: Another Train variant — 3 ARVN Resources
5. **Line 975**: Patrol ARVN profile — cost 3 ARVN Resources (this is ARVN's own action, NOT affected)
6. **Lines 1303, 1470, 1573**: Other profiles spending ARVN Resources

**For each occurrence**: Determine whether the actor is US (player 0) or ARVN (player 1). The constraint only applies to US spending of ARVN Resources.

### Fix Pattern

For US actions/profiles that spend ARVN Resources, wrap the spending in a guard:

```yaml
- if:
    when:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: '0' }  # US player
        - { op: '>', left: { ref: gvar, var: arvnResources }, right: { op: '+', left: { ref: gvar, var: totalEcon }, right: 3 } }
    then:
      - addVar: { scope: global, var: arvnResources, delta: -3 }
```

Alternatively, if the action's `legality` or `costValidation` already checks `arvnResources >= 3`, strengthen it to also check `arvnResources > totalEcon + cost` when the active player is US.

### Implementation Notes

- `totalEcon` is tracked as a global var (see `40-content-data-assets.md` line 468), initialized to 10.
- ARVN's own actions spending ARVN Resources should NOT be constrained by this rule — ARVN can spend down to 0.
- The constraint means: `arvnResources - costAmount > totalEcon` for US. Rearranged: `arvnResources > totalEcon + costAmount`.

## Invariants

1. US player cannot spend ARVN Resources if doing so would reduce `arvnResources` to `totalEcon` or below.
2. ARVN player CAN spend ARVN Resources without the Econ constraint.
3. If `totalEcon` is 10 and `arvnResources` is 13, US can spend 2 (13-2=11 > 10) but not 3 (13-3=10, not > 10).
4. If `totalEcon` changes (via events), the constraint adjusts dynamically.
5. Existing ARVN-actor profiles remain unmodified.

## Tests

1. **Unit test**: Compile production spec, verify no compilation errors.
2. **Integration test**: US Train with `arvnResources = 15`, `totalEcon = 10` → spending 3 succeeds (15-3=12 > 10).
3. **Integration test**: US Train with `arvnResources = 13`, `totalEcon = 10` → spending 3 fails (13-3=10, not > 10).
4. **Integration test**: ARVN Patrol with `arvnResources = 3`, `totalEcon = 10` → spending 3 succeeds (ARVN not constrained).
5. **Integration test**: US Pacification with `arvnResources = 11`, `totalEcon = 10` → spending 3 fails.
6. **Regression test**: All existing ARVN-actor spending still works correctly.
