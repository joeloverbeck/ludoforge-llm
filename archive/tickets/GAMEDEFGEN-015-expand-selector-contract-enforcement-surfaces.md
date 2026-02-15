# GAMEDEFGEN-015: Expand Selector Contract Enforcement to Additional Selector Surfaces

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Medium

## 0) Reassessed Assumptions (Corrected)

1. Action selector contracts are **already** centralized for `action.actor` and `action.executor` through `action-selector-contract-registry` and are enforced in compiler cross-validation and runtime preflight.
2. The real contract drift is in **turn-flow interrupt cancellation move selectors** (`winner` / `canceled`): the same "selector must declare at least one matching field" rule exists in multiple places with ad-hoc duplication.
3. Zone-owner qualifiers already share selector normalization via `normalizeZoneOwnerQualifier`; they are not the highest-leverage enforcement gap for this ticket.
4. Trigger surfaces currently do not expose an equivalent selector-contract surface that should be folded into this ticket without broadening scope beyond a focused architectural fix.

## 1) Updated Scope (Ticket-Accurate)

1. Introduce a shared, engine-generic contract helper for turn-flow interrupt move selector shape requirements.
2. Reuse that helper in all current enforcement points that validate this selector surface (compiler lowering and schema-layer validation) to eliminate duplicated rule logic/message drift.
3. Preserve existing runtime matching semantics in `legal-moves-turn-order`; this ticket is contract-surface unification, not behavior redesign.
4. Keep diagnostics deterministic and stable by routing equivalent invalid-selector states through one shared contract definition.

## 2) Architecture Rationale

1. This change is more beneficial than the current architecture because it removes duplicated selector-shape rules that can silently diverge as turn-flow evolves.
2. It improves robustness by defining one source of truth for selector contract invariants while keeping the engine game-agnostic.
3. It improves extensibility: adding new selector fields later requires updating one contract definition instead of chasing compiler/schema duplicates.
4. It avoids unnecessary refactors by targeting only the real drift surface identified in the current codebase.

## 3) Invariants That Should Pass

1. Interrupt cancellation selector contract (non-empty matching criteria) is defined once and enforced consistently across compiler/schema surfaces.
2. Equivalent invalid selector inputs produce deterministic diagnostics without contract drift between modules.
3. Valid existing turn-flow specs continue compiling and executing unchanged.
4. No game-specific branching is introduced.

## 4) Tests That Should Pass

1. Unit: compiler diagnostics for invalid interrupt cancellation selector objects are deterministic (code/path/message).
2. Unit: schema validation for interrupt selector emptiness remains aligned with shared contract expectations.
3. Unit: cross-validation flags unknown `winner.actionId` / `canceled.actionId` references in cancellation rules.
4. Regression: existing selector and turn-flow suites continue passing without strictness regressions.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added shared turn-flow interrupt selector contract helper in `src/kernel/turn-flow-interrupt-selector-contract.ts`.
  - Reused shared contract logic in `src/cnl/compile-turn-flow.ts` and `src/kernel/schemas-extensions.ts` to remove duplicated empty-selector checks.
  - Added/updated tests to cover compiler diagnostics, schema alignment, and cross-validation for turn-flow cancellation selectors.
- Deviations from original plan:
  - Scope was narrowed to the actual drift surface found in code (turn-flow cancellation selectors), rather than broader “all selector surfaces”.
  - Runtime matching behavior was intentionally left unchanged.
- Verification:
  - `npm run build`
  - `node --test dist/test/unit/compile-top-level.test.js dist/test/unit/cross-validate.test.js dist/test/unit/kernel/turn-flow-interrupt-selector-contract.test.js`
  - `npm test`
  - `npm run lint`
