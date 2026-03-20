# 15GAMAGEPOLIR-022: Introduce One Canonical Playable-Candidate Evaluator for Agents and Preview

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — shared playable-candidate evaluator, agent/preview contract unification, parity-focused regression coverage
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-011-author-baseline-fitl-policy-library-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-021-reassess-fitl-authored-policy-terminal-proof-scope.md

## Problem

Authored policy agents still sit on a fragmented generic contract:

- `completeTemplateMove()` produces decision-complete moves
- `probeMoveViability()` decides whether those moves are viable/complete enough to evaluate
- policy preview performs its own separate viability/application checks instead of consuming the same shared classification surface

That split is still an architectural problem because agents and preview compose the same legality boundary differently. It makes policy selection and preview harder to reason about, duplicates candidate classification logic, and leaves too much room for caller drift. The FITL reassessment showed why defensive re-checking exists today:

- the current bounded FITL policy regression is expensive enough that terminal-playthrough proof does not belong in the default suite yet
- naive attempts to cheapen the path by trusting completed moves or reducing policy breadth exposed legality mismatches such as `freeOperationNotGranted`

The next step is not game-specific tuning. The next step is to introduce one canonical generic playable-candidate evaluator that authored policies, previews, and builtin agents can all consume. That evaluator should centralize the existing safe contract of "template completion plus viability classification" instead of forcing each caller to reconstruct it.

## Assumption Reassessment (2026-03-19)

1. The current code already centralizes agent-side candidate preparation in `packages/engine/src/agents/prepare-playable-moves.ts`, but that helper still manually composes `completeTemplateMove()` with `probeMoveViability()` instead of exposing a single reusable contract surface.
2. `completeTemplateMove()` is not yet a trustworthy "ready for apply" contract by itself. The reassessment probe showed a decision-complete FITL move later rejected by legality checks owned by `probeMoveViability()`/`applyMove()`, including `freeOperationNotGranted`.
3. `probeMoveViability()` already captures important legality families before execution, including free-operation grant gating. The real gap is that callers still have to know when and how to pair it with completion rather than consuming one shared evaluator.
4. The current policy path is measurably expensive. The FITL authored-policy integration test passes, but the file-level run is still slow enough that terminal authored self-play is not a justified default-regression target yet.
5. No evidence from the reassessment points to FITL-authored data being the primary issue. The problem sits in generic move completion, legality classification, and agent/preview ownership boundaries.
6. The corrected scope is therefore narrower and cleaner than the original ticket text: introduce one canonical generic playable-candidate evaluator, move callers onto it, and prove parity for fully playable results. Do not force a broader legality-pipeline rewrite unless tests show the shared evaluator still disagrees with `applyMove()`.

## Architecture Check

1. One canonical playable-candidate evaluator is cleaner than the current layered guesswork because it gives every caller the same answer to the same question: "is this move actually playable now, and if so in what normalized form?"
2. The right ownership boundary is generic and engine-level. `GameSpecDoc` continues to author game-specific rules and policy data, but `GameDef`, kernel legality, simulator, and policy infrastructure stay game-agnostic.
3. The code does not currently justify a larger rewrite that merges all pre-execution legality and execution into one monolith. `applyMove()` still owns execution, state mutation, warnings, and post-execution outcome policies. The correct architectural move here is to centralize candidate classification, not to collapse execution ownership into preview/agent code.
4. This avoids hacks such as FITL-specific branches, policy-only legality exceptions, duplicated free-operation logic, or caller-specific patches in `PolicyAgent`/preview.
5. No backwards compatibility is required. If the current completion-plus-viability composition is the right pre-execution contract, promote it into one clean API and update all callers rather than preserving duplicate helper logic.
6. A canonical evaluator also creates the right long-term base for deeper policy/runtime work: once candidate normalization and classification are unified, future performance work can target one shared surface rather than several caller-specific ones.

## What to Change

### 1. Introduce one canonical playable-candidate evaluator

Add a shared kernel-owned evaluator that takes a raw legal/template move plus RNG and returns a canonical result shape for agent/runtime consumers. The result should distinguish at least:

- playable and fully normalized
- playable but stochastic-unresolved
- unplayable with structured denial reason

This evaluator should own the existing safe pre-execution contract currently recreated in callers:

- complete template decisions when possible
- run the same viability classification for the resulting move
- return the normalized move and advanced RNG only once

The target architecture is:

- template completion fills required decision bindings
- runtime legality is classified through `probeMoveViability()` semantics
- normalized playable candidates are emitted once and reused

`applyMove()` remains the executor. Modify it only if parity tests prove a real remaining mismatch that belongs at the shared legality layer.

### 2. Collapse caller-specific candidate preparation onto that contract

Refactor agent-facing helpers so `PolicyAgent`, `GreedyAgent`, `RandomAgent`, and policy preview all consume the same canonical playable-candidate evaluator instead of reassembling legality from multiple lower-level helpers.

That should include:

- replacing ad hoc `preparePlayableMoves()` completion-plus-viability composition with the new canonical result
- removing duplicated viability probing where the canonical evaluator already answers the question
- ensuring stochastic-unresolved fallback handling still uses explicit typed contract surfaces rather than hidden caller behavior
- keeping preview on the same candidate-classification semantics as agent move selection

### 3. Prove the pre-execution boundary matches `applyMove()` for fully playable candidates

