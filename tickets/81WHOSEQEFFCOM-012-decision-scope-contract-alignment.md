# 81WHOSEQEFFCOM-012: Align public decisionScope contract across interpreted and compiled effects

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — effect-dispatch.ts, phase-lifecycle.ts, effect-compiler tests, runtime effect tests
**Deps**: archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-009-lifecycle-choice-effects.md, tickets/81WHOSEQEFFCOM-010-cleanup-delete-fallback-path.md, tickets/81WHOSEQEFFCOM-011-delegate-leaf-wrapper-consolidation.md

## Problem

The engine currently exposes two different public contracts for `decisionScope`.

- Interpreted execution via `applyEffect` / `applyEffects` initializes and threads `decisionScope` internally, but drops it from the returned `EffectResult` on successful completion.
- Compiled lifecycle execution threads and can return `decisionScope` in its public result contract.

That asymmetry is not architectural noise only. It leaks into tests and verification behavior, where parity assertions can only compare `decisionScope` unconditionally in some cases and must special-case others. Per Foundations 9 and 10, this should be one clean contract, not two subtly different ones.

## Assumption Reassessment (2026-03-25)

1. `applyEffect` and `applyEffects` both normalize `decisionScope` on entry, execute through budget-aware runtime helpers, and then omit `decisionScope` from the final returned object unless the caller inspects lower-level helpers directly.
2. Lower-level runtime helpers already treat `decisionScope` as first-class execution state. `applyEffectsWithBudgetState` and compiled composition both preserve and advance it throughout effect execution.
3. Compiled lifecycle verification in `phase-lifecycle.ts` currently compares `decisionScope` only when either side returns a `pendingChoice`. That special-case exists because the interpreted public wrapper suppresses successful-completion scopes.
4. Ticket 010 owns fallback deletion and lifecycle coverage cleanup, not runtime result-contract normalization.
5. Ticket 011 owns delegate-wrapper consolidation, not public `EffectResult` semantics.
6. No active ticket currently owns removing this asymmetry, so leaving it untracked would preserve a known contract mismatch in core kernel execution.

## Architecture Check

1. The clean architecture is to expose one public `EffectResult` contract for both interpreted and compiled execution. The interpreter should stop hiding `decisionScope` that it already computes and threads internally.
2. Returning `decisionScope` consistently is cleaner than teaching compiled code to discard it. It removes information loss instead of spreading it, and it keeps runtime state explicit and deterministic.
3. This remains fully game-agnostic and aligns with Foundation 1: it is kernel execution plumbing, not game logic.
4. This is not a compatibility shim. It is a direct contract cleanup in current code, with all consumers/tests updated in one pass per Foundation 9.
5. After alignment, verification code should compare `decisionScope` unconditionally, not through pending-choice-specific branching.

## What to Change

### 1. Normalize public runtime wrappers

In `effect-dispatch.ts`:

- Update `applyEffect` to include `decisionScope` in its returned `EffectResult` using the same defaulting semantics already used internally.
- Update `applyEffects` to include `decisionScope` in its returned `EffectResult` using the same defaulting semantics already used internally.
- Keep `pendingChoice`, bindings, and emitted-events behavior unchanged unless the contract cleanup requires matching normalization logic.

### 2. Remove verification special-casing

In `phase-lifecycle.ts`:

- Remove the current conditional that only compares `decisionScope` when a `pendingChoice` is present.
- Compare `decisionScope` unconditionally during compiled-vs-interpreted lifecycle verification.
- Keep mismatch reporting explicit through `CompiledEffectVerificationError`.

### 3. Tighten runtime and compiler parity tests

Add or update tests so the contract is explicit:

- interpreted `applyEffect` returns advanced `decisionScope` after successful completion
- interpreted `applyEffects` returns advanced `decisionScope` after successful completion
- compiled and interpreted lifecycle results compare `decisionScope` without pending-choice special-casing
- successful `chooseOne` / `chooseN` parity tests can assert public `decisionScope` equivalence directly

## Files to Touch

- `packages/engine/src/kernel/effect-dispatch.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/test/unit/effects-runtime.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify)
- `packages/engine/test/integration/compiled-effects-verification.test.ts` (modify if needed)

## Out of Scope

- Delegate-wrapper consolidation internals (ticket 011)
- Fallback-path deletion and 100% lifecycle compilation cleanup (ticket 010)
- New choice semantics or lifecycle auto-resolution behavior
- Game-specific logic or spec/schema changes

## Acceptance Criteria

### Tests That Must Pass

1. `applyEffect` returns `decisionScope` after a successful effect that advances it.
2. `applyEffects` returns `decisionScope` after a successful sequence that advances it.
3. Compiled lifecycle verification compares `decisionScope` unconditionally and passes on existing parity scenarios.
4. No compiler/runtime parity test needs to omit `decisionScope` assertions solely because the interpreted wrapper suppresses it.
5. Existing suite: `pnpm -F @ludoforge/engine test`
6. Existing suite: `pnpm turbo typecheck`
7. Existing suite: `pnpm turbo lint`

### Invariants

1. Interpreted and compiled effect execution expose the same public `decisionScope` contract.
2. `decisionScope` remains deterministic execution state, not hidden interpreter-only internals.
3. No alias path, compatibility flag, or dual-result contract is introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-runtime.test.ts` — add direct assertions that successful interpreted execution returns the advanced `decisionScope`.
2. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — restore unconditional public parity assertions for sequences that previously had to skip `decisionScope`.
3. `packages/engine/test/integration/compiled-effects-verification.test.ts` — prove compiled verification still passes once `decisionScope` is compared unconditionally.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-runtime.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/integration/compiled-effects-verification.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
