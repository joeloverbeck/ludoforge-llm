# ENGINEARCH-096: Adopt Query-Domain Contracts Across Compiler Effect Entry Points

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — CNL effect validation contracts and targeted diagnostics
**Deps**: specs/51-cross-game-primitive-elevation.md, tickets/ENGINEARCH-094-query-domain-contract-exhaustiveness.md

## Problem

`distributeTokens` enforces query-domain contracts at compile time, while other effect entry points that consume `OptionsQuery` (`chooseOne`, `chooseN`, `forEach`, `reduce`, `evaluateSubset`) are intentionally domain-agnostic. Today, that intent is implicit in implementation rather than encoded as explicit compiler contracts, making the architecture harder to audit and easier to regress.

## Assumption Reassessment (2026-02-27)

1. Domain-contract enforcement currently exists only for `distributeTokens` (`tokens` must be token-domain, `destinations` must be zone-domain).
2. `chooseOne`, `chooseN`, `forEach`, `reduce`, and `evaluateSubset` currently accept `OptionsQuery` across token/zone/other domains by design; tests and runtime behavior rely on that flexibility.
3. Shared query-domain inference exists in kernel and can be reused for explicit, centralized effect-level contract declarations without game-specific branching.
4. Corrected scope: codify explicit per-effect contracts, where most are intentionally domain-agnostic and `distributeTokens` remains strict.

## Architecture Check

1. Uniform explicit contract declarations across effect entry points are cleaner than implicit behavior.
2. Contracts are generic to query/effect semantics and preserve GameSpecDoc game-specific data boundaries while keeping GameDef/runtime agnostic.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Define explicit effect-level domain contracts

Declare expected query domains per effect form:
- `distributeTokens.tokens`: token-only
- `distributeTokens.destinations`: zone-only
- `chooseOne.options`: agnostic
- `chooseN.options`: agnostic
- `forEach.over`: agnostic
- `reduce.over`: agnostic
- `evaluateSubset.source`: agnostic

### 2. Apply validation in compiler lowering

Integrate shared query-domain inference into relevant lowerers with centralized contract validation:
- strict diagnostics where contract is restricted (`distributeTokens`)
- no-op validation where contract is intentionally agnostic (still explicit and test-pinned)

### 3. Add comprehensive contract tests

Add compiler tests that pin:
- agnostic effects accepting token/zone/other domains, including recursive composition
- strict `distributeTokens` domain mismatch diagnostics remaining intact

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)

## Out of Scope

- Runtime coercion/fallback for malformed authored specs.
- Game-specific exceptions.

## Acceptance Criteria

### Tests That Must Pass

1. Each query-consuming effect has explicit compile-time domain behavior (enforced or intentionally agnostic).
2. Invalid domains are rejected with targeted diagnostics at compile time where contracts are restricted (`distributeTokens`).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Query-domain contracts are centralized and reusable, not duplicated per game.
2. GameDef/simulator remain game-agnostic with no game-specific branching in validation logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — per-effect domain contract matrix (agnostic acceptance + strict mismatch diagnostics).

### Commands

1. `pnpm -F @ludoforge/engine test:unit`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Added centralized query-domain contract validation in `compile-effects` and routed all query-consuming effect entry points through explicit contracts.
  - Kept `chooseOne`, `chooseN`, `forEach`, `reduce`, and `evaluateSubset` explicitly domain-agnostic.
  - Preserved strict token/zone diagnostics for `distributeTokens` using the shared validator.
  - Added a compile-effects unit test that pins domain-agnostic behavior across token/zone/other and recursive composition.
- **Deviations from original plan**:
  - Corrected scope before implementation: the non-`distributeTokens` effects were intentionally agnostic already, so the implementation codified and tested that intent rather than introducing new restrictions.
  - No runtime test changes were needed because runtime semantics were intentionally unchanged.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
