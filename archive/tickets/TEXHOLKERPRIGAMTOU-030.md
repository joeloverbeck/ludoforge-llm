# TEXHOLKERPRIGAMTOU-030: Strict-Binding Migration of Production Game Specs/YAML

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-029
**Blocks**: TEXHOLKERPRIGAMTOU-031

## 0) Reassessed assumptions (2026-02-16)

1. The core strict/definite-binding compiler behavior is already implemented by `TEXHOLKERPRIGAMTOU-029` (`src/cnl/compile-effects.ts` and `src/cnl/binder-surface-registry.ts`), so this ticket is not a compiler-architecture ticket.
2. Current repository tests already include branch-merge/static-binding unit coverage (`test/unit/compile-bindings.test.ts`), so this ticket should focus on production/fixture spec conformance and regression guardrails rather than reimplementing dataflow logic.
3. Production-spec compilation coverage exists for FITL and Texas, but there is no explicit regression assertion that both production specs stay free of strict-binding diagnostics (`CNL_COMPILER_BINDING_UNBOUND`) as specs evolve.
4. The `Data Asset Location Rule` remains unchanged: `data/<game>/...` is fixture/reference input for tests and authoring, while compile/runtime contracts remain represented in `GameSpecDoc` YAML payloads.
5. Architectural direction for this ticket is to strengthen tests around existing generic compiler behavior; avoid game-specific engine branches or compatibility aliases.

## 1) What needs to change / be added

1. Audit production GameSpec YAML (`data/games/fire-in-the-lake`, `data/games/texas-holdem`) for strict-binding conformance under current compiler rules.
2. Refactor only affected specs/macros/fixtures if any conditional-binding assumptions remain; do not change compiler architecture already delivered by `TEXHOLKERPRIGAMTOU-029`.
3. Add targeted regression tests asserting production specs compile without `CNL_COMPILER_BINDING_UNBOUND` diagnostics.
4. Preserve engine-agnostic architecture: all behavior stays encoded in YAML/GameSpecDoc; compiler/runtime remain generic.
5. Introduce no backward-compat aliases for legacy binding names.

## 2) Invariants that should pass

1. FITL and Texas production specs compile under definite-binding rules with zero `CNL_COMPILER_BINDING_UNBOUND` diagnostics.
2. Any spec refactors preserve gameplay behavior and determinism (seeded reproducibility unchanged except where bug fixes are intended and documented).
3. No compatibility aliases are introduced for old binding names/paths.
4. Compiler/kernel remain game-agnostic; no game-specific strict-binding exceptions are introduced.

## 3) Tests that should pass

1. Integration: FITL production compilation suites remain green.
2. Integration: Texas runtime bootstrap/structure suites remain green.
3. Integration: explicit production strict-binding regression tests (FITL + Texas) remain green.
4. Unit: binding/macro tests remain green (`test/unit/compile-bindings.test.ts`, `test/unit/expand-macros.test.ts`).
5. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16.
- What actually changed:
  - Reassessed ticket assumptions against current code/tests and narrowed scope from "implement strict binding" to "verify and guard production-spec conformance" because compiler-level dataflow work was already completed in `TEXHOLKERPRIGAMTOU-029`.
  - Added integration regression coverage in `test/integration/production-spec-strict-binding-regression.test.ts` to assert both FITL and Texas production specs remain free of `CNL_COMPILER_BINDING_UNBOUND` diagnostics.
- Deviations from original plan:
  - No production YAML refactor was needed after audit; existing specs already satisfied current definite-binding rules.
  - No compiler/runtime architecture changes were introduced; this ticket intentionally reinforced current generic architecture via tests only.
- Verification results:
  - `npm run build` passed.
  - Targeted tests passed:
    - `dist/test/unit/compile-bindings.test.js`
    - `dist/test/integration/production-spec-strict-binding-regression.test.js`
    - `dist/test/integration/fitl-production-data-compilation.test.js`
    - `dist/test/integration/texas-runtime-bootstrap.test.js`
  - `npm test` passed.
  - `npm run lint` passed.
