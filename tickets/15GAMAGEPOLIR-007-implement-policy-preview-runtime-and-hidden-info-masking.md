# 15GAMAGEPOLIR-007: Implement Policy Preview Runtime and Hidden-Info Masking

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — preview runtime and visibility-safe evaluation
**Deps**: specs/15-gamespec-agent-policy-ir.md, tickets/15GAMAGEPOLIR-004-add-policy-visibility-metadata-and-canonical-seat-binding-validation.md, tickets/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md

## Problem

Spec 15 allows one-ply preview-backed heuristics, but only if preview stays deterministic, cached, and masked against hidden information. Without a dedicated preview runtime, policies either cannot express preview terms or will leak state they must not see.

## Assumption Reassessment (2026-03-19)

1. The kernel already has move application machinery, but Spec 15 explicitly forbids handing raw `applyMove` access to policy logic.
2. Preview semantics must return `unknown` for hidden/random/unresolved data and must not recurse or enumerate future legal moves.
3. Corrected scope: this ticket should add the preview runtime and wire preview-backed expressions into evaluator execution, but not broader agent/runner integration.

## Architecture Check

1. A dedicated preview module is cleaner than embedding preview behavior inside the evaluator because masking and caching are their own correctness boundary.
2. Masking preview outputs through the same generic visible-surface contract preserves support for both perfect-information and imperfect-information games.
3. No recursive preview, follow-up decision completion, or hidden-zone introspection should be allowed.

## What to Change

### 1. Implement generic preview application and caching

Add a preview service that:

- applies a concrete candidate one ply
- caches preview results per surviving candidate
- never re-enumerates legal moves

### 2. Mask preview refs through policy visibility rules

Ensure preview-exposed refs return `unknown` when they depend on:

- hidden information
- future randomness
- unresolved follow-up choices

### 3. Integrate preview-backed feature/aggregate evaluation

Enable preview cost-class work only after cheaper phases and only for surviving candidates.

## File List

- `packages/engine/src/agents/policy-preview.ts` (new)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (new)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (new)

## Out of Scope

- `PolicyAgent` factory wiring
- trace formatting and diagnostics output
- runner/CLI descriptor migration
- authored FITL/Texas baseline profiles

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-preview.test.ts` proves preview results are cached per candidate, never recurse, and never request preview legal moves.
2. `packages/engine/test/unit/property/policy-visibility.test.ts` proves two states that differ only in acting-seat-invisible hidden data produce identical policy evaluation outputs.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Preview exposes only deterministic, acting-seat-visible refs or `unknown`.
2. Preview evaluation is lazy and only runs for surviving candidates.
3. Hidden information unavailable to the acting seat cannot change pruning, scores, tie-breaks, or the selected move.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — preview caching and forbidden-behavior coverage.
2. `packages/engine/test/unit/property/policy-visibility.test.ts` — hidden-information invariance.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`
