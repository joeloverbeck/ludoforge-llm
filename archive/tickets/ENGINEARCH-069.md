# ENGINEARCH-069: Make test EffectContext helper mode-explicit and remove implicit execution defaults

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — test architecture contract hardening for EffectContext construction
**Deps**: none

## Problem

`packages/engine/test/helpers/effect-context-test-helpers.ts` currently accepts `mode?: InterpreterMode` and defaults to `'execution'`. This reintroduces implicit mode semantics in test infrastructure immediately after hardening the runtime contract to require explicit mode. The mismatch weakens test clarity and can hide accidental mode assumptions.

## Assumption Reassessment (2026-02-26)

1. `EffectContext.mode` is required in kernel runtime contracts.
2. The shared test helper currently treats `mode` as optional and silently defaults to `'execution'`.
3. Current helper callsites are broader than originally implied (unit + integration + property tests), but most already pass explicit mode intent (`mode: 'execution'` plus targeted discovery overrides).
4. There is at least one additional local fallback (`mode: overrides?.mode ?? 'execution'`) in test wrappers that bypasses the intended explicit-mode discipline.
5. **Mismatch + correction**: remove implicit mode fallback semantics from shared helper APIs and from any helper-local wrapper paths in scope.

## Architecture Check

1. Explicit test-context mode constructors are cleaner than optional helper arguments because they encode intent in the callsite (`execution` vs `discovery`) and prevent accidental fallback behavior.
2. This remains game-agnostic infrastructure work and does not encode any GameSpecDoc/GameDef-specific behavior.
3. No backwards-compatibility aliasing/shims should be introduced.

## What to Change

### 1. Replace optional-mode helper API with explicit constructors

In `effect-context-test-helpers.ts`, replace `makeEffectContext({ ..., mode?: ... })` fallback semantics with explicit mode-specific constructors (for example `makeExecutionEffectContext(...)` and `makeDiscoveryEffectContext(...)`) or an equivalent required-mode API with no defaults.

### 2. Update migrated tests to use explicit helper API

Update tests currently using the helper so mode intent remains explicit at callsites and no local fallback wrappers (`?? 'execution'`) remain in scope.

### 3. Keep helper scope generic and kernel-oriented

The helper should stay a generic EffectContext test utility without game-specific assumptions.

## Files to Touch

- `packages/engine/test/helpers/effect-context-test-helpers.ts` (modify)
- Tests currently importing helper (modify as needed)
- `packages/engine/test/unit/effects-token-move-draw.test.ts` (remove local implicit fallback in helper wrapper)

## Out of Scope

- Runtime/kernel production behavior changes
- GameSpecDoc/GameDef schema or compilation behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Helper API no longer allows implicit mode fallback.
2. All helper callsites compile with explicit mode intent.
3. No local test wrapper in scope silently defaults mode via `?? 'execution'`.
4. `pnpm -F @ludoforge/engine build`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

### Invariants

1. Test infrastructure reflects runtime explicit-mode contract.
2. No implicit execution-mode defaults remain in helper APIs or in modified helper-local wrappers.

## Test Plan

### New/Modified Tests

1. Existing tests that use shared EffectContext helper (modified) — update helper usage to explicit mode APIs.
2. Add/modify helper-focused assertions to ensure explicit constructors preserve selected mode and no fallback path remains in modified wrappers.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Reassessed ticket assumptions against current code/test reality and corrected scope before implementation.
  - Removed implicit defaulting from shared test helper API by making `mode` mandatory in `makeEffectContext`.
  - Removed helper-local fallback (`mode: overrides?.mode ?? 'execution'`) in draw trace tests.
  - Added helper-focused unit coverage validating explicit mode construction paths.
  - Per follow-up architecture hardening, introduced explicit `makeExecutionEffectContext` / `makeDiscoveryEffectContext` constructors and made the generic `makeEffectContext` builder internal to the helper module.
  - Replaced broad `Partial<EffectContext>` local wrapper overrides with `Omit<Partial<EffectContext>, 'mode'>`-style override contracts and explicit discovery-context wrappers where discovery behavior is tested.
- Deviations from original plan:
  - Chose the ticket-allowed required-mode API shape (`makeEffectContext` with required `mode`) rather than introducing new mode-specific constructor names, minimizing churn while removing fallback semantics.
  - Ticket scope was updated to reflect that most existing callsites already specify mode explicitly; primary risk was latent fallback defaults.
  - Follow-up implementation intentionally expanded scope to include test-wrapper type-contract tightening beyond initial minimum acceptance criteria, because this further reduces implicit mode semantics and improves long-term test architecture clarity.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed (295/295).
  - `pnpm -F @ludoforge/engine lint` passed.
