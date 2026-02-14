# ARCHDSL-003 - Standardized Removal Telemetry for Effects/Macros

**Status**: Pending  
**Priority**: Medium  
**Depends on**: None

## 1) What needs to change / be added

Add a generic removal telemetry primitive so specs can consume “what was removed” directly instead of repeated before/after recount logic.

### Required implementation changes

- Define a standard effect output contract for removal operations/macros:
  - count removed total
  - count removed by optional filters (e.g., faction/type)
  - optional list/set of removed token ids (bounded or summarized to preserve performance)
- Provide binder surface(s) to consume telemetry within the same effect pipeline stage.
- Ensure existing removal macros (e.g., assault/removal order helpers) can emit telemetry consistently.
- Refactor FITL Body Count aid logic to use standardized removal telemetry instead of repeated local before/after count scaffolding.

### Expected files to touch (minimum)

- `src/cnl/binder-surface-registry.ts`
- `src/kernel/effects-choice.ts` / removal effect execution path
- macro expansion/lowering path for removal macros
- `data/games/fire-in-the-lake.md` (Body Count cleanup)

## 2) Invariants that should pass

- Telemetry contract is generic and reusable across games.
- No semantic change for existing specs that do not reference telemetry outputs.
- Telemetry values are deterministic and match actual state mutations.
- Performance overhead remains bounded and measurable.

## 3) Tests that should pass

### New/updated unit tests

- `test/unit/effects-choice.test.ts` and/or `test/unit/effects-runtime.test.ts`
  - removal telemetry values match actual removed tokens.
- `test/unit/binder-surface-registry.test.ts`
  - telemetry binders are registered and type-checked.

### New/updated integration tests

- `test/integration/fitl-momentum-formula-mods.test.ts`
  - Body Count aid uses telemetry-driven removed-guerrilla counts.
- `test/integration/fitl-removal-ordering.test.ts`
  - confirms removal ordering still correct while telemetry is emitted.

### Full-suite gates

- `npm run build`
- `npm run lint`
- `npm test`

