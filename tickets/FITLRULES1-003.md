# FITLRULES1-003: NVA/VC Resource Transfer Actions

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — existing primitives suffice

## Problem

Rule 1.5.2 allows NVA and VC players to voluntarily transfer Resources to each other during their Operations/Activities/Events. No action exists for this in `30-rules-actions.md`.

This does NOT need a new engine primitive. Resources are tracked as global vars (`nvaResources`, `vcResources`). A transfer is two `addVar` effects: subtract from donor, add to recipient. The player chooses an amount via `chooseOne` with `intsInRange` query (which exists in the kernel — `src/kernel/types-ast.ts` line 100).

## What to Change

**File**: `data/games/fire-in-the-lake/30-rules-actions.md`

Add two new actions to the `actions` array — one for NVA transferring to VC, one for VC transferring to NVA:

```yaml
- id: nvaTransferResources
  actor: active
  executor: '2'
  phase: main
  params: []
  pre:
    op: and
    args:
      - { op: '==', left: { ref: activePlayer }, right: '2' }
      - { op: '>', left: { ref: gvar, var: nvaResources }, right: 0 }
  cost: []
  effects:
    - chooseOne:
        bind: $amount
        options: { query: intsInRange, min: 1, max: { ref: gvar, var: nvaResources } }
    - addVar: { scope: global, var: nvaResources, delta: { op: '*', left: { ref: binding, name: $amount }, right: -1 } }
    - addVar: { scope: global, var: vcResources, delta: { ref: binding, name: $amount } }
  limits: []

- id: vcTransferResources
  actor: active
  executor: '3'
  phase: main
  params: []
  pre:
    op: and
    args:
      - { op: '==', left: { ref: activePlayer }, right: '3' }
      - { op: '>', left: { ref: gvar, var: vcResources }, right: 0 }
  cost: []
  effects:
    - chooseOne:
        bind: $amount
        options: { query: intsInRange, min: 1, max: { ref: gvar, var: vcResources } }
    - addVar: { scope: global, var: vcResources, delta: { op: '*', left: { ref: binding, name: $amount }, right: -1 } }
    - addVar: { scope: global, var: nvaResources, delta: { ref: binding, name: $amount } }
  limits: []
```

### Implementation Notes

- `intsInRange` query uses `min` and `max` fields (see `OptionsQuery` in `src/kernel/types-ast.ts` line 100).
- The `max` field accepts a `ValueExpr`, but `min` is a plain `number`. Verify this during implementation — if `min` doesn't accept ValueExpr, use literal `1`.
- The `chooseOne` approach requires the `intsInRange` max to resolve at runtime. The `effects-choice.ts` module handles this.
- Negation via `{ op: '*', left: <amount>, right: -1 }` is the standard pattern for subtracting a dynamic value.

### Timing Consideration

Per rule 1.5.2, transfers happen "during their Operations/Activities/Events". These actions should be available alongside normal operations. The `phase: main` and executor-restricted `pre` conditions ensure only the active NVA/VC player can use them. If the turn structure requires transfer to be a sub-action within an operation rather than a standalone action, this may need adjustment.

## Invariants

1. Only NVA (player 2) can execute `nvaTransferResources`.
2. Only VC (player 3) can execute `vcTransferResources`.
3. Transfer amount must be between 1 and the donor's current resources (inclusive).
4. After transfer: donor resources decrease by amount, recipient increases by amount.
5. Total resources across both factions are conserved (sum unchanged).
6. Transfer is not available when the donor has 0 resources.

## Tests

1. **Unit test**: Compile production spec, verify `nvaTransferResources` and `vcTransferResources` actions exist.
2. **Integration test**: NVA has 5 resources, transfers 3 → NVA has 2, VC gains 3.
3. **Integration test**: VC has 1 resource, transfers 1 → VC has 0, NVA gains 1.
4. **Integration test**: NVA has 0 resources → `nvaTransferResources` precondition fails, action is not legal.
5. **Determinism test**: Same seed + same transfer amount = same final resource state.
