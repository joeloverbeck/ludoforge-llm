# 15GAMAGEPOLIR-006: Implement Policy Evaluator Core for Pruning, Scoring, and Tie-Breaks

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy evaluator core
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-003-add-policy-expression-dsl-typechecking-and-dag-validation.md, tickets/15GAMAGEPOLIR-005-add-agentpolicycatalog-runtime-ir-schema-and-fingerprints.md

## Problem

The compiled policy IR is not useful until the engine can deterministically evaluate concrete legal moves. The core evaluator must handle canonical ordering, feature evaluation, pruning, scoring, and tie-break resolution without preview first.

## Assumption Reassessment (2026-03-19)

1. The engine already has built-in random/greedy agents, but Spec 15 requires a generic one-ply evaluator over concrete legal moves instead of hardcoded procedural heuristics.
2. Determinism and input-order invariance are first-order requirements, so canonical stable-key ordering must be part of the evaluator contract from the start.
3. Corrected scope: this ticket should implement the non-preview evaluator core. Preview-backed refs and masking remain for the next ticket.

## Architecture Check

1. Building the evaluator around compiled IR and legal moves is cleaner than coupling it to game-specific state probes.
2. Separating preview from the non-preview core keeps performance and correctness reviewable in smaller diffs.
3. No template move completion, legal-move re-enumeration, or search behavior should be added.

## What to Change

### 1. Implement deterministic candidate canonicalization

Add stable candidate ordering using canonical move serialization and enforce that evaluator logic starts from this canonical order.

### 2. Implement non-preview feature, aggregate, pruning, score, and tie-break execution

Support:

- state features
- candidate features without preview refs
- candidate aggregates over the current candidate set
- ordered pruning rules with `skipRule` and `error`
- score term accumulation
- deterministic tie-breaker resolution including `stableMoveKey`

### 3. Add emergency fallback and evaluator result metadata

If evaluation fails, return the canonical first legal move and surface structured failure metadata for later tracing.

## File List

- `packages/engine/src/agents/policy-eval.ts` (new)
- `packages/engine/src/agents/policy-expr.ts` (modify if evaluator helpers are shared)
- `packages/engine/src/kernel/move-identity.ts` (modify if needed for stable move keys)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (new)
- `packages/engine/test/unit/property/policy-determinism.test.ts` (new)

## Out of Scope

- preview execution and masking
- agent factory/descriptor integration
- trace-event formatting
- runner/CLI/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-agent.test.ts` proves pruning `onEmpty` semantics, score accumulation, tie-break ordering, and emergency fallback behavior.
2. `packages/engine/test/unit/property/policy-determinism.test.ts` proves permuting `legalMoves` does not change the selected move except through canonical RNG behavior with the same seed.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. V1 evaluates only the provided concrete legal moves and never completes templates or expands search.
2. Candidate aggregates remain bounded to `O(n)` over the current candidate set.
3. The same visible decision surface and same seed produce the same evaluator result.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — evaluator semantics without preview.
2. `packages/engine/test/unit/property/policy-determinism.test.ts` — order invariance and deterministic replay.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`
