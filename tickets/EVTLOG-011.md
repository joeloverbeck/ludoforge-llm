# EVTLOG-011: Enforce Strict Scope Contracts in Event-Log Scope Rendering

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: none

## Problem

Scope rendering was centralized, but the shared formatter currently accepts `scope: undefined` for all contexts and implicitly renders `Global` for endpoint context fallback. This masks invalid endpoint input and weakens architecture invariants. Endpoint labels and variable-change prefixes have different contract strictness and should be modeled explicitly.

## Assumption Reassessment (2026-02-25)

1. Runner event-log translation now routes variable-change scope prefixes and resource-transfer endpoint labels through shared `formatScopeDisplay`.
2. Trigger `varChanged` can legitimately have `scope` omitted, so prefix rendering must continue supporting optional scope.
3. Resource-transfer endpoints in runtime contracts are required to use explicit scope (`global | perPlayer | zone`), so endpoint rendering should not silently coerce `undefined` to `Global`.
4. **Mismatch + correction**: Current helper accepts one broad input contract for both prefix and endpoint contexts, which allows endpoint misuse and hides invariant breaches.

## Architecture Check

1. Context-specific contracts (or a discriminated union) are cleaner and more robust than a permissive shared input shape because invalid states become unrepresentable at compile time.
2. Failing fast on impossible endpoint scope states prevents silent log corruption and keeps architecture honest.
3. This remains runner presentation logic and preserves the boundary: `GameSpecDoc` holds game-specific data, `GameDef`/runtime/simulator remain game-agnostic.
4. No backwards-compatibility aliases/shims: remove permissive fallback behavior and update callers/tests to strict contracts.

## What to Change

### 1. Make scope-rendering contracts context-strict

Refactor `formatScopeDisplay` so endpoint context requires explicit non-optional scope, while prefix context can still accept optional scope:
- Option A: split into two helpers (`formatScopePrefix`, `formatScopeEndpointLabel`) with strict signatures.
- Option B: keep one helper with discriminated-union input (`context: 'endpoint'` requires scope).

### 2. Enforce endpoint invariants explicitly

Implement exhaustive endpoint scope handling (`global`, `perPlayer`, `zone`) and fail fast on impossible states (throw/assert-never), instead of defaulting to `Global` for undefined/unknown input.

### 3. Reduce repeated scope resolver wiring at call sites

In `translate-effect-trace.ts`, avoid duplicating resolver closure construction for each call (small local formatter adapter/factory), so future scope-aware messages share the same call surface.

## Files to Touch

- `packages/runner/src/model/model-utils.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/test/model/model-utils.test.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)

## Out of Scope

- Engine/kernel event contracts or trigger payload shape changes
- UI styling, i18n, or localization framework work
- Game-specific display branching in runner translation

## Acceptance Criteria

### Tests That Must Pass

1. Endpoint scope formatter no longer accepts/normalizes undefined scope into `Global`.
2. Prefix scope formatter still supports optional scope for trigger `varChanged` and preserves existing visible semantics.
3. Resource-transfer and variable-change scope messages remain consistent for valid inputs (`global`, `perPlayer`, `zone`).
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Endpoint scope rendering has strict compile-time/runtime invariants; invalid states are not silently coerced.
2. Scope rendering semantics remain centralized in one translation boundary with no duplicated scope branching.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/model-utils.test.ts` - add strict contract tests proving endpoint context requires explicit scope and rejects impossible states.
2. `packages/runner/test/model/translate-effect-trace.test.ts` - update/add assertions to ensure resource-transfer endpoints render correctly under strict contracts and trigger prefix behavior remains unchanged.

### Commands

1. `pnpm -F @ludoforge/runner test -- model-utils translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
