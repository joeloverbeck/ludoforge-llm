# Spec 114 — Deduplicate Candidate Moves by stableMoveKey

## Status

Proposed

## Priority

High

## Complexity

Small

## Dependencies

None.

## Problem

The PolicyAgent candidate list contains duplicate moves with identical `stableMoveKey` values. In a FITL VC decision point with 15 unique classified moves, the candidate list contains 31 entries — nearly half are duplicates. This was discovered during the fitl-vc-agent-evolution campaign (2026-04-05).

### Root Cause

The `preparePlayableMoves()` function (`packages/engine/src/agents/prepare-playable-moves.ts`) generates candidates via template completion. The template completion system tries multiple completion paths for parameterized moves. Some paths produce moves with identical stableMoveKeys (same action, same parameters, same decision resolutions) via different internal completion routes. No deduplication step filters these out.

Evidence from traces:
- `completionStatistics.templateCompletionSuccesses = 24` but `totalClassifiedMoves = 15`
- 31 total candidates in the list, many with identical stableMoveKeys
- Duplicates have `previewOutcome: undefined` while the original has `previewOutcome: ready` — the preview cache returns a result for the first occurrence but duplicates don't pick it up

### Impact

1. **Preview evaluation waste**: Only unique candidates get previewed (18 of 31). Duplicates skip preview and receive fallback scores, creating misleading `preview: undefined` entries in traces.
2. **Normalized scoring distortion**: `min`/`max` candidate aggregates operate over all candidates including duplicates. When duplicates have different scores (preview vs fallback), the aggregate range is artificially compressed.
3. **Tiebreaker pollution**: More candidates to tie-break among, with identical-scoring duplicates adding noise.
4. **Performance cost**: Template completion, candidate feature evaluation, and consideration scoring run on duplicates that produce no new information.

## Goals

1. Deduplicate candidates by `stableMoveKey` after template completion and before scoring
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

**1. Add deduplication step in `preparePlayableMoves()`** (`prepare-playable-moves.ts`)

After template completion produces the candidate list and before candidates are returned:

```typescript
// Deduplicate by stableMoveKey — keep first occurrence (has preview result)
const seen = new Set<string>();
const uniqueCandidates = candidates.filter(candidate => {
  if (seen.has(candidate.stableMoveKey)) return false;
  seen.add(candidate.stableMoveKey);
  return true;
});
```

**2. Add diagnostic tracking**

Track the number of duplicates removed in the completion statistics:
- `duplicatesRemoved: number` — how many candidates were filtered out

**3. Verify preview cache coherence**

After deduplication, all remaining candidates should have valid preview results (if preview is enabled). The "first occurrence" heuristic works because the preview cache processes candidates in order.

### Mutable Files

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify) — add deduplication step
- `packages/engine/src/kernel/types-core.ts` (modify) — add `duplicatesRemoved` to completion statistics type (if not already optional)
- `packages/engine/src/kernel/schemas-core.ts` (modify) — update schema for new field

### Immutable

- Template completion system — not changed
- Preview system — not changed
- Scoring system — not changed

## Testing Strategy

1. **Unit test: deduplication removes identical stableMoveKeys** — Create candidates with duplicate keys. Assert only unique candidates survive. Assert the first occurrence is preserved.

2. **Unit test: no duplicates means no change** — Candidates with all-unique keys pass through unchanged.

3. **Integration test: FITL decision point candidate count** — Run a FITL game to a known decision point. Assert `candidates.length === completionStatistics.totalClassifiedMoves` (no duplicates).

4. **Regression test: golden trace update** — Expect golden traces to change (fewer candidates per decision). Verify scores and selected moves are identical or improved.

## Expected Impact

Reduces candidate list sizes by ~40% in games with heavy template completion (like FITL). Eliminates misleading `preview: undefined` entries. Improves normalized scoring accuracy by removing duplicate data points from aggregates. May slightly improve agent decision quality and reduce per-decision computation time.