Identify the specific legality families that currently escape earlier checks and only fail at `applyMove()`. The FITL reassessment already exposed free-operation grant coupling as one such family.

If a legality family still escapes the new shared evaluator and only fails at `applyMove()`, bring that check into the canonical evaluator at the proper generic layer so it fails before policy scoring and preview work, not after a move has already been selected.

This must stay generic:

- no FITL-specific action ids
- no game-specific policy exclusions
- no authored-data workaround to compensate for runtime contract gaps

Do not assume such an `applyMove()` rewrite is required up front. Only make it if the new parity tests demonstrate a remaining mismatch.

### 4. Keep policy breadth decisions secondary to the contract

Do not retune `PolicyAgent` breadth first and hope the architecture catches up later. If this refactor changes measurable cost enough to justify a breadth change, capture that in a follow-up ticket rather than silently broadening this one.

The primary deliverable here is contract unification, not breadth tuning.

### 5. Add parity and survivability regression coverage

Add tests that prove:

- fully playable candidates from the canonical evaluator cannot later fail at `applyMove()` for the same state/runtime inputs
- free-operation and similar grant-coupled legality surfaces are decided consistently before policy selection
- FITL authored-policy bounded self-play stays fallback-free and remains deterministic under the unified contract
- builtin agents and policy preview follow the same candidate-preparation semantics as `PolicyAgent`

## Files to Touch

- `packages/engine/src/kernel/` canonical playable-candidate module (new)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/src/kernel/runtime.ts` (modify)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify or remove)
- `packages/engine/src/agents/policy-agent.ts` (modify only if the new helper changes its ownership boundary)
- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/test/unit/kernel/playable-candidate.test.ts` (new)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify)
- `packages/engine/test/unit/agents/random-agent.test.ts` (modify)
- `packages/engine/test/unit/agents/greedy-agent-core.test.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify only if parity evidence proves a remaining legality mismatch)

## Out of Scope

- FITL-specific policy-data tuning unless a generic contract fix proves the authored heuristics are actually wrong
- visual presentation work or any `visual-config.yaml` changes
- terminal authored-policy proof itself
- benchmark threshold tuning beyond what is needed to compare the unified contract against the current baseline
- broad `applyMove()` execution-pipeline refactors that are not required to fix a demonstrated parity mismatch
- changing `GameSpecDoc`/`GameDef` ownership boundaries

## Acceptance Criteria

### Tests That Must Pass

1. New kernel/agent parity coverage proves a move classified as fully playable by the canonical evaluator cannot immediately fail when applied against the same state/runtime inputs.
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` proves bounded FITL authored-policy self-play remains deterministic, fallback-free, and free of apply-time legality surprises under the unified contract.
3. Builtin-agent and preview tests prove `RandomAgent`, `GreedyAgent`, `PolicyAgent`, and policy preview all use the same playable-candidate semantics.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. `GameSpecDoc` remains the place for game-specific authored rules and policy data; the playable-candidate contract lives in generic engine code only.
2. `GameDef`, kernel legality, simulator, and policy runtime remain game-agnostic.
3. There is one canonical generic answer for playable-candidate classification; callers do not each invent their own completion/viability contract.
4. No backwards-compatibility shims, alias APIs, or game-specific exception paths are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/playable-candidate.test.ts` — prove the shared evaluator classifies concrete and template candidates and that fully playable candidates keep apply-time parity.
2. `packages/engine/test/unit/agents/policy-agent.test.ts` — pin `PolicyAgent` to the canonical playable-candidate path instead of caller-specific legality layering.
3. `packages/engine/test/unit/agents/policy-preview.test.ts` — ensure preview uses the same candidate contract and does not drift from agent/runtime legality.
4. `packages/engine/test/unit/agents/random-agent.test.ts` — prove builtin random selection still consumes the canonical candidate contract correctly.
5. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` — prove builtin greedy evaluation still consumes the canonical candidate contract correctly.
6. `packages/engine/test/integration/fitl-policy-agent.test.ts` — lock the FITL bounded authored-policy regression against the legality mismatch exposed by the reassessment.
7. Additional focused regression near free-operation legality surfaces — prove grant-coupled denials are surfaced before policy selection rather than only at `applyMove()`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-completion.test.js packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/agents/random-agent.test.js packages/engine/dist/test/unit/agents/greedy-agent-core.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What changed:
  - introduced a new kernel-owned `playable-candidate` module that centralizes the pre-execution contract of template completion plus viability classification
  - moved shared agent candidate preparation onto that evaluator and kept retry semantics for multi-completion policy sampling
  - moved policy preview onto the same candidate-classification surface so preview and agents no longer reconstruct legality differently
  - added new kernel parity coverage plus updated preview/FITL policy tests to assert against the shared evaluator directly
- Deviations from original plan:
  - did not perform a broad `applyMove()` rewrite because the code and tests did not justify collapsing execution ownership into the new contract
  - did not change policy breadth defaults; the cleaner durable win here was unifying the contract surface, not retuning breadth
  - used a dedicated `playable-candidate` test file instead of overloading `move-completion.test.ts`, because the new module is a distinct architectural unit
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/unit/kernel/playable-candidate.test.js packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/agents/random-agent.test.js packages/engine/dist/test/unit/agents/greedy-agent-core.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm run check:ticket-deps` passed
