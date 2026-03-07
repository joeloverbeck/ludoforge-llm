# LEGACTTOO-030: First-Class Limit Identity Contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel types, compiler/runtime contract, tooltip payload threading
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-026-availability-section-limit-rendering-hardening.md, specs/55-legible-action-tooltips.md

## Problem

`limitUsage.id` currently exists only as a derived runtime annotation (`actionId::scope::index`) in `condition-annotator`. This keeps UI keys stable short-term, but identity is still positional and not part of the canonical core limit contract.

To keep architecture clean and extensible, limit identity should be first-class in the agnostic engine model and propagated consistently through runtime/UI surfaces.

## Assumption Reassessment (2026-03-07)

1. `LimitDef` currently has only `scope` and `max`. Confirmed in `packages/engine/src/kernel/types-core.ts`.
2. `limitUsage.id` is currently synthesized in `describeAction` path, not sourced from `ActionDef.limits`. Confirmed in `packages/engine/src/kernel/condition-annotator.ts`.
3. Runner currently keys limit rows by `limit.id` (both `AvailabilitySection` and fallback `ActionTooltip` footer), so identity is now a required downstream contract. Confirmed in `packages/runner/src/ui/AvailabilitySection.tsx` and `packages/runner/src/ui/ActionTooltip.tsx`.

## Architecture Check

1. First-class identity on limits is cleaner than positional derivation because it decouples limit identity from rendering order and intermediate mapping logic.
2. This remains game-agnostic: limit IDs are structural runtime/compiler metadata, not game-specific behavior branching.
3. No backwards compatibility shims/aliases: move directly to the new canonical limit contract and update all call sites/tests.

## What to Change

### 1. Promote limit identity into core types

Add `id` to core limit contracts (starting with `LimitDef`) and enforce it as required for compiled/runtime `GameDef`.

### 2. Move ID generation to canonical compile/build boundary

Generate deterministic limit IDs once at compile/build time for actions that define limits. `describeAction` should consume canonical IDs, not synthesize new ones.

### 3. Unify limit usage shape across engine surfaces

Eliminate duplicated inline anonymous limit usage object shapes by introducing a shared exported type for runtime/UI-facing limit usage entries.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/types.ts` (modify)
- `packages/engine/src/kernel/display-node.ts` (modify)
- `packages/engine/src/kernel/tooltip-rule-card.ts` (modify)
- `packages/engine/src/kernel/condition-annotator.ts` (modify)
- `packages/engine/src/cnl/compile-actions.ts` or equivalent limits compile path (modify)
- `packages/engine/test/unit/**/*.test.ts` (modify, targeted)
- `packages/runner/test/ui/**/*.test.ts` (modify, targeted for updated contract expectations)

## Out of Scope

- Visual style/theming changes in runner
- Changes to GameSpecDoc author-facing semantics for limits
- Any game-specific behavior branching

## Acceptance Criteria

### Tests That Must Pass

1. Every compiled action limit has deterministic canonical `id` in `ActionDef`.
2. `describeAction` and `tooltipPayload.ruleState.limitUsage` preserve canonical IDs from `ActionDef` without re-derivation.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Limit identity is structural and stable across normal usage count updates.
2. GameDef/simulator/runtime remain game-agnostic with no per-game branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — assert IDs originate from canonical action limits and are preserved.
2. `packages/engine/test/unit/**/*.test.ts` (limit compile path) — assert deterministic limit IDs are emitted once at compile/build boundary.
3. `packages/runner/test/ui/AvailabilitySection.test.ts` — assert key stability continues under usage updates with canonical IDs.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/condition-annotator.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/engine typecheck && pnpm -F @ludoforge/engine lint`
6. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
