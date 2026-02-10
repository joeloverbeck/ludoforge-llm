# KERCONVALQUEEVA-003 - Reference Resolution (`resolveRef`)

**Status**: ✅ COMPLETED

## Goal
Implement resolution for all five `Reference` variants using selector helpers and binding context.

## Assumptions Reassessed (2026-02-10)
- `resolvePlayerSel`, `resolveZoneSel`, `resolveSinglePlayerSel`, and `resolveSingleZoneSel` are already implemented in `src/kernel/resolve-selectors.ts` and covered by `test/unit/resolve-selectors.test.ts`.
- Typed eval errors are already implemented in `src/kernel/eval-error.ts` (`MISSING_BINDING`, `MISSING_VAR`, `TYPE_MISMATCH`, `SELECTOR_CARDINALITY`, etc.).
- `resolveRef` does not exist yet, and `test/unit/resolve-ref.test.ts` does not exist yet.
- `src/kernel/index.ts` already re-exports existing kernel modules and must be extended to export `resolve-ref`.

## Updated Scope
- Implement only `resolveRef(ref, ctx)` and unit tests for reference resolution behavior.
- Reuse existing selector helpers and eval error constructors; do not re-implement selector logic.
- Keep output scalar-only (`number | boolean | string`) per ticket invariant.

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

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Added `src/kernel/resolve-ref.ts` implementing all five `Reference` variants (`gvar`, `pvar`, `zoneCount`, `tokenProp`, `binding`) using existing selector helpers.
  - Added `test/unit/resolve-ref.test.ts` with acceptance-case coverage and one additional scalar-invariant edge case for `binding`.
  - Updated `src/kernel/index.ts` to export `resolveRef`.
- Deviations from original plan:
  - Scope was tightened to avoid reworking selector logic because it was already implemented and covered before this ticket.
  - Added explicit scalar-type enforcement for `binding`/`tokenProp` return values to preserve the `resolveRef` return contract.
- Verification:
  - `npm test` passed (build + unit + integration), including new `dist/test/unit/resolve-ref.test.js` and existing `types-exhaustive` checks.
