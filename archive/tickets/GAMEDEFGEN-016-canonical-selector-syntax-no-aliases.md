# GAMEDEFGEN-016: Canonical Selector Syntax (No Aliases)

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## 0) Reassessed Baseline (2026-02-15)

Current compiler behavior does **not** match this ticket's target state yet:

1. `activePlayer` is currently accepted as a selector alias and normalized to `active` in `src/cnl/compile-selectors.ts`.
2. Selector suggestions currently advertise aliases (for example `activePlayer`) in both `src/cnl/compile-selectors.ts` and `src/kernel/action-selector-contract-registry.ts`.
3. Existing tests explicitly assert alias acceptance/canonicalization (not rejection), including:
   - `test/unit/compile-selectors.test.ts`
   - `test/unit/compile-zones.test.ts`
   - `test/unit/compile-actions.test.ts`
   - `test/unit/compile-top-level.test.ts`
4. Runtime `PlayerSel` is already canonical (`active`, not `activePlayer`) in `src/kernel/types-ast.ts`; aliasing exists at compile-input normalization boundaries.

## 1) What Needs To Change / Be Added

1. Define one canonical selector vocabulary for GameSpecDoc player selectors and enforce it uniformly in compiler validation/lowering.
2. Remove selector aliases that create dual spellings for the same meaning (specifically reject `activePlayer` where a player selector token is expected).
3. Ensure diagnostics for non-canonical selector tokens are explicit, deterministic, and include canonical replacement guidance (`active`).
4. Keep selector syntax engine-generic and reusable across games; do not add game-specific exceptions.
5. Update compiler-facing selector guidance text to canonical tokens only (no alias spellings).

## 2) Invariants That Should Pass

1. Every accepted player-selector token has exactly one canonical textual representation.
2. Non-canonical selector aliases fail compilation with deterministic diagnostics.
3. Runtime receives only canonical selector forms from compiled GameDefs.
4. No game-specific selector branches are introduced in compiler or kernel.

## 3) Scope (Files Expected)

Primary implementation scope:

1. `src/cnl/compile-selectors.ts`
2. `src/kernel/action-selector-contract-registry.ts`

Primary test scope:

1. `test/unit/compile-selectors.test.ts`
2. `test/unit/compile-zones.test.ts`
3. `test/unit/compile-actions.test.ts`
4. `test/unit/compile-top-level.test.ts`
5. Any golden fixture(s) asserting selector suggestion text, if affected.

## 4) Tests That Should Pass

1. Unit: selector normalization accepts canonical tokens and rejects alias tokens with stable diagnostic code/path/message/suggestion.
2. Unit: zone qualifier normalization rejects alias owner qualifiers (for example `hand:activePlayer`) with deterministic diagnostics.
3. Unit: compile flows using alias selector tokens fail deterministically at expected paths.
4. Unit: compile flows using canonical tokens still compile and lower to expected canonical selector AST.
5. Regression: selector-related compiler/runtime suites pass with alias handling removed.

## 5) Architectural Rationale

1. Canonical-only selector syntax reduces parser surface area and removes hidden coercion paths.
2. Rejecting aliases at compile boundaries preserves a single shared contract between CNL input, diagnostics, and kernel AST.
3. This change is a net architectural improvement over current alias normalization because it enforces one source of truth and lowers long-term maintenance risk.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Removed `activePlayer` alias acceptance in player selector normalization; canonical token is now `active` only.
  - Updated selector suggestion contracts to canonical vocabulary only.
  - Added deterministic non-canonical alias diagnostics with explicit replacement guidance (`Use "active".`).
  - Updated compile/zone/conditions/top-level/action tests to enforce alias rejection and canonical-only success paths.
  - Updated affected golden fixture suggestion text.
- Deviations from original plan:
  - Expanded test scope to include `test/unit/compile-conditions.test.ts` after full-suite validation exposed one missed alias-acceptance assumption.
- Verification results:
  - `npm run lint` passed.
  - `npm run build` passed.
  - `npm run test:all` passed (`212` passed, `0` failed).
