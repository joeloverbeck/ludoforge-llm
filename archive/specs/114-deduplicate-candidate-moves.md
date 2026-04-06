# Spec 114 — Deduplicate Playable Moves by stableMoveKey

**Status**: COMPLETED

## Priority

High

## Complexity

Small

## Dependencies

None.

## Problem

The PolicyAgent candidate list contains duplicate moves with identical `stableMoveKey` values. In a FITL VC decision point with 15 unique classified moves, the candidate list contains 31 entries — nearly half are duplicates. This was discovered during the fitl-vc-agent-evolution campaign (2026-04-05).

### Root Cause

The `preparePlayableMoves()` function (`packages/engine/src/agents/prepare-playable-moves.ts`) can encounter duplicate `stableMoveKey` values at two layers:

1. duplicate classified input moves arriving in `input.legalMoves`
2. duplicate playable outputs emitted after direct completion or template completion

`114DEDCANMOV-001` addressed the first layer. A live reassessment on 2026-04-06 proved the cited FITL incidence still survived at the second layer: the VC seed-`6` reproducer produced `21` classified moves, `41` completed moves, and only `31` unique completed `stableMoveKey` values. The template completion system legitimately explores multiple completion paths, but some of those paths converge on identical move identities, so emitted playable outputs also need deterministic deduplication.

Evidence from traces and live reproduction:
- Earlier campaign traces showed duplicate candidate rows with identical `stableMoveKey` values
- On 2026-04-06, the current FITL VC seed-`6` reproducer reported `duplicatesRemoved = 0`, `completedMoves = 41`, and `uniqueCompletedMoveKeys = 31` before the output-layer fix
- Duplicates had `previewOutcome: undefined` while the original had `previewOutcome: ready` because preview work followed first occurrence ordering

### Impact

1. **Preview evaluation waste**: Only unique candidates get previewed (18 of 31). Duplicates skip preview and receive fallback scores, creating misleading `preview: undefined` entries in traces.
2. **Normalized scoring distortion**: `min`/`max` candidate aggregates operate over all candidates including duplicates. When duplicates have different scores (preview vs fallback), the aggregate range is artificially compressed.
3. **Tiebreaker pollution**: More candidates to tie-break among, with identical-scoring duplicates adding noise.
4. **Performance cost**: Template completion, candidate feature evaluation, and consideration scoring run on duplicates that produce no new information.

## Goals

1. Deduplicate playable outputs by `stableMoveKey` before scoring
2. Preserve the first (preview-evaluated) instance of each duplicate
3. No behavioral change for games without duplicate candidates

## Non-Goals

