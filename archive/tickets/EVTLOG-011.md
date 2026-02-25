# EVTLOG-011: Enforce Strict Scope Contracts in Event-Log Scope Rendering

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: none

## Problem

Scope rendering was centralized, but the shared formatter currently accepts `scope: undefined` for all contexts and implicitly renders `Global` for endpoint context fallback. This masks invalid endpoint input and weakens architecture invariants. Endpoint labels and variable-change prefixes have different contract strictness and should be modeled explicitly.

## Assumption Reassessment (2026-02-25)

1. Runner event-log translation now routes variable-change scope prefixes and resource-transfer endpoint labels through shared `formatScopeDisplay`.
2. Trigger `varChanged` can legitimately have `scope` omitted, so prefix rendering must continue supporting optional scope.
3. Resource-transfer endpoints must use explicit scope and endpoint rendering should never silently coerce `undefined`/invalid scope to `Global`.
4. **Mismatch + correction**: Current contracts are not fully aligned:
   - runtime TS types include `resourceTransfer` endpoint scope `global | perPlayer | zone`
   - `schemas-core` and `effects-resource` currently model/emit `global | perPlayer`
   - runner tests already exercise `zone` endpoint labels
5. **Ticket correction**: enforce strict endpoint scope at the runner boundary (no fallback), keep exhaustive handling for all currently typed values (`global`, `perPlayer`, `zone`), and fail fast for impossible runtime states.

## Architecture Check

1. Context-specific contracts (or a discriminated union) are cleaner and more robust than a permissive shared input shape because invalid states become unrepresentable at compile time.
2. Failing fast on impossible endpoint scope states prevents silent log corruption and keeps architecture honest.
3. This remains runner presentation logic and preserves the boundary: `GameSpecDoc` holds game-specific data, `GameDef`/runtime/simulator remain game-agnostic.
4. No backwards-compatibility aliases/shims: remove permissive fallback behavior and update callers/tests to strict contracts.
5. **Additional architectural note**: engine-side endpoint scope contract drift (`types-core` vs `schemas-core`/emitter) should be reconciled in a separate ticket; this ticket only hardens runner behavior against invalid endpoint scope input.

## What to Change

### 1. Make scope-rendering contracts context-strict

Refactor `formatScopeDisplay` so endpoint context requires explicit non-optional scope, while prefix context can still accept optional scope:
- Option A: split into two helpers (`formatScopePrefix`, `formatScopeEndpointLabel`) with strict signatures.
- Option B: keep one helper with discriminated-union input (`context: 'endpoint'` requires scope).

### 2. Enforce endpoint invariants explicitly

Implement exhaustive endpoint scope handling and fail fast on impossible states (throw/assert-never), instead of defaulting to `Global` for undefined/unknown input.

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
4. Runner throws on impossible endpoint scope payloads at runtime instead of silently coercing output.
5. Existing suite: `pnpm -F @ludoforge/runner test`

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

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Split shared scope rendering into strict context-specific contracts in runner model utilities:
    - `formatScopePrefixDisplay` (optional scope allowed)
    - `formatScopeEndpointDisplay` (explicit non-optional endpoint scope required)
  - Removed permissive endpoint fallback-to-`Global` behavior and added fail-fast runtime error for impossible endpoint scope payloads.
  - Refactored `translate-effect-trace.ts` to use a shared scope formatter adapter so resolver wiring is centralized and not duplicated across endpoint/prefix calls.
  - Updated runner tests for the new strict helper API and added invariant tests for invalid endpoint scope rejection.
- **Deviation from original plan**:
  - Ticket assumptions were corrected first to document the discovered engine contract drift (`types-core` vs `schemas-core`/emitter) and to keep this ticket scoped to runner hardening.
- **Verification**:
  - `pnpm -F @ludoforge/runner test -- model-utils translate-effect-trace`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
