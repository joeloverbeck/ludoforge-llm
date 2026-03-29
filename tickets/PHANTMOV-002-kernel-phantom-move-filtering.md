# PHANTMOV-002: Filter phantom template moves from legal move enumeration

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/src/kernel/playable-candidate.ts`
**Deps**: archive/tickets/PHANTMOV/PHANTMOV-001-simulator-defensive-catch.md

## Problem

`enumerateLegalMoves` returns template moves with optimistic viability checks
that pass at the template level but fail when the template is completed with
concrete zone/token selections. These are "phantom legal moves" — they appear
legal but cannot be played.

Root cause: the viability check for incomplete template moves (`viable: true,
complete: false`) evaluates preconditions on the template skeleton, not on any
concrete completion. For free operations with zone filters, the template has no
target-zone selections yet, so the zone filter passes vacuously. When the agent
later tries to complete the template with specific zones, the zone filter
rejects every completion.

This violates FOUNDATIONS.md #6: "Legal moves must be listable" and "All choices
MUST be finite and enumerable." A move that cannot be completed to a viable
concrete move is not truly enumerable.

Reproduction: FITL seed 1009, move 3 — NVA `rally` free operation template
passes optimistic viability but all concrete completions fail.

## Assumption Reassessment (2026-03-29)

1. `enumerateLegalMoves` returns `ClassifiedMove[]` where viability is checked
   via `probeMoveViability`. Confirmed in `legal-moves.ts`.
2. Template moves (incomplete) get optimistic viability: the kernel checks if
   the action pipeline *could* produce a viable move, but doesn't enumerate
   completions. Confirmed.
3. `evaluatePlayableMoveCandidate` in `playable-candidate.ts` does completion
   + re-check, but this is called by agents, not by `enumerateLegalMoves`.
4. The gap: enumeration is optimistic, completion is pessimistic. No
   reconciliation between the two.

## Architecture Check

1. The fix adds a post-enumeration filter: after collecting template moves,
   attempt at least 1 completion for each. If zero completions are viable,
   exclude the template from the returned legal moves. This makes enumeration
   truthful — only moves that can actually be played are reported.
2. Game-agnostic: the filter operates on the generic template completion
   machinery, not on any game-specific logic.
3. Performance concern: completion attempts are expensive (they involve
   `probeMoveViability` re-checks). Mitigation: only attempt 1 completion per
   template (not 3). If 1 random completion succeeds, the template is viable.
   If it fails, try 1 more with a different RNG seed. If both fail, filter it.
   This adds ~2 completion attempts per template move in the worst case.
4. Determinism: the filtering must be deterministic. Use a derived RNG from the
   game state seed for completion attempts, not the agent's RNG.

## What to Change

### 1. Post-enumeration phantom filtering

In the legal moves pipeline (either at the end of `enumerateLegalMoves` or as
a new composable filter), add a step that:

1. Identifies template moves (`viable: true, complete: false`)
2. For each, attempts completion with a deterministic RNG derived from stateHash
3. If at least 1 completion produces a viable concrete move, keep it
4. If zero completions are viable after K attempts (K=2), remove it from results

### 2. Alternative: viability probe enhancement

Instead of post-filtering, enhance `probeMoveViability` for template moves to
include a "can any completion succeed?" check. This would make the viability
check truthful at the source rather than filtering after the fact.

Trade-off: more invasive change to the viability probe, but eliminates the
disconnect between template viability and completion viability.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify — add filter)
- `packages/engine/src/kernel/playable-candidate.ts` (modify — expose helpers)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (new test cases)
- `packages/engine/test/unit/playable-candidate.test.ts` (new test cases)

## Out of Scope

- Changing the Agent interface
- Changing template completion logic itself (only filtering based on it)
- Optimizing template completion performance (separate concern)

## Acceptance Criteria

### Tests That Must Pass

1. FITL seed 1009 produces zero legal moves at move 3 (phantom rally filtered)
   rather than 1 phantom legal move
2. All FITL seeds that currently work produce identical results (no false
   filtering of viable templates)
3. Texas Hold'em seeds produce identical results (no regression)
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Determinism: filtering uses deterministic RNG, same seed = same filter results
2. Every move in `enumerateLegalMoves` result can be completed to a viable move
3. No game-specific logic in kernel
4. Performance: <=2 completion attempts per template move (bounded cost)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/phantom-move-filtering.test.ts` — test
   that templates with no viable completions are excluded from legal moves
2. `packages/engine/test/integration/fitl-seed-1009-phantom.test.ts` — FITL
   regression test for the specific seed that exposed this bug

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. Campaign harness: `bash campaigns/fitl-vc-agent-evolution/harness.sh`
