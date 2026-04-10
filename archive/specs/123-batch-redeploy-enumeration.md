# Spec 123: Parameterless Batch Action Enumeration

**Status**: REJECTED
**Priority**: P1
**Complexity**: M
**Dependencies**: None
**Source**: FITL ARVN agent evolution campaign — discovered during Tier 4 batch redeployment redesign

## Archival Note

Rejected on 2026-04-10 after `archive/tickets/123BATREDENU-001.md` verified that the claimed parameterless redeploy probing gap is not reproducible on current `main`. The spec's root cause and implementation plan depend on a stale premise.

## Overview

Enable `enumerateLegalMoves` to correctly enumerate parameterless actions whose effects contain nested `forEach` loops with `chooseOne`/`chooseN` completion decisions inside the loop body. Currently, these actions compile and execute correctly via `applyMove`, but the probing pipeline fails to discover decisions embedded inside `forEach` effects — they silently disappear from the legal move list.

## Problem Statement

FITL's Coup redeploy actions were redesigned from parameterized one-at-a-time moves (`params: [sourceSpace, targetSpace]`) to batch moves. The ideal model has **zero action-level params** — the action's effects use a two-level `forEach` structure:

1. Outer `forEach.over: { query: mapSpaces, filter: ... }` iterates eligible zones
2. Inner `forEach.over: { query: tokensInZone, zone: $zone }` iterates tokens in each zone
3. `chooseOne` inside the inner loop selects a destination per token
4. `moveToken` executes the move

This model:
- Compiles without errors
- Executes correctly via `applyMove` (preconditions pass, effects run, tokens move)
- Fails silently in `enumerateLegalMoves` — returns 0 moves instead of 1 viable-but-incomplete template

A hybrid workaround (keeping `sourceSpace` as a param) was deployed. The current hybrid uses `sourceSpace` param with a single-level `forEach.over: { query: tokensInZone, zone: sourceSpace }` + `chooseOne` for destination selection. This produces one move per eligible source zone but doesn't achieve the parameterless ideal of one move per action.

### Root Cause (Confirmed)

The probing pipeline does not traverse `forEach` loop bodies. When `probeMoveViability` (in `apply-move.ts`) probes a parameterless action:

1. The action has `params: []` → one template with `params: {}` is generated
2. The precondition evaluates correctly (checks global state, not params)
3. The template enters the **non-pipeline enumeration path** (`enumerateParams` at line 1334 in `legal-moves.ts`) because parameterless actions have no `ActionPipelineDef`
4. The satisfiability check follows this call chain:
   - `isMoveDecisionSequenceAdmittedForLegalMove`
   - → `classifyMoveDecisionSequenceSatisfiability`
   - → `resolveMoveDecisionSequence` (in `move-decision-sequence.ts`)
   - → `legalChoicesDiscover` (line 89)
5. `legalChoicesDiscover` does **not** instantiate `forEach` loop bodies — it only discovers decisions from the immediate effect layer
6. No `chooseOne` is discovered → the probe returns "complete" with no decisions → treated as a no-op → filtered out

**Why `applyMove` works**: The execution path in `effects-control.ts` (lines 144-231) fully evaluates `forEach` loops, discovering and resolving all choices including those nested inside loops.

**Pipeline vs non-pipeline distinction**: The pipeline path (lines 1371-1382 in `legal-moves.ts`) already includes an optimization that **skips the expensive probe** for `compilable: false` first decisions — pushing moves directly. The current hybrid redeploy actions go through the pipeline path because they have params with domains. Converting to parameterless removes the pipeline routing, sending actions through the non-pipeline path where the probe fails.

## Proposed Solution

### Investigation Phase

1. Add a diagnostic test that calls `probeMoveViability` directly on a parameterless batch action template and confirms the probing gap: the probe returns "complete" despite embedded `forEach` decisions
2. Confirm that fixing `legalChoicesDiscover` to traverse `forEach` loop bodies doesn't violate F10 (Bounded Computation) — the iteration is bounded by finite zone/token collections, same as the execution path

