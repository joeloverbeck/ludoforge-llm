# FITLRULES2-005: Limited Operation Enforcement Verification (Rule 2.3.5)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — investigation and test coverage only
**Deps**: FITLRULES2-001 (option matrix must be populated for LimOp to be assigned as an action class)

## Problem

Rule 2.3.5 states that a Limited Operation allows the faction to execute an operation in only 1 space with no Special Activity. Need to verify that all FITL operation profiles correctly check `__actionClass == 'limitedOperation'` and constrain to 1 space, and that no Special Activity is offered during limited operations.

The `__actionClass` binding pattern is already confirmed in several profiles (Train-US at line 426, Train-ARVN at line 682, Patrol-US at line 933, etc. in `30-rules-actions.md`). Need to verify all remaining operation profiles follow the same pattern.

## Scope

This is an **investigation + test coverage** ticket. No data changes unless gaps are found.

### What to Verify

1. **All operation profiles** in `data/games/fire-in-the-lake/30-rules-actions.md` must gate space selection count on `__actionClass`:
   - When `__actionClass == 'limitedOperation'`, space selection `max` must be `1`
   - When `__actionClass != 'limitedOperation'`, space selection uses the normal max

2. **Profiles to check** (grep for all action profiles with `actionClass: operation`):
   - `train-us-profile` — confirmed has `__actionClass` check
   - `train-arvn-profile` — confirmed has `__actionClass` check
   - `patrol-us-profile` — confirmed has `__actionClass` check
   - `sweep-*` profiles — need verification
   - `assault-*` profiles — need verification
   - `rally-*` profiles — need verification
   - `march-*` profiles — need verification
   - `attack-*` profiles — need verification
   - `terror-*` profiles — need verification

3. **Special Activity suppression**: Verify that when `__actionClass == 'limitedOperation'`, no Special Activity (SA) is offered. This may be enforced:
   - At the profile level (conditional skipping of SA decision steps), or
   - At the kernel level (turn flow prevents SA pairing with LimOp action class)

## Invariants

1. Every operation profile must constrain space selection to max 1 when `__actionClass == 'limitedOperation'`.
2. No Special Activity is offered during a limited operation.
3. Normal operations (non-LimOp) retain their original space selection limits.
4. The `__actionClass` binding must be available in all operation profile execution contexts.

## Tests

1. **Structural test**: For each operation profile in compiled `GameDef`, verify the decision tree contains an `__actionClass == 'limitedOperation'` conditional that constrains space count.
2. **Integration runtime — LimOp 1 space**: Execute a limited operation and verify that space selection is constrained to exactly 1 space.
3. **Integration runtime — LimOp no SA**: Execute a limited operation and verify no Special Activity decisions are presented.
4. **Integration runtime — normal op multi-space**: Execute a normal operation and verify multi-space selection is available.
5. **Regression**: Existing FITL operation tests still pass.

## Deliverables

- Investigation report documenting which profiles have the `__actionClass` check and which (if any) are missing it.
- Test file(s) covering LimOp enforcement across all operation types.
- If gaps are found: data changes to add missing `__actionClass` gates in affected profiles.
