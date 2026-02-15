# GAMEDEFGEN-006: Expand Explicit Selector Applicability Contracts Across Runtime

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Small-Medium  
**Backwards Compatibility**: None (internal architecture hardening only)

## Reassessed Baseline (Current Code/Test Reality)

The original assumptions in this ticket are partially outdated.

1. `actor` and `executor` already use explicit typed outcomes via:
   - `src/kernel/action-actor.ts`
   - `src/kernel/action-executor.ts`
2. `legalMoves`, `legalChoices`, and `applyMove` already branch on typed actor/executor results rather than matching eval-error categories at callsites.
3. There is no clear remaining selector family in legality/apply paths that should adopt `notApplicable` semantics without conflating spec-invalid/runtime-fatal behavior.
4. Existing tests cover several actor/executor paths, but direct resolver-contract tests are missing, and `legalMoves` has limited explicit coverage for actor/executor invalid-spec handling.

## Updated Scope (Corrected)

This ticket is narrowed to architecture verification and coverage hardening, not additional runtime contract expansion.

1. Confirm and preserve current architecture: typed applicability contracts stay focused on action actor/executor preflight surfaces.
2. Add direct unit tests for resolver outcomes (`applicable`, `notApplicable`, `invalidSpec`) in:
   - `resolveActionActor`
   - `resolveActionExecutor`
3. Add/strengthen `legalMoves` tests to explicitly assert:
   - actor/executor `notApplicable` actions are skipped deterministically
   - actor/executor `invalidSpec` errors are surfaced (not silently skipped)
4. Do not introduce new resolver outcome taxonomies for unrelated selector/eval surfaces in this ticket; that would overlap broader preflight/error-taxonomy work tracked separately (`GAMEDEFGEN-007`, `GAMEDEFGEN-008`, `GAMEDEFGEN-010`).

## Architecture Rationale

Further broadening applicability contracts beyond actor/executor right now is not more beneficial than the current architecture. Actor/executor are preflight applicability gates; many other selector uses are execution semantics where failure should remain explicit spec-invalid/runtime errors. Expanding `notApplicable` indiscriminately would increase ambiguity and coupling instead of improving robustness.

## Invariants

1. Legality/choice/apply actor+executor applicability remains typed and deterministic.
2. `notApplicable` stays a deliberate preflight concept, not a catch-all for selector/runtime failures.
3. Invalid selector states continue surfacing explicitly as errors.
4. Valid GameDef behavior and move ordering remain unchanged.

## Tests To Add / Strengthen

1. Unit: `action-actor` resolver contract (`applicable`, `notApplicable`, `invalidSpec`).
2. Unit: `action-executor` resolver contract (`applicable`, `notApplicable`, `invalidSpec`, plus binding fallback behavior).
3. Unit: `legalMoves` explicitly covers actor/executor not-applicable skip and invalid-spec surfacing.
4. Verification: run targeted unit tests, `npm test`, and `npm run lint`.

## Outcome

- Completion date: 2026-02-15
- Actually changed:
  - Reassessed and corrected this ticket’s assumptions/scope to match current runtime architecture.
  - Added direct resolver contract tests:
    - `test/unit/kernel/action-actor.test.ts`
    - `test/unit/kernel/action-executor.test.ts`
  - Strengthened `legalMoves` actor/executor contract coverage in `test/unit/kernel/legal-moves.test.ts`.
- Deviations from original plan:
  - No runtime architecture expansion was implemented because actor/executor typed applicability contracts and callsite integration were already complete; further broadening in this ticket would overlap broader preflight/error-taxonomy tickets and reduce clarity.
- Verification:
  - `npm run build`
  - `node --test dist/test/unit/kernel/action-actor.test.js dist/test/unit/kernel/action-executor.test.js dist/test/unit/kernel/legal-moves.test.js`
  - `npm test`
  - `npm run lint`
