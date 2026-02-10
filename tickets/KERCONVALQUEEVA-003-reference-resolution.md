# KERCONVALQUEEVA-003 - Reference Resolution (`resolveRef`)

**Status**: TODO

## Goal
Implement resolution for all five `Reference` variants using selector helpers and binding context.

## Scope
- Add `resolveRef(ref, ctx)` for:
  - `gvar`
  - `pvar`
  - `zoneCount`
  - `tokenProp`
  - `binding`
- Enforce scalar-selector requirement for `pvar` and `zoneCount`.
- Produce typed errors with useful context (available vars/bindings/selectables).

## File List Expected To Touch
- `src/kernel/resolve-ref.ts`
- `src/kernel/index.ts`
- `test/unit/resolve-ref.test.ts`

## Out Of Scope
- Arithmetic/aggregate evaluation.
- Query execution logic.
- Condition operator logic.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/resolve-ref.test.ts`:
  - `gvar('threat')` resolves when present; missing var throws `MISSING_VAR`.
  - `pvar(actor, 'money')` resolves; `pvar(all, 'money')` throws `SELECTOR_CARDINALITY`.
  - `zoneCount('deck:none')` resolves size; `zoneCount('hand:all')` throws `SELECTOR_CARDINALITY`.
  - `tokenProp('$card','cost')` resolves bound token prop.
  - unbound token or missing token prop throws typed error with available bindings.
  - `binding('$x')` resolves; missing binding throws `MISSING_BINDING` with available bindings list.
- Existing checks remain green:
  - `test/unit/types-exhaustive.test.ts`

### Invariants That Must Remain True
- `resolveRef` is read-only and deterministic.
- Returned values are only `number | boolean | string`.
- Errors never fall back to untyped generic throws for modeled failure modes.
