# ARCHGSD-015: Schema-Driven Binder Surface Rewriter Coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-015 (completed)
**Blocks**: Reliable macro hygiene as AST surface grows

## 0) Reassessed assumptions (current code/test reality)

What already exists:
- Binder path handling is centralized in `src/cnl/binder-surface-registry.ts` via `EFFECT_BINDER_SURFACES` and `NON_EFFECT_BINDER_REFERENCER_SURFACES`.
- Macro rewriting and binder-site collection already use this central registry (`expand-effect-macros`, `compile-effects`, `compile-operations`).
- Coverage tests already exist in `test/unit/binder-surface-registry.test.ts`, including a hard guard that fails when `EffectAST` introduces `*Bind` fields without registry updates.

What is still missing:
- Non-effect binder surfaces (`ref`/`query`/`condition`/aggregate shapes) are encoded with ad-hoc predicate functions, not a schema/contract-owned declarative surface contract.
- Guard coverage is asymmetrical: effects are enforced against AST drift, but non-effect discriminator surfaces are not explicitly contract-enforced.
- Existing test plan references include items that are now outdated/non-authoritative for this ticket (property fuzzing and Texas compile-path coupling).

Discrepancies from original ticket assumptions:
- The “migrate manual registry entries” step has already happened for engine call sites; migration target is now architectural hardening of how those entries are defined and validated.
- “No centralized coverage” is no longer true; the remaining risk is long-term drift between AST/schema discriminators and registry predicates.

## 1) Updated scope

Move binder-surface ownership to a declarative contract and enforce parity for both effect and non-effect surfaces.

Scope:
- Introduce a declarative binder surface contract (shared source of truth) for:
  - Effect binder declaration/referencer/sequential-scope paths.
  - Non-effect binder referencer surfaces keyed by discriminators (`ref`, `query`, `op`, structural aggregate).
- Refactor binder registry internals to consume the declarative contract instead of hardcoded predicate-only entries.
- Add hard tests that fail when binder-capable AST/query/ref discriminator surfaces drift without contract updates.
- Keep compiler/runtime behavior generic and game-agnostic (no game-specific branches/aliases).

Out of scope:
- Runtime behavior changes unrelated to binder path discovery/rewrite.
- Texas-specific compile regression requirements (covered by their own ticket suites).

## 2) Invariants that must pass

1. Every binder declaration/reference surface used by macro rewrite + collection is declared in one contract.
2. Effect and non-effect binder surfaces both fail fast under AST discriminator drift.
3. Macro expansion hygiene remains deterministic and non-game-specific.
4. No binder leakage or unbound-reference regressions caused by missing rewrite coverage.

## 3) Tests that must pass

1. Unit: binder surface contract covers all supported effect kinds.
2. Unit: non-effect binder surface contract includes all supported discriminator entries used for binder references.
3. Unit: hard guard fails when effect/non-effect binder-capable AST surfaces are introduced without contract updates.
4. Unit: binder rewrite still handles representative paths (`binding.name`, `aggregate.bind`, token refs, `assetField.row`, zone selector templates).
5. Regression: `npm run build`, relevant unit suite(s), and `npm run lint`.

## Outcome

- Completion date: 2026-02-16
- Actually changed:
  - Added a declarative binder surface contract in `src/cnl/binder-surface-contract.ts` and moved effect + non-effect binder metadata ownership there.
  - Refactored `src/cnl/binder-surface-registry.ts` to consume contract metadata instead of ad-hoc non-effect predicate definitions.
  - Added missing non-effect binder template rewrite coverage for `tokensInMapSpaces.spaceFilter.owner.chosen`.
  - Strengthened `test/unit/binder-surface-registry.test.ts` with:
    - contract parity checks for non-effect registry entries,
    - rewrite regression for `tokensInMapSpaces` owner chosen binding templates,
    - non-effect discriminator drift guard against `src/kernel/types-ast.ts`.
- Deviations from original plan:
  - Instead of deriving binder surfaces directly from Zod schema introspection, implemented a declarative contract module that serves as the single source of truth consumed by the registry. This keeps behavior explicit and testable while eliminating ad-hoc predicate drift.
- Verification results:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
