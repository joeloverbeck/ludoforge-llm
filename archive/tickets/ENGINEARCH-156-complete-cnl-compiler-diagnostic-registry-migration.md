# ENGINEARCH-156: Complete CNL Compiler Diagnostic Registry Migration

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiler diagnostic taxonomy ownership consolidation in cnl modules
**Deps**: archive/tickets/ENGINEARCH-154-domain-scoped-diagnostic-code-registries-and-typed-factories.md

## Problem

Compiler diagnostic ownership is only partially centralized. `compile-lowering.ts` now uses canonical compiler codes for selected diagnostics, but other compiler modules still emit ad-hoc `CNL_COMPILER_*` literals and local missing-capability helpers.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/cnl/compiler-diagnostic-codes.ts` exists and currently owns a bounded helper-focused subset (binding shadow, missing capability, zone var type invalid, turn-structure legacy field unsupported, action phase duplicate, action capability duplicate), not the full compiler taxonomy.
2. `compile-operations.ts` still emits direct `CNL_COMPILER_*` literals, but it already uses the shared missing-capability helper via `compile-lowering.ts`; there is no local duplicate missing-capability helper in this module.
3. `compile-event-cards.ts` still emits direct `CNL_COMPILER_*` literals and also still contains a local `missingCapabilityDiagnostic`/`formatValue` helper duplicate.
4. Current tests lock registry ownership for existing helper codes (`binding-diagnostics.test.ts`) and behavior-level event-card diagnostics (`compile-pipeline.test.ts`), but do not explicitly lock ownership for newly targeted codes in this ticket.
5. Mismatch: intended architecture is single-source diagnostic taxonomy ownership per domain; corrected scope is to migrate the targeted `compile-operations.ts` + `compile-event-cards.ts` literals into canonical compiler registry/factories, not full compiler-wide migration.

## Architecture Check

1. A single compiler diagnostic registry + helper surface for touched compiler modules is cleaner and less drift-prone than per-module literal ownership.
2. This is purely compiler-layer contract hardening and remains game-agnostic; no game-specific identifiers/branches enter GameDef/runtime/simulator.
3. No compatibility aliases/shims; callers switch directly to canonical registry/factory API.

## What to Change

### 1. Expand compiler diagnostic taxonomy ownership in one canonical module

Add remaining `CNL_COMPILER_*` codes used by compiler modules to canonical registry.

### 2. Migrate targeted compiler emitters

Replace direct code literals in `compile-operations.ts` and `compile-event-cards.ts` with canonical registry references, and remove the event-card-local missing-capability builder in favor of shared helper usage.

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

1. `packages/engine/test/unit/binding-diagnostics.test.ts` (or dedicated compiler diagnostic registry test) — assert expanded canonical code ownership for action-pipeline and event-card/event-deck codes.
2. `packages/engine/test/integration/compile-pipeline.test.ts` and/or module-specific compiler tests — assert unchanged diagnostic behavior after migration, including missing-capability emission in event target lowering.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="compile|diagnostic"`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Expanded canonical compiler diagnostic ownership in `packages/engine/src/cnl/compiler-diagnostic-codes.ts` from a small helper subset to full `CNL_COMPILER_*` coverage used across CNL compiler modules.
  - Migrated inline `CNL_COMPILER_*` literal emission to canonical registry references across CNL compiler sources, including:
    - `compile-operations.ts`, `compile-event-cards.ts`, `compile-conditions.ts`, `compile-data-assets.ts`, `compile-effects.ts`, `compile-macro-expansion.ts`, `compile-selectors.ts`, `compile-turn-flow.ts`, `compile-victory.ts`, `compile-zones.ts`, `compiler-core.ts`, `resolve-scenario-table-refs.ts`, and `action-selector-diagnostic-codes.ts`.
  - Removed duplicated local `missingCapabilityDiagnostic`/`formatValue` helper from `compile-event-cards.ts` and switched to shared helper usage from `compile-lowering.ts`.
  - Added architecture guard test to prevent regression:
    - `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` enforces that inline quoted `CNL_COMPILER_*` literals are forbidden outside canonical registry module(s).
  - Strengthened existing behavior-level and ownership tests:
    - expanded registry assertions in `packages/engine/test/unit/binding-diagnostics.test.ts`;
    - added event-target missing-id diagnostic coverage in `packages/engine/test/integration/compile-pipeline.test.ts`.
- **Deviations from original plan**:
  - Assumptions were corrected before implementation: `compile-operations.ts` had raw literals but did not have a duplicated missing-capability helper; helper deduplication work applied only to `compile-event-cards.ts`.
  - Scope was intentionally expanded beyond the initial two-module migration once architectural reassessment confirmed broader compiler taxonomy centralization was more robust and extensible.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern="compile|diagnostic|registry audit"` passed (`360` tests, `0` failed).
  - `pnpm -F @ludoforge/engine test` passed (`331` tests, `0` failed).
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm run check:ticket-deps` passed.
