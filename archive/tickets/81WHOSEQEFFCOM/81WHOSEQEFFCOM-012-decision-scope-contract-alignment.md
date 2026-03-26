# 81WHOSEQEFFCOM-012: Align public decisionScope contract across interpreted and compiled effects

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — effect-dispatch.ts, phase-lifecycle.ts, runtime effect tests, compiler parity tests
**Deps**: archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-009-lifecycle-choice-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-010-cleanup-delete-fallback-path.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-011-delegate-leaf-wrapper-consolidation.md

## Problem

The engine currently exposes two different public contracts for `decisionScope`.

- Interpreted execution via `applyEffect` / `applyEffects` initializes and threads `decisionScope` internally, but drops it from the returned `EffectResult` on successful completion.
- Compiled lifecycle execution threads and can return `decisionScope` in its public result contract.

That asymmetry is not architectural noise only. It leaks into tests and verification behavior, where parity assertions can only compare `decisionScope` unconditionally in some cases and must special-case others. Per Foundations 9 and 10, this should be one clean contract, not two subtly different ones.

## Assumption Reassessment (2026-03-25)

1. `applyEffect` and `applyEffects` both normalize `decisionScope` on entry through wrapper/context defaulting, execute through budget-aware runtime helpers, and then omit `decisionScope` from the final returned object when execution completes without a `pendingChoice`.
2. Lower-level runtime helpers already treat `decisionScope` as first-class execution state. `applyEffectsWithBudgetState` and compiled composition both preserve and advance it throughout effect execution.
3. Compiled lifecycle verification in `phase-lifecycle.ts` currently compares `decisionScope` only inside the branch that is already gated on either side returning a `pendingChoice`. That special-case exists because the interpreted public wrapper suppresses successful-completion scopes, not because compiled execution lacks scope data.
4. Ticket 010 owns fallback deletion and lifecycle coverage cleanup, not runtime result-contract normalization.
5. Ticket 011 owns delegate-wrapper consolidation, not public `EffectResult` semantics.
6. No active ticket currently owns removing this asymmetry, so leaving it untracked would preserve a known contract mismatch in core kernel execution.
7. Existing unit parity coverage is partially ahead of the ticket text: the shared `compareResults` helper in `packages/engine/test/unit/kernel/effect-compiler.test.ts` already compares `decisionScope`, but some choose-path tests bypass that helper and therefore still omit direct scope parity assertions.
8. `packages/engine/test/integration/compiled-effects-verification.test.ts` currently verifies compiled-vs-interpreted lifecycle execution at a higher level, but it does not explicitly prove the successful-completion `decisionScope` contract mismatch discussed here. Updating that file is optional unless a direct lifecycle regression test is needed.

## Architecture Check

1. The clean architecture is to expose one public `EffectResult` contract for both interpreted and compiled execution. The interpreter should stop hiding `decisionScope` that it already computes and threads internally.
2. Returning `decisionScope` consistently is cleaner than teaching compiled code to discard it. It removes information loss instead of spreading it, and it keeps runtime state explicit and deterministic.
3. This remains fully game-agnostic and aligns with Foundation 1: it is kernel execution plumbing, not game logic.
4. This is not a compatibility shim. It is a direct contract cleanup in current code, with all consumers/tests updated in one pass per Foundation 9.
5. After alignment, verification code should compare `decisionScope` unconditionally, not through pending-choice-specific branching.
6. The ideal long-term architecture would make post-normalization execution results expose a single always-present `decisionScope` at the type level as well, but that broader internal type cleanup is intentionally out of scope for this ticket. This ticket should first align the public contract and parity checks without widening into a larger result-type refactor.

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
- successful `chooseOne` parity tests that currently bypass the shared parity helper assert public `decisionScope` equivalence directly
- add a `chooseN` runtime or compiler parity assertion only if an existing focused test path already exercises successful public-scope advancement without forcing unrelated setup

## Files to Touch

- `packages/engine/src/kernel/effect-dispatch.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/test/unit/effects-runtime.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify)
- `packages/engine/test/integration/compiled-effects-verification.test.ts` (modify only if a direct lifecycle verification regression test is needed)

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
4. No focused compiler/runtime parity test needs to omit `decisionScope` assertions solely because the interpreted wrapper suppresses it.
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
2. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — make the choose-path parity tests assert `decisionScope` directly instead of relying on partial comparisons.
3. `packages/engine/test/integration/compiled-effects-verification.test.ts` — only extend if unit coverage proves insufficient to protect the unconditional lifecycle parity check.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-runtime.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/integration/compiled-effects-verification.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-25
- What actually changed:
  - corrected the ticket assumptions before implementation to match the current code and test reality
  - updated `applyEffect` and `applyEffects` to return normalized public `decisionScope` on successful completion
  - updated lifecycle compiled-vs-interpreted verification to compare `decisionScope` unconditionally
  - strengthened focused runtime/compiler tests so successful choose-path parity now asserts public `decisionScope`
- Deviations from original plan:
  - no change was needed in `packages/engine/test/integration/compiled-effects-verification.test.ts`; focused unit/runtime coverage was sufficient once the lifecycle verification branch was fixed
  - no broader internal `EffectResult` type refactor was attempted; that remains a larger architectural follow-up, not part of this ticket
- Verification results:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/effects-runtime.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/integration/compiled-effects-verification.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
