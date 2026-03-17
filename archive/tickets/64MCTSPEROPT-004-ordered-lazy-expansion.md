# 64MCTSPEROPT-004: Ordered Lazy Expansion with Shortlist

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — MCTS expansion logic
**Deps**: 64MCTSPEROPT-002, 64MCTSPEROPT-003

## Problem

The current expansion evaluates all unexpanded candidates exhaustively: classify all, one-step `applyMove() + evaluate()` all, then pick the best. On FITL with ~100+ legal moves, this makes expansion the dominant cost. The spec (section 3.6) requires replacing this with ordered lazy expansion: build a cheap frontier, classify on demand, and only run one-step evaluate on a small shortlist.

## Assumption Reassessment (2026-03-17)

1. `expansion.ts` contains the expansion logic — need to verify it does exhaustive candidate evaluation.
2. `ConcreteMoveCandidate` in `expansion.ts` includes one-step heuristic scores.
3. After ticket 002, `CachedClassificationEntry` supports incremental classification.
4. After ticket 003, selection uses sound availability checking.

## Architecture Check

1. Lazy expansion reduces `applyMove()` + `evaluate()` calls from O(all_unexpanded) to O(shortlist_size).
2. Shortlist-based evaluation preserves search quality while cutting per-iteration cost.
3. An exhaustive policy remains available for cheap/small games via config.

## What to Change

### 1. Add cheap ordering policy for frontier

Create a frontier ordering function that ranks unexpanded candidates using cheap signals:
- Previous root-best / transposition hint
- Terminal/proven-result information if already known
- Stable PRNG tie-break

This ordering does NOT require `applyMove()` or `evaluate()`.

### 2. Modify expansion to use ordered frontier

Replace the exhaustive "classify all → evaluate all → pick best" pattern with:
1. Get cached legal-move infos for the state.
2. Compute which children are already represented.
3. Build an ordered frontier of unexpanded candidates (using cheap ordering).
4. Classify frontier candidates on demand until one compatible candidate is found, or the shortlist budget is exhausted, or the frontier is exhausted.
5. For ready candidates, run one-step `applyMove() + evaluate()` only on a small shortlist (default 3-5).
6. Expand the best shortlisted candidate.

### 3. Add shortlist size config

Add a config parameter for max shortlist size (candidates that get the expensive one-step evaluation). Default to a small value (e.g., 4).

### 4. Keep exhaustive expansion as a fallback

When branching is small (e.g., < 10 candidates) or classification is cheap, fall through to the exhaustive path. This preserves correctness for cheap games.

### 5. Add diagnostics for lazy expansion

Track: `lazyExpansionCandidatesClassified`, `lazyExpansionShortlistSize`, `lazyExpansionFrontierExhausted`.

## Files to Touch

- `packages/engine/src/agents/mcts/expansion.ts` (modify — lazy expansion logic, shortlist)
- `packages/engine/src/agents/mcts/search.ts` (modify — call new expansion with cache)
- `packages/engine/src/agents/mcts/state-cache.ts` (modify — if additional helpers needed for frontier building)
- `packages/engine/src/agents/mcts/diagnostics.ts` (modify — add lazy expansion counters)
- `packages/engine/src/agents/mcts/config.ts` (modify — add shortlist size param if needed)

## Out of Scope

- Family widening (ticket 64MCTSPEROPT-006) — this ticket does move-level ordering only
- Family-level prior signals (ticket 64MCTSPEROPT-007)
- Budget profiles (ticket 64MCTSPEROPT-009)
- Rollout/leaf evaluator changes (ticket 64MCTSPEROPT-001)
- Decision discovery caching (Phase 4)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: with 50+ unexpanded candidates, only shortlist-size candidates get `applyMove()` + `evaluate()`.
2. New unit test: when branching < 10, exhaustive path is used.
3. New unit test: frontier ordering produces deterministic order for same PRNG seed.
4. New unit test: if all frontier candidates classify as `illegal`, expansion returns null (no crash).
5. Differential test: on a simple game corpus, lazy expansion and exhaustive expansion produce equivalent search quality (comparable root visit distributions within tolerance).
6. `pnpm -F @ludoforge/engine test` — full suite passes.
7. `pnpm turbo typecheck` passes.

### Invariants

1. No full classify-all sweep on revisits under lazy mode.
2. No full one-step-evaluate-all sweep on high-branching nodes.
3. Exact global best-candidate expansion remains available as a policy for cheap games.
4. `applyMove()` is only called on shortlisted candidates, not all unexpanded.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/lazy-expansion.test.ts` (new) — covers shortlist, frontier ordering, exhaustion.
2. `packages/engine/test/unit/agents/mcts/mcts-agent.test.ts` — verify no regression.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-17
- **What changed**:
  - `expansion.ts`: Added `buildOrderedFrontier()` (cheap ordering with root-best hint, status priority, PRNG tie-break), `selectExpansionCandidateLazy()` (ordered frontier walk + on-demand classification + shortlist-only one-step evaluation + exhaustive fallback for small branching), and `classifyNextCandidateAt()` helper.
  - `config.ts`: Added `expansionShortlistSize` (default 4) and `expansionExhaustiveThreshold` (default 10) config params with validation.
  - `diagnostics.ts`: Added 4 lazy expansion counters: `lazyExpansionCandidatesClassified`, `lazyExpansionShortlistSize`, `lazyExpansionFrontierExhausted`, `lazyExpansionFallbackToExhaustive`.
  - `search.ts`: Modified expansion call site to use `selectExpansionCandidateLazy` when `classificationPolicy: 'lazy'`, falling back to exhaustive `selectExpansionCandidate` otherwise. Computes root-best hint and existing child key set for the frontier.
  - `lazy-expansion.test.ts` (new): 11 unit tests covering all acceptance criteria.
- **Deviations from plan**:
  - Added `expansionExhaustiveThreshold` config param (not explicitly in ticket, but implied by the "when branching < 10 use exhaustive" requirement).
  - Added `lazyExpansionFallbackToExhaustive` counter (extra diagnostic beyond the 3 specified, for observability into fallback frequency).
  - `state-cache.ts` was not modified (existing helpers were sufficient).
- **Verification results**: 5031 engine tests pass, typecheck clean, lint clean, 0 regressions.
