# TEXHOLKERPRIGAMTOU-023: Canonical Binder Hygiene Walker for Macro Expansion

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-018
**Blocks**: none

## Reassessed Assumptions (2026-02-16)

1. A central effect-kind binder surface registry already exists in `src/cnl/binder-surface-registry.ts` and is wired to `SUPPORTED_EFFECT_KINDS`.
2. Guardrail tests already exist and fail when `EffectAST` binder-capable effect kinds diverge from registry ownership (`test/unit/binder-surface-registry.test.ts`).
3. Macro hygiene leak and unresolved-template diagnostics already exist and are covered by deterministic/property tests (`test/unit/expand-effect-macros.test.ts`, `test/unit/property/macro-hygiene.property.test.ts`).
4. The remaining architecture gap is not declaration rewriting for effect bodies; it is duplicated/manual binder-reference rewrite + scan logic in `src/cnl/expand-effect-macros.ts` for non-effect AST shapes (`ref`/`query`/`op`/`aggregate` forms).

## Corrected Scope

1. Keep existing effect binder surface ownership intact; do not re-implement it.
2. Introduce one canonical registry-backed walker path for binder-bearing references across:
- effect-node referencer paths
- non-effect AST referencer paths used during macro hygiene rewrite and leak/template integrity scanning
3. Remove duplicated/manual rewrite branches in `expand-effect-macros.ts` that duplicate binder-bearing surface knowledge.
4. Keep macro expansion game-agnostic; no game-specific logic.
5. Preserve strict failure semantics (no backward-compat aliases): unresolved templates and non-exported local binder leaks remain hard errors.

## Invariants That Must Hold

1. Binder rename rewrite is deterministic and complete across declared binders and known referencer surfaces.
2. No non-exported local binder leaks after macro expansion.
3. No unresolved local binding templates survive expansion.
4. Adding binder-bearing effect kinds still requires explicit central registry updates (guardrail remains enforced).
5. Macro expansion remains game-agnostic and data-driven.

## Implementation Plan

1. Extend binder-surface registry support so non-effect binder referencer surfaces are declared and reused (single source of truth for known surfaces).
2. Refactor `expand-effect-macros.ts` to use canonical walker helpers for rewrite/integrity scanning.
3. Keep behavior identical except where previous manual drift risks are removed.

## Tests Required

1. `test/unit/binder-surface-registry.test.ts`
- strengthen with coverage for non-effect referencer rewrite/collection via the canonical helpers.
2. `test/unit/expand-effect-macros.test.ts`
- existing hygiene regression cases must continue to pass.
3. `test/unit/property/macro-hygiene.property.test.ts`
- determinism + leak/template invariants must continue to pass.
4. Regression gates:
- `npm run build`
- `npm test`
- `npm run lint`

## Outcome

- Completion date: 2026-02-16
- What was changed:
- Reassessed and corrected ticket assumptions/scope to reflect current code reality before implementation.
- Added canonical non-effect binder referencer surface ownership in `src/cnl/binder-surface-registry.ts` and exposed shared rewrite/collection helpers.
- Refactored `src/cnl/expand-effect-macros.ts` to use registry-backed referencer rewriting/integrity-site collection instead of duplicated manual shape branches.
- Strengthened `test/unit/binder-surface-registry.test.ts` with explicit non-effect registry helper coverage.
- Follow-up idealization: unified declared-binder and referencer rewrite/scan paths under one declarative recursive binder-surface walker contract (`rewriteBinderSurfaceStringsInNode` + `collectBinderSurfaceStringSites`) and migrated macro expansion to that single contract.
- Deviations from original plan:
- The existing effect binder surface registry and guardrails were already in place, so work focused on eliminating residual manual non-effect rewrite/scan drift instead of redoing effect-surface ownership.
- Verification results:
- `npm run build` passed.
- `npm test` passed.
- `npm run lint` passed.
