# 64MCTSPEROPT-007: Family-First Widening at Root and Shallow Depths

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — MCTS expansion/selection widening logic
**Deps**: 64MCTSPEROPT-004, 64MCTSPEROPT-006

## Problem

On FITL, high-cardinality ready families (event variants, resource transfers) consume all early expansion slots, starving strategically distinct operations (rally, march, attack) of visits. After 50 iterations, core FITL actions still receive zero visits (spec section 0.1). The spec (section 3.7) requires family-first widening: widen over families first, then over concrete move variants within each family.

## Assumption Reassessment (2026-03-17)

1. Progressive widening uses `K * visits^alpha` formula (`progressiveWideningK`, `progressiveWideningAlpha`) — **confirmed** in `config.ts`.
2. `familyKey()` from ticket 006 groups moves by `actionId` — provides the family abstraction.
3. Current expansion does not distinguish families — all candidates are in one pool.

## Architecture Check

1. Family-first widening ensures diverse action coverage at the root, which is where strategic diversity matters most.
2. Below shallow depths (depth ≥ 2), ordinary move-level widening applies — no unnecessary overhead.
3. Falls back to move-level behavior when family cardinality is small.

## What to Change

### 1. Add `wideningMode` config field

Add `wideningMode?: 'move' | 'familyThenMove'` to `MctsConfig`. Default: `'move'` (backward compat). Spec says `'familyThenMove'` should be default for expensive/high-branching games.

### 2. Implement family-first widening in expansion

At depth 0 and depth 1 (when `wideningMode === 'familyThenMove'`):
- Use progressive widening to determine how many families can be represented.
- Cap concrete siblings per family until all families have had at least one child.
- Once all families are represented, allow additional variants within families.

### 3. Add `maxVariantsPerFamilyBeforeCoverage` config field

Cap on concrete siblings per family before all families have at least one child. Default: 1. This prevents one high-cardinality family from consuming all slots.

### 4. Integrate family info into frontier ordering (from ticket 004)

Cheap frontier ordering should prefer candidates from unrepresented families. The "family coverage gap" signal from spec section 3.8 is integrated here.

### 5. Fall back to move-level widening when family count is small

If total family count ≤ 3, family-first widening adds no value — fall through to ordinary move-level behavior.

### 6. Add diagnostics

Track: `familyCoverageAtRoot` (how many families represented after N iterations), `familyStarvationCount` (families with 0 visits).

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify — add `wideningMode`, `maxVariantsPerFamilyBeforeCoverage`)
- `packages/engine/src/agents/mcts/expansion.ts` (modify — family-first expansion logic)
- `packages/engine/src/agents/mcts/search.ts` (modify — pass family info to expansion, depth-aware widening mode)
- `packages/engine/src/agents/mcts/diagnostics.ts` (modify — family coverage counters)

## Out of Scope

- Pending-family coverage / quota (ticket 64MCTSPEROPT-008)
- Budget profiles (ticket 64MCTSPEROPT-009)
- Direct-mode evaluation tuning (ticket 64MCTSPEROPT-010)
- Fallback policies (ticket 64MCTSPEROPT-009)
- Parallel search (Phase 6)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: with 5 families of varying cardinality, after N expansion rounds with `familyThenMove`, all 5 families have at least 1 child before any family has 2.
2. New unit test: `maxVariantsPerFamilyBeforeCoverage: 1` caps siblings correctly.
3. New unit test: when family count ≤ 3, behavior is equivalent to move-level widening.
4. New unit test: frontier ordering prefers unrepresented families.
5. New unit test: `wideningMode: 'move'` behaves identically to current behavior.
6. `pnpm -F @ludoforge/engine test` — full suite passes.
7. `pnpm turbo typecheck` passes.

### Invariants

1. At depth ≥ 2, widening is always move-level regardless of `wideningMode`.
2. Family-first widening does not change which moves are legal — only the order of exploration.
3. `progressiveWideningK` and `progressiveWideningAlpha` still control total child count.
4. No game-specific logic — family grouping comes from `familyKey()`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/family-widening.test.ts` (new) — covers family-first logic, depth gating, fallback.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
