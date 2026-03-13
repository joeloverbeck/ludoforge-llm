# UNICOMGAMPLAAIAGE-007: Lazy Template Move Materialization for Search

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new file in agents/mcts/, possible kernel helper
**Deps**: UNICOMGAMPLAAIAGE-002

## Problem

`legalMoves()` may return template moves (moves with unresolved parameters). The MCTS tree operates on concrete moves only. A lazy materialization layer must complete templates on-demand, deduplicating by `MoveKey`, without exhaustively expanding all templates at every node.

## Assumption Reassessment (2026-03-13)

1. `completeTemplateMove` exists in `kernel/move-completion.ts` — confirmed, returns `completed | unsatisfiable | stochasticUnresolved`.
2. `legalChoicesEvaluate` in `kernel/legal-choices.ts` can detect if a move is `pending` (template) — confirmed from `greedy-agent.ts` usage.
3. `MoveKey` and `canonicalMoveKey` from ticket 002 provide deduplication keys.
4. Spec requires: non-template moves yielded as-is, templates completed lazily, deduplicated by MoveKey, progressive widening controls admission.

## Architecture Check

1. Materialization is MCTS-internal — lives in `agents/mcts/materialization.ts`.
2. Reuses existing `completeTemplateMove` and `legalChoicesEvaluate` from kernel — no kernel changes.
3. Does not exhaustively complete all templates — samples a bounded number per template per visit.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/materialization.ts`

Define:
- `ConcreteMoveCandidate` interface: `{ readonly move: Move; readonly moveKey: MoveKey }`
- `materializeConcreteCandidates(def: GameDef, state: GameState, legalMoves: readonly Move[], rng: Rng, limitPerTemplate: number, runtime?: GameDefRuntime): { readonly candidates: readonly ConcreteMoveCandidate[]; readonly rng: Rng }`

Logic:
1. For each legal move, check if it's a template (via `legalChoicesEvaluate`).
2. Non-template (fully concrete) moves: wrap as `ConcreteMoveCandidate` with computed `moveKey`.
3. Template moves: call `completeTemplateMove` up to `limitPerTemplate` times, collecting unique `MoveKey`s.
4. `stochasticUnresolved` results: include as candidates (the search will handle them).
5. `unsatisfiable` results: skip.
6. Deduplicate all candidates by `MoveKey` (first occurrence wins).

- `filterAvailableCandidates(node: MctsNode, candidates: readonly ConcreteMoveCandidate[]): readonly ConcreteMoveCandidate[]`
  Returns candidates whose `moveKey` does not already appear in `node.children`.

### 2. Update `packages/engine/src/agents/mcts/index.ts`

Add re-export for `materialization.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/materialization.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/materialization.test.ts` (new)

## Out of Scope

- Progressive widening (decides whether to expand at all) — ticket 006.
- Expansion priority (picks which candidate to expand) — ticket 006.
- Move-key canonicalization implementation — ticket 002.
- Changes to `completeTemplateMove` or `legalChoicesEvaluate`.
- Move legality validation helper for previously expanded moves — can be deferred unless search loop reveals need.

## Acceptance Criteria

### Tests That Must Pass

1. Non-template move: yielded as-is with computed `moveKey`.
2. Template move: completed up to `limitPerTemplate` times with unique keys.
3. Duplicate completions (same `moveKey`): deduplicated to single candidate.
4. `unsatisfiable` template: not included in candidates.
5. `stochasticUnresolved`: included in candidates.
6. `limitPerTemplate = 1`: at most one completion per template.
7. Empty legal moves: returns empty candidates array.
8. `filterAvailableCandidates`: excludes candidates already in node's children by moveKey.
9. Deterministic: same inputs + same RNG produce same candidates in same order.
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Never exhaustively expands all possible completions of a template.
2. Total candidates bounded by `concreteMoves + templates * limitPerTemplate`.
3. All returned candidates have valid `moveKey` values.
4. Input `legalMoves` array is not mutated.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/materialization.test.ts` — concrete passthrough, template completion, deduplication, unsatisfiable skip, stochastic inclusion, determinism, filtering.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/materialization.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

**Completed**: 2026-03-13

**What changed**:
- Created `packages/engine/src/agents/mcts/materialization.ts` with `materializeConcreteCandidates` and `filterAvailableCandidates`
- Updated `packages/engine/src/agents/mcts/index.ts` with re-exports
- Created `packages/engine/test/unit/agents/mcts/materialization.test.ts` with 14 tests (10 for materialization, 4 for filtering)

**Deviations from plan**:
- `ConcreteMoveCandidate` interface was already defined in `expansion.ts` (ticket 006 forward-placed it), so materialization imports it rather than defining it
- Template detection uses `legalChoicesEvaluate` checking `kind === 'pending'` (matching greedy-agent pattern) rather than inspecting params directly
- Added `illegal` kind handling — moves that `legalChoicesEvaluate` reports as illegal are skipped
- Catches exceptions from `legalChoicesEvaluate` (e.g. unknown actions) and skips those moves

**Verification**: All 14 unit tests pass, full engine + runner test suites pass, typecheck clean, lint 0 errors
