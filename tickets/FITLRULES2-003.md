# FITLRULES2-003: Monsoon Restrictions (Rule 2.3.9)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small-Medium
**Engine Changes**: None — data-only change in GameSpecDoc YAML
**Deps**: None

## Problem

`monsoon: { restrictedActions: [] }` at `data/games/fire-in-the-lake/30-rules-actions.md:36-37`. No restrictions are enforced during monsoon turns (when lookahead is a coup card), violating Rule 2.3.9 which restricts Sweep, March, Air Strike, and Air Lift and blocks pivotal events.

The kernel already implements monsoon restriction enforcement at `src/kernel/legal-moves-turn-order.ts:190+`. It checks `monsoonActive` (true when lookahead card is coup) and applies restrictions per `TurnFlowMonsoonRestrictionDef`. The types at `src/kernel/types-turn-flow.ts:37-50`:

```typescript
export interface TurnFlowMonsoonRestrictionDef {
  readonly actionId: string;
  readonly maxParam?: {
    readonly name: string;
    readonly max: number;
  };
  readonly overrideToken?: string;
}

export interface TurnFlowMonsoonDef {
  readonly restrictedActions: readonly TurnFlowMonsoonRestrictionDef[];
  readonly blockPivotal?: boolean;
  readonly pivotalOverrideToken?: string;
}
```

## What to Change

**File**: `data/games/fire-in-the-lake/30-rules-actions.md`

Replace the monsoon section (lines 36-37) with:

```yaml
monsoon:
  restrictedActions:
    - { actionId: sweep }
    - { actionId: march }
    - { actionId: airStrike, maxParam: { name: spaceCount, max: 2 } }
    - { actionId: airLift, maxParam: { name: spaceCount, max: 2 } }
  blockPivotal: true
```

**Rules mapping (Rule 2.3.9)**:
- **Sweep**: Fully blocked during monsoon ("even via Advise")
- **March**: Fully blocked during monsoon
- **Air Strike**: Limited to 2 spaces during monsoon
- **Air Lift**: Limited to 2 spaces during monsoon
- **Pivotal Events**: Blocked during monsoon (cannot be played when lookahead is coup)

## Open Investigation Items

1. **`maxParam.name` validation**: The parameter name `spaceCount` must match the actual parameter name used in Air Strike and Air Lift action profiles in `30-rules-actions.md`. Verify during implementation by grepping for `airStrike` and `airLift` action profile parameter definitions.

2. **Sweep via Advise**: Rule 2.3.9 says Sweep is blocked "even via Advise." Need to verify whether Advise-triggered Sweep uses the same `sweep` actionId or routes through a different action. If Advise uses a separate actionId (e.g., `adviseSweep`), an additional restriction entry would be needed.

3. **Action IDs**: Confirm exact action IDs are `sweep`, `march`, `airStrike`, `airLift` by checking action profile definitions in `30-rules-actions.md`.

## Invariants

1. Monsoon activates only when lookahead card is a coup card.
2. Sweep and March are fully blocked during monsoon (no legal moves with those action IDs).
3. Air Strike and Air Lift are limited to 2 spaces during monsoon.
4. Pivotal events are blocked during monsoon.
5. All other operations (Train, Patrol, Rally, Attack, Terror, Assault) remain unrestricted during monsoon.
6. When lookahead is not a coup card, no monsoon restrictions apply.

## Tests

1. **Compile test**: Compile production FITL spec and assert `turnFlow.monsoon.restrictedActions` contains 4 entries and `blockPivotal` is `true`.
2. **Integration runtime — Sweep blocked**: Set up monsoon active (lookahead = coup card), verify Sweep is not in legal moves.
3. **Integration runtime — March blocked**: Set up monsoon active, verify March is not in legal moves.
4. **Integration runtime — Air Strike limited**: Set up monsoon active, verify Air Strike legal moves constrain space count to ≤ 2.
5. **Integration runtime — Air Lift limited**: Set up monsoon active, verify Air Lift legal moves constrain space count to ≤ 2.
6. **Integration runtime — other ops unrestricted**: Set up monsoon active, verify Train/Rally/Attack/Terror/Patrol/Assault remain in legal moves.
7. **Integration runtime — non-monsoon no restrictions**: Set up non-coup lookahead, verify all operations including Sweep/March are available.
8. **Regression**: Existing FITL turn flow golden tests still pass.
