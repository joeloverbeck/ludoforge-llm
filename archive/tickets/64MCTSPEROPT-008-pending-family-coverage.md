# 64MCTSPEROPT-008: Pending-Family Coverage Rules

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — MCTS expansion pending-move handling
**Deps**: 64MCTSPEROPT-006, 64MCTSPEROPT-007

## Problem

Even with family-first widening, pending operations (rally, march, attack) can still be starved if ready moves always win expansion priority. The spec (section 3.7) requires reserving at least one early expansion slot for a pending family if any pending families exist, ensuring that core FITL operations stop getting zero visits.

## Assumption Reassessment (2026-03-17)

1. `classifyMovesForSearch()` classifies moves as `ready` or `pending` — pending moves need decision root nodes in the tree.
2. After ticket 007, family-first widening ensures diverse families — but only among ready moves.
3. Pending moves require different handling: they create decision root nodes, not direct-apply children.

## Architecture Check

1. Pending-family quota ensures at least one pending family gets a slot in early expansion.
2. This is the key fix for FITL operation starvation — the spec's central goal.
3. No game-specific logic — uses classification status and family key generically.

## What to Change

### 1. Add `pendingFamilyQuotaRoot` config field

Add `pendingFamilyQuotaRoot?: number` to `MctsConfig`. Default: 1. This reserves N early expansion slots for pending families at the root.

### 2. Implement pending-family reservation in expansion

During family-first widening at depth 0:
- After computing the expansion budget (from progressive widening), reserve `pendingFamilyQuotaRoot` slots for pending families.
- If pending families exist and haven't been expanded yet, one of the reserved slots must go to a pending family before more ready variants are added.
- If no pending families exist, the reserved slots fall through to ready families.

### 3. Add pending-family detection

Use `CachedClassificationEntry` status to identify which families contain pending moves. A family is "pending" if it has at least one move with `status: 'pending'` and no `ready` moves have been expanded for it.

### 4. Add diagnostics

Track: `pendingFamiliesTotal`, `pendingFamiliesWithVisits`, `pendingFamilyQuotaUsed`.

### 5. Add FITL stress test validation

In the FITL S1 and S3 scenarios, assert that at least one pending family (e.g., rally, march, or attack) receives visits after a modest iteration budget.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify — add `pendingFamilyQuotaRoot`)
- `packages/engine/src/agents/mcts/expansion.ts` (modify — pending-family reservation logic)
- `packages/engine/src/agents/mcts/diagnostics.ts` (modify — pending family counters)

## Out of Scope

- Budget profiles (ticket 64MCTSPEROPT-009)
- Direct-mode evaluation tuning (ticket 64MCTSPEROPT-010)
- Decision discovery caching (ticket 64MCTSPEROPT-011)
- Family-first widening mechanics (ticket 64MCTSPEROPT-007 — already landed)
- Changing how decision root nodes work

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: with 3 ready families and 2 pending families, at least 1 pending family gets a child within the first `pendingFamilyQuotaRoot + familyCount` expansions.
2. New unit test: if `pendingFamilyQuotaRoot: 0`, pending families compete normally (no reservation).
3. New unit test: if no pending families exist, quota slots fall through to ready families.
4. FITL stress test: in S1 scenario with ≥50 iterations, at least one pending family (operation) receives >0 visits.
5. `pnpm -F @ludoforge/engine test` — full suite passes.
6. `pnpm turbo typecheck` passes.

### Invariants

1. Pending-family reservation does not change which moves are legal.
2. Quota only affects expansion order, not UCT scoring.
3. `pendingFamilyQuotaRoot` defaults to 1 — conservative but effective.
4. No game-specific logic — uses classification status generically.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/pending-family-coverage.test.ts` (new) — covers reservation, fallthrough, no-pending case.
2. `packages/engine/test/e2e/mcts-fitl/fitl-mcts-fast.test.ts` (modify — add pending-family visit assertion).

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-18
- **What changed**:
  - `config.ts`: Added `pendingFamilyQuotaRoot?: number` (default 1) with `assertNonNegativeInt` validation.
  - `expansion.ts`: Added `pendingFamilyQuotaRoot` parameter to `selectExpansionCandidateFamilyFirst`. After the main shortlist pass, a secondary discovery pass classifies unknown candidates from unrepresented families to discover pending moves (up to quota). Discovered pending moves remain in the `CachedClassificationEntry` so `search.ts` can create decision root nodes.
  - `diagnostics.ts`: Added `pendingFamiliesTotal`, `pendingFamiliesWithVisits`, `pendingFamilyQuotaUsed` to accumulator and result.
  - `search.ts`: Updated call site to pass `config.pendingFamilyQuotaRoot ?? 1`.
  - `family-widening.test.ts`: Updated existing calls for new parameter.
  - `pending-family-coverage.test.ts` (new): 5 tests covering diagnostics tracking, ready-only expansion, quota=0, no-pending fallthrough, and discovery from unknowns.
- **Deviations**: FITL E2E stress test assertion (acceptance criterion 4) was not added because S1-S7 scenarios currently crash due to incomplete decision-param support. The assertion should be added once decision-node architecture is complete.
- **Verification**: `pnpm turbo build` ✅, `pnpm turbo typecheck` ✅, `pnpm -F @ludoforge/engine test` — 5077 pass, 0 fail ✅.