### Implementation

Fix `legalChoicesDiscover` to traverse `forEach` loop bodies during probing, so decisions embedded inside `forEach` are discovered. This is the root cause fix aligned with F15 (Architectural Completeness) — it addresses the design gap in the probing pipeline rather than routing around it via pipeline compatibility or a special-case fast path.

The fix must:
- Evaluate `forEach.over` queries during probing to determine the iteration set
- Enter the loop body to discover decisions (e.g., `chooseOne`, `chooseN`) within the first iteration
- Respect F10 bounded computation — forEach iterates over finite collections
- Not change `applyMove` behavior (it already works correctly)
- Be game-agnostic — any game using `forEach` + embedded decisions must work

### Deliverables

1. A failing test that demonstrates the enumeration gap (parameterless batch action with nested `forEach.over` + `chooseOne` in effects, viable via `applyMove` but absent from `enumerateLegalMoves`)
2. Engine fix in `legalChoicesDiscover` to traverse `forEach` loop bodies during probing
3. Migration of FITL's 4 Coup redeploy actions to fully parameterless batch form (currently using the `sourceSpace`-param hybrid workaround)
4. Update `fitl-coup-redeploy-phase.test.ts` and `fitl-playbook-golden.test.ts` for the parameterless format
5. Golden fixture regeneration

### What This Unlocks

With the fix, the 4 redeploy actions become parameterless batch operations:
- **1 action invocation** processes ALL eligible zones and ALL tokens within them
- Move count drops from one move per eligible source zone (hybrid) to **1 move per redeploy type** (parameterless)
- The exact move reduction depends on game state — the YAML comment at line 599-601 of `30-rules-actions.md` notes "Converts 75+ individual moves into ~10 (one per source zone)" for the hybrid; the parameterless fix reduces this further to 1-4 moves total (one per action type)
- FITL simulations complete within the 100-move budget, enabling multi-Coup-cycle games for agent evolution

## FOUNDATIONS Alignment

| Principle | Alignment |
|-----------|-----------|
| F1 Engine Agnosticism | Aligns — fix is in the generic enumeration pipeline, not game-specific code |
| F2 Evolution-First | Aligns — enables efficient game simulation for evolution campaigns |
| F5 One Rules Protocol | Aligns — fixes a discrepancy between `applyMove` and `enumerateLegalMoves` (both should agree on legality) |
| F7 Specs Are Data | Aligns — fixes a declarative YAML pattern that currently compiles but doesn't enumerate |
| F8 Determinism | Aligns — no non-deterministic behavior introduced |
| F10 Bounded Computation | Aligns — the batch pattern is still bounded (finite zones × finite tokens); investigation must confirm probing traversal respects this |
| F15 Architectural Completeness | Aligns — addresses the root cause (probing gap in `legalChoicesDiscover`) not a symptom |
| F16 Testing as Proof | Required — the fix must include a test that proves the enumeration gap is closed |

## Constraints

- No new DSL primitives — the existing `forEach.over` + `chooseOne` composition is sufficient
- The fix must be game-agnostic — any game using the same pattern must work
- `applyMove` behavior must not change — it already works correctly
- Existing tests must continue to pass
- The enumeration budget system (`maxTemplates`, `maxParamExpansions`) must still apply

## Testing Strategy

1. **Unit test**: Call probing infrastructure on a synthetic parameterless action with `forEach.over` containing a `chooseOne`, and assert the decision is discovered (not classified as "complete with no effects")
2. **Integration test**: Call `enumerateLegalMoves` on a state where the parameterless batch action should be legal, assert it appears in the result
3. **FITL test**: Migrate the redeploy actions to parameterless form and verify the playbook golden test still passes
4. **Property test**: Verify that for any action, `applyMove` legality implies `enumerateLegalMoves` viability (no false negatives in enumeration)
