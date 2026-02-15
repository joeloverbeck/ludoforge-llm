# FITLRULES2-001: Option Matrix (Rule 2.3.4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only change in GameSpecDoc YAML
**Deps**: None

## Problem

`optionMatrix: []` at `data/games/fire-in-the-lake/30-rules-actions.md:32`. Without populated rows, the 2nd eligible faction receives no constraint on its action class choice, violating Rule 2.3.4 which defines strict relationships between the 1st eligible's choice and what the 2nd eligible may do.

The kernel already implements row lookup via `isMoveAllowedByTurnFlowOptionMatrix` in `src/kernel/legal-moves-turn-order.ts:18`. The `TurnFlowOptionMatrixRowDef` type at `src/kernel/types-turn-flow.ts:26-29` defines the shape:

```typescript
export interface TurnFlowOptionMatrixRowDef {
  readonly first: 'event' | 'operation' | 'operationPlusSpecialActivity';
  readonly second: readonly TurnFlowActionClass[];
}
```

## What to Change

**File**: `data/games/fire-in-the-lake/30-rules-actions.md`

Replace `optionMatrix: []` (line 32) with:

```yaml
optionMatrix:
  - first: operation
    second: [limitedOperation]
  - first: operationPlusSpecialActivity
    second: [limitedOperation, event]
  - first: event
    second: [operation, operationPlusSpecialActivity]
```

**Rules mapping (Rule 2.3.4)**:
- 1st chose **Operation** (without SA) → 2nd gets **Limited Operation** only
- 1st chose **Operation + Special Activity** → 2nd gets **Limited Operation** or **Event**
- 1st chose **Event** → 2nd gets **Operation** (with or without SA)
- **Pass** is always available regardless of matrix (handled by kernel, not in matrix rows)

## Invariants

1. Compiled `GameDef` must contain exactly 3 `optionMatrix` rows.
2. When 1st eligible chose `operation`, 2nd eligible's only non-pass option must be `limitedOperation`.
3. When 1st eligible chose `operationPlusSpecialActivity`, 2nd eligible may choose `limitedOperation` or `event`.
4. When 1st eligible chose `event`, 2nd eligible may choose `operation` or `operationPlusSpecialActivity`.
5. Pass (`actionClass: 'pass'`) is always available to 2nd eligible regardless of 1st's choice.
6. Existing production spec must compile without new diagnostics.

## Tests

1. **Compile test**: Compile production FITL spec and assert `turnFlow.optionMatrix` contains exactly 3 rows with the correct `first`/`second` values.
2. **Integration runtime — operation → limitedOperation only**: Set up 1st eligible choosing `operation`, verify 2nd eligible's legal moves are restricted to `limitedOperation` and `pass`.
3. **Integration runtime — operationPlusSpecialActivity → limitedOperation or event**: Set up 1st eligible choosing `operationPlusSpecialActivity`, verify 2nd eligible can choose `limitedOperation`, `event`, or `pass`.
4. **Integration runtime — event → operation or operationPlusSpecialActivity**: Set up 1st eligible choosing `event`, verify 2nd eligible can choose `operation`, `operationPlusSpecialActivity`, or `pass`.
5. **Regression**: Existing FITL turn flow golden tests still pass.
