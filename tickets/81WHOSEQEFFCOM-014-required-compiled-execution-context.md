# 81WHOSEQEFFCOM-014: Make compiled execution context requirements explicit

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiled effect context/types, composeFragments/codegen plumbing, compiled parity tests
**Deps**: specs/81-whole-sequence-effect-compilation.md, tickets/81WHOSEQEFFCOM-013-normalized-effect-result-contract.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-012-decision-scope-contract-alignment.md

## Problem

The compiled lifecycle path still encodes core execution invariants as optional context fields.

- `CompiledEffectContext` makes `decisionScope`, `effectBudget`, `tracker`, `mode`, and `decisionAuthority` optional.
- `composeFragments` and codegen repeatedly repair that optionality with `?? emptyScope()` and ad hoc context spreading.
- That leaves the compiled execution path structurally looser than the interpreted path, even though compiled lifecycle execution now depends on the same deterministic invariants.

This is functional today, but it is not the clean long-term architecture. Per Foundations 5, 9, and 10, compiled execution should consume a context whose required execution invariants are explicit rather than inferred.

## Assumption Reassessment (2026-03-25)

1. `composeFragments` currently normalizes missing compiled context fields at sequence entry, then threads a stronger effective context internally.
2. `effect-compiler-codegen.ts` still contains many `ctx.decisionScope ?? emptyScope()` and similar fallback patterns because the public compiled context type allows missing execution invariants.
3. Lifecycle compiled execution is the only supported compiled path today, and it already has enough information to provide required execution invariants directly.
4. Ticket 013 should land first so the result contract is explicit before tightening the compiled context contract.
5. The correct follow-up is not to add more fallback helpers. The correct follow-up is to define a required compiled execution context for actual execution and restrict optionality to construction/adapter boundaries only.

## Architecture Check

1. The clean architecture is to separate:
   - a loose adapter/input shape used at construction edges if needed
   - a required compiled execution context used by `composeFragments` and compiled fragment execution
2. This is more robust than the current architecture because it eliminates repeated local repairs of invariant fields and makes compiled execution semantics explicit in types.
3. This preserves engine agnosticism. It changes only generic kernel/compiler plumbing, not any game-specific logic or spec contract.
4. No backwards-compatibility aliasing is needed. Existing compiled execution call sites should be migrated directly to the stricter context.

## What to Change

### 1. Introduce a required compiled execution context

In `effect-compiler-types.ts` and related execution entry points:

- Define a compiled execution context type with required `decisionScope`, `effectBudget`, `tracker`, and other runtime invariants that compiled fragments rely on.
- Limit optionality to outer adapter/builder shapes if any are still necessary.

### 2. Remove local fallback repair logic from compiled execution

In `effect-compiler.ts` and `effect-compiler-codegen.ts`:

- Update `composeFragments` to construct the required compiled execution context once at the boundary.
- Remove repeated `?? emptyScope()` and equivalent repairs inside compiled fragment execution where the stricter type makes them impossible.
- Keep deterministic behavior identical.

### 3. Tighten compiled parity and contract tests

- Add or update tests that prove compiled execution always starts from an explicit required scope/context and produces identical results to interpreted execution.
- Add focused tests that fail if future compiled code tries to rely on missing context invariants again.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-types.ts` (modify)
- `packages/engine/src/kernel/effect-compiler.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify if needed)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify)
- `packages/engine/test/integration/compiled-effects-verification.test.ts` (modify if needed)

## Out of Scope

- Broad runtime `EffectContext` redesign outside compiled execution
- New lifecycle compilation features or additional effect coverage work
- Any game-specific authoring/model changes

## Acceptance Criteria

### Tests That Must Pass

1. Compiled execution context types require the runtime invariants that compiled fragments actually depend on.
2. `composeFragments` performs invariant construction once at the boundary rather than repairing missing scope throughout execution.
3. Compiled-vs-interpreted parity still passes unchanged, including `decisionScope`.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm turbo typecheck`
6. Existing suite: `pnpm turbo lint`

### Invariants

1. Compiled execution cannot observe a missing `decisionScope` or other required runtime invariant once execution begins.
2. Sequence-entry normalization happens once at the boundary, not repeatedly inside compiled fragment bodies.
3. No compatibility shims or parallel compiled-context contracts remain after migration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — prove compiled execution constructs and threads the required context once and still matches interpreted parity.
2. `packages/engine/test/integration/compiled-effects-verification.test.ts` — extend only if needed to protect the stricter compiled execution context through lifecycle verification.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/integration/compiled-effects-verification.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
