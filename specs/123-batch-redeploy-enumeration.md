# Spec 123: Parameterless Batch Action Enumeration

**Status**: Draft
**Priority**: P1
**Complexity**: M
**Dependencies**: None
**Source**: FITL ARVN agent evolution campaign — discovered during Tier 4 batch redeployment redesign

## Overview

Enable `enumerateLegalMoves` to correctly enumerate parameterless actions whose effects contain `forEach.over: { query: mapSpaces, filter: ... }` with `chooseOne`/`chooseN` completion decisions inside the loop body. Currently, these actions compile and execute correctly via `applyMove`, but `probeMoveViability` fails to classify them as viable during enumeration — they silently disappear from the legal move list.

## Problem Statement

FITL's Coup redeploy actions were redesigned from parameterized one-at-a-time moves (`params: [sourceSpace, targetSpace]`, 449 templates per decision) to batch moves. The ideal model has **zero action-level params** — the action's effects use `forEach.over: { query: mapSpaces, filter: ... }` to iterate eligible zones, with per-token `chooseOne` for destination selection.

This model:
- Compiles without errors
- Executes correctly via `applyMove` (preconditions pass, effects run, tokens move)
- Fails silently in `enumerateLegalMoves` — returns 0 moves instead of 1 viable-but-incomplete template

A hybrid workaround (keeping `sourceSpace` as a param) was deployed. This reduces template explosion (449→~75) but doesn't reduce move count (still 1 invocation per source zone).

### Root Cause

`probeMoveViability` (in `apply-move.ts`) calls `resolveMoveDecisionSequence` with `choose: () => undefined` to probe whether the action has viable decision paths. For parameterless actions:

1. The action has `params: []` → one template with `params: {}` is generated
2. The precondition evaluates correctly (checks global state, not params)
3. `resolveMoveDecisionSequence` begins executing effects
4. The first effect is `forEach.over: { query: mapSpaces, filter: ... }`
5. **Hypothesis A**: The forEach query evaluation fails or returns empty during probing because the probing context doesn't support `mapSpaces` queries in `forEach.over` (though it works in action param `domain` and `chooseOne/chooseN.options`)
6. **Hypothesis B**: The forEach produces an empty iteration (filter matches no zones in the probing state), so no `chooseOne` is encountered → the probe considers the move "complete" with no effects → treated as a no-op and filtered out

The exact failure point needs investigation. The symptom is: `probeMoveViability` returns `viable: false` (or the template is never pushed to the classified list) for a move that `applyMove` accepts as legal.

## Proposed Solution

### Investigation Phase

1. Add diagnostic logging or a test that calls `probeMoveViability` directly on a parameterless batch action template and inspects the result
2. Determine which hypothesis (A or B) is correct
3. If A: fix the probing pipeline to support `forEach.over` with `query: mapSpaces` queries
4. If B: fix the viability classification to treat "complete with no effects" as viable (matching `applyMove`'s behavior)

### Implementation (depends on investigation)

**If Hypothesis A** (forEach.over mapSpaces not supported in probing):
- Extend `resolveMoveDecisionSequence` to evaluate `forEach.over` queries during probing, the same way it evaluates `chooseOne.options` and action param `domain` queries
- This is likely a missing code path in the decision sequence resolver where `forEach` over dynamic queries (as opposed to `forEach` over binding references like `{ query: binding, name: $targetSpaces }`) is not handled

**If Hypothesis B** (empty forEach → filtered as no-op):
- Change viability classification: a move with no effects is not inherently non-viable. If the precondition passes and the move is structurally valid, it should be classified as `viable: true, complete: true` (a legal no-op)
- Alternatively, the `forEach.over` filter evaluation during probing may need the actual game state's zone contents, which it might not have in the probing context

### Deliverables

1. A failing test that demonstrates the enumeration gap (parameterless batch action with `forEach.over: mapSpaces` in effects, viable via `applyMove` but absent from `enumerateLegalMoves`)
2. Engine fix in the probing/enumeration pipeline
3. Migration of FITL's 4 Coup redeploy actions to fully parameterless batch form (currently using the `sourceSpace`-param hybrid workaround)
4. Update `fitl-coup-redeploy-phase.test.ts` and `fitl-playbook-golden.test.ts` for the parameterless format
5. Golden fixture regeneration

### What This Unlocks

With the fix, the 4 redeploy actions become parameterless batch operations:
- **1 action invocation** processes ALL eligible zones and ALL tokens within them
- Move count drops from ~75 (one per source zone) to **1** per redeploy type
- Combined with the existing template explosion fix, total Coup redeployment goes from **75+ moves × 449 templates** to **1-4 moves × 1 template each**
- FITL simulations complete within the 100-move budget, enabling multi-Coup-cycle games for agent evolution

## FOUNDATIONS Alignment

| Principle | Alignment |
|-----------|-----------|
| F1 Engine Agnosticism | Aligns — fix is in the generic enumeration pipeline, not game-specific code |
| F2 Evolution-First | Aligns — enables efficient game simulation for evolution campaigns |
| F5 One Rules Protocol | Aligns — fixes a discrepancy between `applyMove` and `enumerateLegalMoves` (both should agree on legality) |
| F7 Specs Are Data | Aligns — the fix enables a declarative YAML pattern that currently compiles but doesn't enumerate |
| F8 Determinism | Aligns — no non-deterministic behavior introduced |
| F10 Bounded Computation | Aligns — the batch pattern is still bounded (finite zones × finite tokens) |
| F15 Architectural Completeness | Aligns — addresses the root cause (probing gap) not a symptom |
| F16 Testing as Proof | Required — the fix must include a test that proves the enumeration gap is closed |

## Constraints

- No new DSL primitives — the existing `forEach.over` + `chooseOne` composition is sufficient
- The fix must be game-agnostic — any game using the same pattern must work
- `applyMove` behavior must not change — it already works correctly
- Existing tests must continue to pass
- The enumeration budget system (`maxTemplates`, `maxParamExpansions`) must still apply

## Testing Strategy

1. **Unit test**: Call `probeMoveViability` directly on a synthetic parameterless action with `forEach.over: mapSpaces` and assert `viable: true`
2. **Integration test**: Call `enumerateLegalMoves` on a state where the parameterless batch action should be legal, assert it appears in the result
3. **FITL test**: Migrate the redeploy actions to parameterless form and verify the playbook golden test still passes
4. **Property test**: Verify that for any action, `applyMove` legality implies `enumerateLegalMoves` viability (no false negatives in enumeration)
