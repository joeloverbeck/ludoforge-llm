# ARCHGSD-006 - Explicit Macro Binding Visibility Contract (No Implicit Exports)

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Type**: Architecture / DSL Contract  
**Depends on**: `ARCHGSD-005` (completed, archived)

## Why this ticket exists
Macro binder visibility currently relies on implicit conventions (for example templated vs non-templated names). This is brittle and prevents robust, explicit contracts at scale.

## Reassessed assumptions (2026-02-14)
- `src/cnl/expand-effect-macros.ts` still implements implicit exports when `exports` is omitted (non-templated binders are treated as public).
- `EffectMacroDef.exports` is currently optional in `src/cnl/game-spec-doc.ts`; this is the contract point to tighten.
- There is no dedicated diagnostic today for caller cross-stage use of non-exported binders; failures currently surface through generic binding-scope validation later in compile.
- The repository does not currently include required runtime YAML game specs that must be migrated for this change; the main in-repo macro surface that must be updated is tests and any checked-in fixture/spec artifacts that compile in CI.

## 1) Specification (what must change)
- Make macro binding visibility explicit-only in `GameSpecDoc`:
  - `exports` is the single source of truth for public macro decision/binding names.
- Remove implicit export heuristics from expansion logic.
- Add strict diagnostics for visibility violations:
  - exported symbol not declared;
  - duplicate exports;
  - caller cross-stage use of a non-exported macro binder must fail deterministically (either dedicated macro-visibility diagnostic or existing binding-scope error mapped to deterministic paths).
- Update in-repo macro definitions/fixtures/tests that intentionally expose binders to declare `exports` explicitly.
- No fallback alias mode.

## 2) Invariants (must remain true)
- Macro public contract is fully readable from macro definition alone.
- Non-exported macro-local binders never leak to caller-visible move params.
- Existing behavior remains deterministic after explicit migrations.

## 3) Tests to add/modify
## Test updates in existing files
- `test/unit/expand-effect-macros.test.ts`
  - omitted `exports` means no externally visible binders (all declared binders are hygienically renamed);
  - explicit `exports` preserves only declared public binders;
  - non-exported cross-stage reference fails deterministically.
- `test/integration/effect-macro-compile.test.ts`
  - end-to-end pipeline enforces explicit exports-only visibility contract.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Outcome
- **Completion date**: 2026-02-14
- **What changed**:
  - Removed implicit export heuristics in `src/cnl/expand-effect-macros.ts`; omitted `exports` now means no public binders.
  - Added unit coverage in `test/unit/expand-effect-macros.test.ts` to enforce that non-templated binders are not implicitly exported when `exports` is omitted.
  - Added integration coverage in `test/integration/effect-macro-compile.test.ts` for deterministic failure on cross-stage use of non-exported binders.
  - Added regression coverage in `test/integration/effect-macro-compile.test.ts` to preserve caller-scope binding refs through nested macro args.
  - Migrated production FITL macro contracts in `data/games/fire-in-the-lake.md` by explicitly exporting cross-stage binders used by caller-visible pipelines (`$damage`, `$targetFactionFirst`, `targetSpaces`, `$movingGuerrillas`, `$movingTroops`).
- **Deviations from original plan**:
  - Instead of requiring `exports` to be present on every macro definition, this implementation enforces explicit visibility by semantics (`exports` omitted => zero public binders) to avoid unnecessary broad fixture churn while still removing implicit visibility behavior.
  - Existing test files were extended rather than introducing additional new files.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` ✅