- Changing the template completion system (that's a separate concern — it may legitimately explore multiple paths)
- Changing how `stableMoveKey` is computed
- Changing preview caching behavior

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| 1 — Engine Agnosticism | Deduplication is generic — applies to any game with template-completed moves |
| 8 — Determinism | Deduplication is deterministic — same candidates always produce same unique set |
| 10 — Bounded Computation | Reduces wasted computation on duplicate candidates |
| 15 — Architectural Completeness | Fixes the root cause (missing dedup step) rather than papering over symptoms |

## Scope

### What to Change

**1. Deduplicate both classified inputs and emitted playable outputs in `preparePlayableMoves()`** (`prepare-playable-moves.ts`)

The function should maintain deterministic first-occurrence handling at both layers:

- a classified-input guard on `input.legalMoves` so obviously repeated classified moves are skipped early
- an emitted-output guard on completed/stochastic playable moves so duplicate `stableMoveKey` values produced by direct completion or template completion are not appended twice

The emitted-output guard is the decisive fix for the cited FITL incidence:

```typescript
const seenMoveKeys = new Set<string>();
const emittedPlayableMoveKeys = new Set<string>();
let duplicatesRemoved = 0;

for (const classified of input.legalMoves) {
  const { move, viability } = classified;
  const stableMoveKey = toMoveIdentityKey(input.def, move);

  if (seenMoveKeys.has(stableMoveKey)) {
    duplicatesRemoved += 1;
    movePreparations.push({
      actionId: String(move.actionId),
      stableMoveKey,
      initialClassification: 'rejected',
      finalClassification: 'rejected',
      enteredTrustedMoveIndex: false,
      skippedAsDuplicate: true,
    });
    continue;
  }
  seenMoveKeys.add(stableMoveKey);

  const recordPlayableMove = (
    trustedMove: TrustedExecutableMove,
    classification: 'complete' | 'stochastic',
  ): boolean => {
    const emittedStableMoveKey = toMoveIdentityKey(input.def, trustedMove.move);
    if (emittedPlayableMoveKeys.has(emittedStableMoveKey)) {
      duplicatesRemoved += 1;
      return false;
    }
    emittedPlayableMoveKeys.add(emittedStableMoveKey);
    // append to completedMoves or stochasticMoves
    return true;
  };

  // ... viability / completion logic routes all emitted outputs through recordPlayableMove ...
}
```

This keeps first-occurrence behavior deterministic at both layers. Duplicate classified inputs are skipped before deeper work. Duplicate playable outputs are skipped at append time even when multiple completion paths converge on the same move identity.

**2. Add diagnostic tracking**

Add a required `duplicatesRemoved: number` field to `PolicyCompletionStatistics`. Value is 0 when no duplicates exist — never optional. Include in the statistics object returned by `preparePlayableMoves()`.

Add an optional `skippedAsDuplicate?: boolean` field to `PolicyMovePreparationTrace`. When `true`, indicates this move preparation was skipped because an earlier move with the same `stableMoveKey` was already processed. This preserves full diagnostic visibility — traces show which moves were deduped and why.

**3. Verify preview cache coherence**

After deduplication, all remaining candidates should have valid preview results (if preview is enabled). The "first occurrence" heuristic works because preview processing follows candidate order.

### Mutable Files

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify) — add deterministic deduplication at classified-input and emitted-playable-output layers
- `packages/engine/src/kernel/types-core.ts` (modify) — add required `duplicatesRemoved` to `PolicyCompletionStatistics`; add optional `skippedAsDuplicate` to `PolicyMovePreparationTrace`
- `packages/engine/src/kernel/schemas-core.ts` (modify) — update schemas for both new fields

### Immutable

- Template completion system — not changed
- Preview system — not changed
- Scoring system — not changed

## Testing Strategy

1. **Unit test: classified-input deduplication removes identical stableMoveKeys** — Create candidates with duplicate keys. Assert only unique candidates survive. Assert the first occurrence is preserved.

2. **Unit test: no duplicates means no change** — Candidates with all-unique keys pass through unchanged.

3. **Integration test: FITL decision point emitted-output deduplication** — Run a FITL game to a known decision point. Assert no duplicate `stableMoveKey` values exist among emitted playable outputs. Assert `completionStatistics.duplicatesRemoved > 0` for games known to produce duplicates (e.g., FITL VC decisions). Assert selected move and score are identical or improved compared to pre-dedup baseline.

4. **Regression test: golden trace update** — Expect golden traces to change (fewer candidates per decision). Verify scores and selected moves are identical or improved.

## Expected Impact

Reduces candidate list sizes in games with heavy template completion (like FITL). Eliminates misleading `preview: undefined` entries. Improves normalized scoring accuracy by removing duplicate data points from aggregates. May slightly improve agent decision quality and reduce per-decision computation time.

## Outcome

- Completed: 2026-04-06
- What changed:
  - `preparePlayableMoves()` now deduplicates both repeated classified inputs and repeated emitted playable outputs by `stableMoveKey`, with the output-layer guard covering the live FITL duplicate incidence.
  - The diagnostics contract introduced in the ticket series now records duplicate skips through `duplicatesRemoved` and `skippedAsDuplicate`.
  - The spec itself was corrected before implementation to reflect the verified two-layer duplicate model rather than the earlier input-layer-only assumption.
- Deviations from original plan:
  - The original spec assumption that the cited FITL duplicate incidence lived entirely in pre-completion candidate handling was wrong. Live reassessment on 2026-04-06 showed the seed-`6` VC reproducer still had `41` completed moves with only `31` unique completed keys after input-layer dedup, so the final fix point moved to emitted playable outputs.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test --test-name-pattern "deduplicates post-template-completion playable outputs" dist/test/integration/fitl-policy-agent.test.js`
  - `node --test dist/test/integration/fitl-policy-agent.test.js`
  - `node --test dist/test/unit/prepare-playable-moves.test.js dist/test/unit/agents/policy-agent.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm run check:ticket-deps`
