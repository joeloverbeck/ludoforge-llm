# ENGINEARCH-156: Complete CNL Compiler Diagnostic Registry Migration

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiler diagnostic taxonomy ownership consolidation in cnl modules
**Deps**: archive/tickets/ENGINEARCH-154-domain-scoped-diagnostic-code-registries-and-typed-factories.md

## Problem

Compiler diagnostic ownership is only partially centralized. `compile-lowering.ts` now uses canonical compiler codes for selected diagnostics, but other compiler modules still emit ad-hoc `CNL_COMPILER_*` literals and local missing-capability helpers.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/cnl/compiler-diagnostic-codes.ts` exists and currently owns only a subset of compiler diagnostics.
2. `compile-operations.ts` and `compile-event-cards.ts` still emit direct `CNL_COMPILER_*` literals and maintain duplicated helper logic.
3. Mismatch: intended architecture is single-source diagnostic taxonomy ownership per domain; corrected scope is to migrate remaining compiler-domain literals/helpers into canonical CNL registry/factories.

## Architecture Check

1. A single compiler diagnostic registry + helper surface is cleaner and less drift-prone than per-module literal ownership.
2. This is purely compiler-layer contract hardening and remains game-agnostic; no game-specific identifiers/branches enter GameDef/runtime/simulator.
3. No compatibility aliases/shims; callers switch directly to canonical registry/factory API.

## What to Change

### 1. Expand compiler diagnostic taxonomy ownership in one canonical module

Add remaining `CNL_COMPILER_*` codes used by compiler modules to canonical registry.

### 2. Migrate remaining compiler emitters

Replace direct code literals and duplicated missing-capability builders in `compile-operations.ts` and `compile-event-cards.ts` with canonical helper usage.

### 3. Tighten typing in helper APIs and call sites

Constrain helper inputs/outputs with derived code union types where practical.

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/compile-operations.ts` (modify)
- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/src/cnl/compile-lowering.ts` (modify only if shared helper signatures change)
- `packages/engine/test/unit/` compiler-focused tests (modify/add)

## Out of Scope

- XREF (`CNL_XREF_*`) domain migration beyond needed call-site compatibility.
- Game content/data edits under `data/games/**`.
- Visual config changes (`**/visual-config.yaml`).

## Acceptance Criteria

### Tests That Must Pass

1. Compiler modules no longer emit raw `CNL_COMPILER_*` literals in migrated scope.
2. Missing-capability diagnostics in compiler modules are created through canonical helper(s).
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Compiler diagnostic taxonomy remains centrally owned and compile-time constrained.
2. Engine/runtime/kernel remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binding-diagnostics.test.ts` (or dedicated compiler diagnostic registry test) — assert expanded canonical code ownership.
2. `packages/engine/test/unit/compile-top-level.test.ts` and/or module-specific compiler tests — assert unchanged diagnostic behavior after migration.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="compile|diagnostic"`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`
