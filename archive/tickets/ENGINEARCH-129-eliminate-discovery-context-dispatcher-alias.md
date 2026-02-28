# ENGINEARCH-129: Eliminate Discovery Context Dispatcher Alias

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel effect-context constructor API and callsite cleanup
**Deps**: archive/tickets/ENGINEARCH-113-discriminated-decision-authority-context-contract.md

## Problem

`createDiscoveryEffectContext(options, ownershipEnforcement)` still acts as a dispatcher alias over strict/probe constructors. This keeps a compatibility-style branch API that weakens explicit constructor ownership.

## Assumption Reassessment (2026-02-28)

1. `effect-context.ts` now has explicit `createDiscoveryStrictEffectContext` and `createDiscoveryProbeEffectContext`.
2. `legal-choices.ts` still calls the dispatcher-style `createDiscoveryEffectContext(..., ownershipEnforcement)`.
3. `ENGINEARCH-114/115/116` are already completed and archived; they established boundary guards and constructor behavior contracts but intentionally left dispatcher alias removal unaddressed.
4. Corrected scope: remove alias API and migrate discovery callsites/tests to explicit constructors only.

## Architecture Check

1. Explicit strict/probe constructor calls are cleaner and more robust than a dispatcher wrapper with branching semantics hidden behind a generic name.
2. This is kernel plumbing only and remains game-agnostic; no GameSpecDoc or visual-config coupling is introduced.
3. No backwards compatibility or alias paths: remove dispatcher alias directly and migrate callsites.
4. Architectural judgment: the proposed change is superior to current architecture because it enforces authority intent at the callsite, tightens static guarantees in tests, and removes an unnecessary indirection layer.

## What to Change

### 1. Remove discovery dispatcher alias API

Delete `createDiscoveryEffectContext(...)` from `effect-context.ts`.

### 2. Migrate discovery callsites to explicit constructors

Use `createDiscoveryStrictEffectContext(...)` and `createDiscoveryProbeEffectContext(...)` at runtime callsites based on explicit control flow.

### 3. Tighten constructor contract tests

Update guard/contract tests to assert only explicit constructor surface is exported/used.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` (modify if constructor-name expectations change)

## Out of Scope

- Runtime legality policy changes for options classification.
- Any GameSpecDoc or visual-config schema changes.
- Runner/UI behavior changes.

## Acceptance Criteria

### Tests That Must Pass

1. No runtime callsite depends on `createDiscoveryEffectContext(...)`.
2. Discovery strict/probe contexts are constructed only through explicit constructors.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Constructor API is explicit and non-aliased for authority semantics.
2. Effect-context construction remains centralized and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — verifies explicit discovery constructor surface and no dispatcher alias.
2. `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` — verifies boundary modules route through explicit expected constructors.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Removed `createDiscoveryEffectContext(...)` dispatcher alias from `packages/engine/src/kernel/effect-context.ts`.
  - Migrated discovery effect construction in `packages/engine/src/kernel/legal-choices.ts` to explicit strict/probe constructors with direct `applyEffects(...)` boundary calls.
  - Updated constructor contract and mode-threading architecture guards to enforce explicit constructor-only discovery API usage.
  - Corrected ticket assumption text: `ENGINEARCH-114/115/116` are archived/completed, not pending.
- **Deviations From Original Plan**:
  - None in scope; implementation matched planned API removal and callsite migration.
  - Guard test internals were slightly reshaped to represent per-boundary allowed constructor sets as string arrays for stable TypeScript typing.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (320/320 passed)
  - `pnpm -F @ludoforge/engine lint` ✅
