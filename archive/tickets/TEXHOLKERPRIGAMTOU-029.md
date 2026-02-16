# TEXHOLKERPRIGAMTOU-029: Definite-Binding Static Guarantees (Compile-Time Dataflow)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-025, TEXHOLKERPRIGAMTOU-026, TEXHOLKERPRIGAMTOU-027
**Blocks**: TEXHOLKERPRIGAMTOU-030, TEXHOLKERPRIGAMTOU-031

## 0) Reassessed assumptions (2026-02-16)

1. Current compiler behavior is not path-safe for `if`: binders introduced in `then` can leak into post-`if` scope even without `else` (see `test/unit/compile-bindings.test.ts`, test case "treats if branch binders as sequentially visible to following effects").
2. Binder surface metadata for control-flow/exporters already exists centrally in `src/cnl/binder-surface-registry.ts`; this ticket should evolve it only where semantics are incorrect or incomplete, not reintroduce parallel metadata systems.
3. Existing diagnostics already provide deterministic unbound-binding reporting via `CNL_COMPILER_BINDING_UNBOUND` with ranked alternatives. The gap is path-safety of scope propagation, not base typo detection.
4. Stage carry-over semantics in `src/cnl/compile-operations.ts` use `collectSequentialBindings`; therefore, `if` merge guarantees must also be reflected in sequential-binding collection so stage-level binding visibility matches intra-stage rules.
5. Scope of this ticket is static guarantees for compile-time knowable binding visibility. Runtime-only bindings injected by move payloads remain runtime concerns.

## 1) What needs to change / be added

1. Implement definite-binding dataflow in compiler lowering (`src/cnl/compile-effects.ts`) so references are accepted only when guaranteed across all reachable paths at use-site.
2. Introduce explicit branch merge semantics for `if`:
- post-`if` guaranteed bindings are branch intersection (`then ∩ else`)
- missing `else` is an implicit fallthrough path with no branch-local guarantees
- remove existing behavior/tests that rely on leaking `then`-only binders.
3. Align stage carry-over with the same guarantees by updating sequential binding extraction (`src/cnl/binder-surface-registry.ts`) for `if` merge cases.
4. Keep exporter rules conservative and deterministic; reuse existing centralized binder-surface registry and only adjust entries/logic where guarantees are overstated.
5. Preserve game-agnostic compiler architecture; no game-specific branches.

## 2) Invariants that should pass

1. Any binding reference accepted by compiler is statically guaranteed at use-site across all reachable compile-time control-flow paths.
2. Branch-local binders are not visible after `if` unless present in every merged path.
3. Stage carry-over bindings obey the same guarantee contract as intra-stage sequential lowering.
4. Diagnostic ordering/content remain deterministic for equivalent docs.
5. No game-specific exceptions exist in binding-liveness logic.

## 3) Tests that should pass

1. Unit: `if` merge semantics:
- binder only in `then` -> compile error on post-`if` reference
- binder in both branches -> compile success
- no `else` + branch binder -> compile error on post-`if` reference.
2. Unit: sequential binding collection for `if`:
- `then`-only binders are not exported
- intersection binders (`then` and `else`) are exported deterministically.
3. Unit: pipeline stage carry-over respects `if` merge guarantees (positive + negative coverage).
4. Unit/Integration: malformed specs that are statically knowable as conditionally unbound fail at compile with `CNL_COMPILER_BINDING_UNBOUND` diagnostics.
5. Regression: `npm run build`, relevant binding/compiler unit tests, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16.
- What changed:
  - Implemented definite-binding branch merge in `src/cnl/compile-effects.ts` so post-`if` bindings are only exported when guaranteed by all reachable paths.
  - Implemented guarded binding refinement in `src/cnl/compile-effects.ts` so then-only bindings can be used inside later `if` branches guarded by the same condition fingerprint without leaking globally.
  - Updated sequential binding extraction in `src/cnl/binder-surface-registry.ts` so `if` exports only branch-intersection bindings, aligning stage carry-over semantics.
  - Updated/added tests for `if` leak prevention and intersection guarantees in:
    - `test/unit/compile-bindings.test.ts`
    - `test/unit/binder-surface-registry.test.ts`
    - `test/unit/compile-top-level.test.ts`
- Deviations from original plan:
  - Did not introduce a new diagnostic code for “conditional unbound” references; reused deterministic `CNL_COMPILER_BINDING_UNBOUND` because diagnostic infrastructure already satisfied deterministic typo/unbound reporting.
  - Narrowed scope from broad “new metadata model” to extending existing centralized binder-surface registry where semantics were incomplete.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
