# ENGINEARCH-129: Eliminate Discovery Context Dispatcher Alias

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel effect-context constructor API and callsite cleanup
**Deps**: archive/tickets/ENGINEARCH-113-discriminated-decision-authority-context-contract.md

## Problem

`createDiscoveryEffectContext(options, ownershipEnforcement)` still acts as a dispatcher alias over strict/probe constructors. This keeps a compatibility-style branch API that weakens explicit constructor ownership.

## Assumption Reassessment (2026-02-28)

1. `effect-context.ts` now has explicit `createDiscoveryStrictEffectContext` and `createDiscoveryProbeEffectContext`.
2. `legal-choices.ts` still calls the dispatcher-style `createDiscoveryEffectContext(..., ownershipEnforcement)`.
3. Existing pending tickets (`ENGINEARCH-114/115/116`) focus on guard ownership/precision and constructor tests, not removal of dispatcher alias API. Corrected scope: remove alias API and use explicit constructors only.

## Architecture Check

1. Explicit strict/probe constructor calls are cleaner and more robust than a dispatcher wrapper with mode-like branching.
2. This is kernel plumbing only and remains game-agnostic; no GameSpecDoc or visual-config coupling is introduced.
3. No backwards compatibility or alias paths: remove dispatcher alias directly and migrate callsites.

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
