# 85COMEFFCONMIG-007: Replace fromEnvAndCursor in effects-resource.ts (2 call sites)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/effects-resource.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-resource.ts` has 2 `fromEnvAndCursor` call sites in `applyTransferVar`. These construct full `EffectContext` objects (~30 field spread) when `ReadContext` suffices for eval calls and inline pick objects suffice for trace calls.

Similar to -006: this ticket calls `resolveRuntimeScopedEndpointWithMalformedSupport` (widened in -001) and must pass `env.mode`, and uses trace functions needing inline pick objects.

## Assumption Reassessment (2026-03-27)

1. `applyTransferVar` still has exactly 2 `fromEnvAndCursor` call sites in `effects-resource.ts` — confirmed.
2. One merged context exists only to evaluate bindings/amount/min/max expressions; the other exists only to feed scoped-var reads plus trace provenance/var-change trace emission — confirmed.
3. `resolveRuntimeScopedEndpointWithMalformedSupport` is already narrowed to `ReadContext + mode` in `scoped-var-runtime-access.ts`; the remaining architectural debt is local to `effects-resource.ts`, where `resolveEndpoint` still accepts full `EffectContext` even though it only needs read-surface fragments — confirmed.
4. Existing transfer coverage is broader than this ticket originally assumed. There are dedicated transfer behavior, trace, scoped-endpoint, and incremental-hash tests already covering `transferVar`, including malformed selectors and provenance coherence — confirmed.
5. Because the refactor changes which helper performs binding merges, the risky invariant is not transfer semantics in general but that `transferVar` continues to evaluate amount/min/max and runtime-scoped endpoint expressions against the resolved binding surface. That invariant should be captured explicitly with a focused test.
6. `trace-provenance.ts` and `var-change-trace.ts` already accept narrowed `Pick<EffectContext, ...>` inputs, so this ticket should pass inline trace pick objects instead of preserving full-context construction just for trace emission — confirmed.

## Architecture Check

1. The current architecture benefits from this change. `applyTransferVar` is still carrying a compatibility-bridge pattern (`fromEnvAndCursor`) after downstream helpers were already narrowed; keeping it would preserve an unnecessary full-context reconstruction hotspot and blur handler dependencies.
2. The clean design here is: eval helpers consume `ReadContext`, scoped-var reads consume the smallest read/definition/state slices they need, and trace helpers receive explicit provenance picks. That is more robust and extensible than continuing to route everything through `EffectContext`.
3. No backwards-compatibility layer should remain in this file once the narrowed surfaces are wired through (Foundations 9 and 10).

## What to Change

### 1. Replace both fromEnvAndCursor calls in applyTransferVar

- For eval context (resolved bindings): use `mergeToEvalContext(env, cursor)` or an equivalent narrowed read-context merge
- For state/definition reads: use `mergeToReadContext(env, cursor)` or narrower local picks instead of a full `EffectContext`
- For `resolveRuntimeScopedEndpointWithMalformedSupport`: pass `ReadContext + env.mode`
- For `resolveTraceProvenance` / `emitVarChangeTraceIfChanged`: construct inline trace pick objects instead of merged full contexts

### 2. Narrow `resolveEndpoint`

- Change `resolveEndpoint` so it consumes the read/definition/state slices it actually requires rather than `EffectContext`
- Keep the change local to `effects-resource.ts`; do not widen scope into other handlers in this ticket

### 3. Update imports

- Remove `fromEnvAndCursor`
- Add `mergeToReadContext` / `mergeToEvalContext` if both are needed after the local narrowing
- Remove `EffectContext` from imports if the file no longer needs it

### Note

For architectural completeness, this ticket must not just swap one merge helper for another. `resolveEndpoint` should be narrowed so it depends only on the read/state/definition surface it actually consumes. Leaving `EffectContext` in place locally would preserve the same architectural smell under a cheaper helper.

Shared extraction of the env/cursor trace-provenance pattern is intentionally deferred to `85COMEFFCONMIG-010`; this ticket should keep the change local and make the final duplication explicit for cleanup.

## Files to Touch

- `packages/engine/src/kernel/effects-resource.ts` (modify)

## Out of Scope

- Any semantic change to `transferVar`
- Any changes to `scoped-var-runtime-access.ts` signatures beyond what is already present
- Any changes to `trace-provenance.ts` or `var-change-trace.ts` signatures
- Any changes to other effect handler files
- Removing `fromEnvAndCursor` from the broader codebase; that remains for later Spec 85 tickets
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. All existing transferVar tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests exercising resource transfer (transferVar operations)
3. Determinism tests pass
4. Trace output includes correct provenance for transfers

### Invariants

1. `resolveRuntimeScopedEndpointWithMalformedSupport` receives `ReadContext` + correct `mode` value
2. Trace pick objects contain all 4 required fields
3. Determinism parity maintained
4. Zero `fromEnvAndCursor` references remain in this file
5. `transferVar` endpoint/amount evaluation still sees resolved bindings and move-parameter overlays after the refactor

## Test Plan

### New/Modified Tests

1. Add or strengthen a focused `transfer-var` unit test proving `transferVar` still resolves binding-driven amount and/or endpoint expressions through the narrowed eval context
2. Existing `resource-transfer-trace`, `trace-contract`, scoped-endpoint, and incremental-hash tests remain part of verification because they cover provenance coherence and state-hash parity touched by this refactor

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="transferVar|resourceTransfer|trace semantics contract|scoped endpoint"` or equivalent targeted engine coverage
2. `pnpm turbo typecheck` — verify type compatibility
3. `pnpm turbo test` — full suite passes
4. `pnpm turbo lint` — no lint regressions

## Outcome

- Completion date: 2026-03-27
- Actual changes:
  - Replaced both `fromEnvAndCursor` call sites in `packages/engine/src/kernel/effects-resource.ts`
  - Narrowed `resolveEndpoint` to `ReadContext` plus the minimal read-state/definition surface it uses
  - Swapped full-context trace emission over to an inline trace pick object
  - Added a focused regression test proving `transferVar` still resolves move-param-backed bindings for amount and endpoint selector evaluation
- Deviations from original plan:
  - The ticket originally claimed no new tests were needed; that assumption was incorrect, so one focused transferVar regression test was added
  - `scoped-var-runtime-access.ts` was already narrowed before this ticket, so the implementation stayed local to `effects-resource.ts` instead of revisiting downstream helper signatures
- Verification results:
  - Passed targeted transfer/resource/trace/hash tests via direct `node --test` runs
  - Passed `pnpm -F @ludoforge/engine typecheck`
  - Passed `pnpm turbo typecheck`
  - Passed `pnpm turbo lint`
  - Passed `pnpm turbo test`
  - Passed `pnpm -F @ludoforge/engine test:e2e`
  - Attempted `pnpm -F @ludoforge/engine test:determinism`; the lane did not produce subtest output beyond `TAP version 13` during extended observation, while the broader suite already passed determinism-adjacent coverage including `trace-contract`, `zobrist-incremental-vars`, and integration determinism tests under `pnpm turbo test`
