# DIAGFITL-005: Investigate and fix empty Rally target selection

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Possibly — depends on investigation outcome
**Deps**: `archive/tickets/DIAGFITL-002.md`, `archive/tickets/DIAGFITL-003.md`

## Problem

In seed 1000 (Decision 4), the VC agent selected a Rally move with `$targetSpaces: []` — an empty target list that results in a no-op. Despite 10 legal move types being available (22 candidates after completion), the agent chose a zero-target Rally. The `preferPopulousTargets` completion-scope consideration should score more targets higher, but it didn't prevent zero-target selection.

From the trace:
- `initialCandidateCount: 22`, `legalMoveCount: 10`
- `finalScore: 3` (same as other Rally moves with targets)
- Pruning: `dropPassWhenOtherMovesExist` → 21 remaining (1 pass dropped)
- Tie-break: 3 candidates tied, `preferCheapTargetSpaces` didn't differentiate, `stableMoveKey` selected index 12

This suggests either:
1. The `preferPopulousTargets` consideration does not penalize zero-target selections
2. Zero-target Rally has the same action-level score (from `preferRallyWeighted`) as non-zero Rally, and the completion-scope differentiation is insufficient
3. The legal-move enumeration should not generate zero-target Rally as a valid move

## Assumption Reassessment (2026-04-02)

1. The shared FITL insurgent Rally selector currently allows `chooseN` for `$targetSpaces` with `min: 0`, so both NVA and VC inherit empty-target Rally completion.
2. FITL rules support zero-space Rally only for the explicit NVA Trail-improvement rider: Section 3.3.1 says NVA may improve the Trail even if Rally “selected 0 spaces”. The VC procedure instead says “IF NONE: If no Rally is possible ... instead March ... or Pass”.
3. `preferPopulousTargets` is a completion-scope consideration, so it never differentiates an empty Rally completion once the legal move surface already permits that empty completion.

## Architecture Check

1. This is primarily a FITL authored-rules issue: VC should not inherit the shared zero-target Rally allowance, while NVA must retain its explicit zero-space Trail-improvement exception.
2. The empty Rally choice is not best fixed by changing engine completion semantics or by layering more agent weighting onto an illegal/undesired VC move surface.
3. No engine architectural change is needed; the fix lives in authored Rally legality/selection plus regression coverage.

## What to Change

### 1. Split Rally target-space minimum by faction

Update the shared insurgent Rally selector so NVA can still use `min: 0`, but VC Rally requires at least one selected target space.

### 2. Preserve VC Rally legality only when the move can actually be paid

Because VC Rally now requires at least one selected space, paid VC Rally must be illegal at `vcResources = 0` instead of surfacing a `chooseN min cannot exceed max` runtime failure.

### 3. Refresh policy-facing regression expectations

Update the affected FITL policy/integration tests so they assert the real invariant after the legality correction:
- VC cannot complete Rally with an empty target set
- NVA still keeps the explicit zero-space Rally path
- Guided VC completion still selects a better populated Rally target set than the unguided fallback

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (possibly modify)
- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `packages/engine/test/integration/fitl-insurgent-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)

## Out of Scope

- Changing the completion system's move enumeration logic
- Modifying NVA Rally legality or Trail-improvement behavior
- Adding new action types or alternatives to Rally

## Acceptance Criteria

### Tests That Must Pass

1. After fix: VC agent should not select zero-target Rally when non-zero-target Rally is available
2. Compile FITL game spec — no compiler errors
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Rally remains legal with valid targets in all game states where VC can rally and pay for the move
2. NVA retains the explicit zero-space Rally path needed for Trail improvement

## Test Plan

### New/Modified Tests

1. Add/extend FITL Rally integration coverage for empty-target VC illegality and zero-resource VC Rally illegality
2. Update FITL policy guidance coverage to assert the post-fix non-empty Rally invariant without pinning stale unguided tie-break output

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

- Completed: 2026-04-02
- Changed the shared FITL insurgent Rally selector so NVA retains `min: 0` for the explicit Trail-improvement exception while VC Rally now requires at least one target space.
- Tightened VC Rally legality and cost validation so paid VC Rally is illegal at `vcResources = 0` instead of surfacing a runtime `chooseN min cannot exceed max` failure.
- Updated FITL integration and policy guidance tests to cover empty-target VC illegality, zero-resource VC Rally illegality, and the post-fix non-empty guided Rally invariant without pinning stale unguided tie-break output.
- Deviations from original plan: the final fix was a FITL authored-rules legality correction backed by local rules reports, not a pure agent-weighting adjustment.
- Verification: `pnpm -F @ludoforge/engine build`; `node --test "dist/test/integration/fitl-insurgent-operations.test.js"` from `packages/engine`; `node --test "dist/test/integration/fitl-policy-agent.test.js"` from `packages/engine`; `pnpm turbo typecheck`; `pnpm -F @ludoforge/engine test`; `pnpm run check:ticket-deps`.
