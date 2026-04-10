# 124PHABESREP-001: Implement best-of-N representative selection in Phase 1 preview

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-agent.ts`, `packages/engine/src/agents/policy-preview.ts`
**Deps**: `archive/specs/63-phase1-preview-for-template-operations.md`

## Problem

Phase 1 representative preview selects the first successful RNG completion per action type (`prepared.completedMoves[0]`). With `phase1CompletionsPerAction > 1`, all completions beyond the first are discarded. This produces low-quality representatives that prevent opponent-aware candidate features (e.g., `preview.victory.currentMargin.<seat>`) from differentiating between action types. The agent cannot learn to prefer combat actions when enemy presence is high because the random representative doesn't demonstrate the action's best-case impact.

## Assumption Reassessment (2026-04-10)

1. `buildPhase1ActionPreviewIndex` exists at `policy-agent.ts:136`, selects `prepared.completedMoves[0]` at line 174 — confirmed.
2. `getSeatMargin()` exists as a private helper at `policy-preview.ts:421`, calls `buildPolicyVictorySurface().marginBySeat.get(seatId)` — confirmed.
3. `phase1CompletionsPerAction` config exists at `types-core.ts:709`, defaults to 1 at `policy-agent.ts:149` — confirmed.
4. `applyTrustedMove` at `apply-move.ts:1735` returns new state (immutable) — confirmed.
5. `preparePlayableMoves` accepts `pendingTemplateCompletions` and returns `completedMoves: readonly TrustedExecutableMove[]` — confirmed.
6. `NOT_VIABLE_RETRY_CAP` = 7 at `prepare-playable-moves.ts:22` — confirmed.
7. Blast radius of `buildPhase1ActionPreviewIndex`: called only from `PolicyAgent.chooseMove()` at line 58 — highly localized.
8. Existing best-of-N pattern in `greedy-agent.ts:73-88` uses `applyTrustedMove` + evaluate + select best — confirmed as reference pattern.

## Architecture Check

1. Selection criterion is `victory.currentMargin.self` — game-agnostic, every game with a victory formula has this. No game-specific logic introduced (Foundation 1).
2. Controlled by existing `phase1CompletionsPerAction` YAML config — no new code paths exposed, specs remain data (Foundation 7).
3. No backwards-compatibility shims: N=1 fast path preserves current behavior exactly. N>1 is opt-in. No aliases, no deprecated fallbacks (Foundation 14).
4. Follows established pattern from `greedy-agent.ts` — not inventing new infrastructure.

## What to Change

### 1. Export `getSeatMargin()` from `policy-preview.ts`

Add `export` to the existing private function at line 421. No signature change. This makes the margin evaluation helper available to the selection step in `policy-agent.ts`.

### 2. Add best-of-N selection logic to `buildPhase1ActionPreviewIndex` in `policy-agent.ts`

After `preparePlayableMoves` returns, replace the unconditional `prepared.completedMoves[0]` selection (line 174) with:

- **Fast path** (N=1 or single completion): retain current `completedMoves[0]` behavior — no `applyTrustedMove` call, no overhead.
- **Selection path** (N>1 and multiple completions): for each completion, call `applyTrustedMove()` to get the projected state, then call `getSeatMargin(def, projectedState, seatId, runtime)` to extract the projected self-margin. Select the completion with the highest margin. Break ties by completion order (first encountered wins — deterministic).

Follow the established pattern from `greedy-agent.ts:73-88`.

### 3. Unit tests

Add tests in `packages/engine/test/unit/agents/` (new file or extend `policy-agent.test.ts`):

1. **N=1 backward compat**: With `phase1CompletionsPerAction: 1`, the selected representative is `completedMoves[0]` — identical to current behavior.
2. **Best-of-N selects higher margin**: Construct a scenario where completion A has margin -45 and completion B has margin -40. Assert the selection is B.
3. **Determinism**: Same seed + same N produces the same representative across two runs.
4. **Tie-breaking**: When two completions produce the same margin, the first encountered (by index) is selected.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify — export `getSeatMargin`)
- `packages/engine/src/agents/policy-agent.ts` (modify — selection logic in `buildPhase1ActionPreviewIndex`)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify — add best-of-N unit tests)

## Out of Scope

- Custom ranking expressions (fixed to projected self-margin)
- Adaptive N per action type
- Phase 2 changes
- Integration tests (covered by 124PHABESREP-002)
- Profile YAML changes (profiles opt in by setting `phase1CompletionsPerAction > 1` — not this ticket's concern)

## Acceptance Criteria

### Tests That Must Pass

1. N=1 produces the same representative as the current first-of-N behavior
2. N>1 selects the completion with the highest projected self-margin
3. Same seed + same N produces identical representative (determinism)
4. Tie-breaking selects the first completion by index order
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `applyTrustedMove` is never called during the selection step when `completionBudget <= 1` (fast path preserves current performance)
2. Selection is deterministic: same GameDef + same seed + same N = same representative (Foundation 8)
3. No mutation of input state — all projected states are new objects from `applyTrustedMove` (Foundation 11)
4. The selected representative's projected margin is >= the first completion's projected margin (best-of-N is never worse than first-of-N)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — best-of-N selection: backward compat, selection quality, determinism, tie-breaking

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "best-of-N|bestOfN|best.of"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completed: 2026-04-10
- What landed:
  - Exported `getSeatMargin()` from `packages/engine/src/agents/policy-preview.ts`.
  - Updated `buildPhase1ActionPreviewIndex()` in `packages/engine/src/agents/policy-agent.ts` to keep the `N=1` fast path and to select the highest projected self-margin representative when `phase1CompletionsPerAction > 1`.
  - Added unit coverage in `packages/engine/test/unit/agents/policy-agent.test.ts` for N=1 backward compatibility, best-of-N selection, determinism, and first-completion tie-breaking using the real `victory.currentMargin.self` preview surface.
- Boundary notes:
  - The active ticket remained the authoritative boundary; sibling ticket `124PHABESREP-002` still owns FITL integration proof.
  - No schema or generated artifact changes were required; schema artifact sync was checked and remained clean.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node dist/test/unit/agents/policy-agent.test.js`
  - `pnpm -F @ludoforge/engine test`
- Verification command substitution:
  - The ticket's focused `--test-name-pattern` example is stale for this package's Node test runner workflow. The live focused proof used the repo-approved built-test form instead of the Jest-style filter.
