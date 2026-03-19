# 15GAMAGEPOLIR-022: Unify Policy Playable-Candidate Contract Across Completion, Viability, and Apply

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel legality/completion contract unification, shared agent candidate-preparation refactor, policy/runtime regression coverage
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-011-author-baseline-fitl-policy-library-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-021-reassess-fitl-authored-policy-terminal-proof-scope.md

## Problem

Authored policy agents still sit on a fragmented generic contract:

- `completeTemplateMove()` produces decision-complete moves
- `probeMoveViability()` decides whether those moves are viable/complete enough to evaluate
- `applyMove()` remains the final authority and can still reject moves that passed the earlier stages

That split is now the main architectural blocker to clean authored-policy scalability. It makes policy selection expensive, because agents must defensively re-check moves, and it is brittle, because the three stages are not yet guaranteed to agree on legality. The FITL reassessment showed both failure modes directly:

- the current bounded FITL policy regression is expensive enough that terminal-playthrough proof does not belong in the default suite yet
- naive attempts to cheapen the path by trusting completed moves or reducing policy breadth exposed legality mismatches such as `freeOperationNotGranted`

The next step is not game-specific tuning. The next step is to replace the split legality pipeline with one canonical generic playable-candidate contract that authored policies, previews, and builtin agents can all consume.

## Assumption Reassessment (2026-03-19)

1. The current code already centralizes agent-side candidate preparation in `packages/engine/src/agents/prepare-playable-moves.ts`, but that helper still depends on separate completion and viability phases that are not strong enough to stand alone.
2. `completeTemplateMove()` is not yet a trustworthy “ready for apply” contract by itself. The reassessment probe showed a decision-complete FITL move later rejected by `applyMove()` with `freeOperationNotGranted`.
3. `probeMoveViability()` is also not the final contract today, because agent architecture still has to preserve defensive layering around it instead of treating it as the single source of truth for playable candidates.
4. The current policy path is measurably expensive. The FITL authored-policy integration test passes, but the file-level run is slow enough that terminal authored self-play is not a justified default-regression target yet.
5. No evidence from the reassessment points to FITL-authored data being the primary issue. The problem sits in generic move completion, legality, and agent-preparation ownership.
6. The corrected scope is therefore generic engine architecture: unify legality/completion/application around one canonical playable-candidate boundary, then let policy-agent cost reductions and stronger survivability proofs follow from that boundary.

## Architecture Check

1. One canonical playable-candidate contract is cleaner than the current layered guesswork because it gives every caller the same answer to the same question: “is this move actually playable now, and if so in what normalized form?”
2. The right ownership boundary is generic and engine-level. `GameSpecDoc` continues to author game-specific rules and policy data, but `GameDef`, kernel legality, simulator, and policy infrastructure stay game-agnostic.
3. This avoids hacks such as FITL-specific branches, policy-only legality exceptions, duplicated free-operation logic, or caller-specific patches in `PolicyAgent`.
4. No backwards compatibility is required. If the current completion/viability API split is the wrong architecture, replace it cleanly and update all callers rather than adding aliases or legacy fallback paths.
5. A canonical contract also creates the right long-term base for terminal authored-policy regression: once legality and normalization are unified, policy agents can get cheaper without sacrificing correctness.

## What to Change

### 1. Introduce one canonical playable-candidate evaluator

Add a shared kernel-owned evaluator that takes a raw legal/template move and returns a canonical result shape for agent/runtime consumers. The result should distinguish at least:

- playable and fully normalized
- playable but stochastic-unresolved
- unplayable with structured denial reason

This evaluator must own the legality facts that currently drift across `completeTemplateMove()`, `probeMoveViability()`, and `applyMove()`.

The target architecture is:

- template completion fills required decision bindings
- runtime legality is checked against the same rule set `applyMove()` enforces
- normalized playable candidates are emitted once and reused

### 2. Collapse caller-specific candidate preparation onto that contract

Refactor agent-facing helpers so `PolicyAgent`, `GreedyAgent`, `RandomAgent`, and policy preview all consume the same canonical playable-candidate evaluator instead of reassembling legality from multiple lower-level helpers.

That should include:

- replacing ad hoc `preparePlayableMoves()` assumptions with the new canonical result
- removing duplicated viability probing where the canonical evaluator already answers the question
- ensuring stochastic-unresolved fallback handling still uses explicit typed contract surfaces rather than hidden caller behavior

### 3. Move legality mismatch ownership out of `applyMove()`-only surprises

Identify the specific legality families that currently escape earlier checks and only fail at `applyMove()`. The FITL reassessment already exposed free-operation grant coupling as one such family.

Bring those checks into the canonical playable-candidate evaluator at the proper generic layer so they fail before policy scoring and preview work, not after a move has already been selected.

This must stay generic:

- no FITL-specific action ids
- no game-specific policy exclusions
- no authored-data workaround to compensate for runtime contract gaps

### 4. Reassess policy breadth only after the contract is unified

Once the canonical playable-candidate evaluator exists, re-measure `PolicyAgent` breadth defaults and candidate cost against the new contract. Only then decide whether the default breadth should shrink, stay as-is, or move behind explicit configuration.

Do not change the default breadth first and hope the architecture catches up later.

### 5. Add parity and survivability regression coverage

Add tests that prove:

- completed playable candidates cannot later fail at `applyMove()` for the same state/runtime inputs
- free-operation and similar grant-coupled legality surfaces are decided consistently before policy selection
- FITL authored-policy bounded self-play stays fallback-free and remains deterministic under the unified contract
- builtin agents and policy preview follow the same candidate-preparation semantics as `PolicyAgent`

## Files to Touch

- `packages/engine/src/kernel/` canonical playable-candidate module (new)
- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify or remove)
- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/test/unit/kernel/move-completion.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)
- `packages/engine/test/integration/sim/simulator.test.ts` (modify only if simulator-facing contract assertions need to move)

## Out of Scope

- FITL-specific policy-data tuning unless a generic contract fix proves the authored heuristics are actually wrong
- visual presentation work or any `visual-config.yaml` changes
- terminal authored-policy proof itself
- benchmark threshold tuning beyond what is needed to compare the unified contract against the current baseline
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
3. There is one canonical generic answer for playable-candidate classification; callers do not each invent their own completion/viability/apply contract.
4. No backwards-compatibility shims, alias APIs, or game-specific exception paths are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-completion.test.ts` — prove the unified contract distinguishes fully playable, stochastic-unresolved, and rejected candidates with apply-time parity.
2. `packages/engine/test/unit/agents/policy-agent.test.ts` — pin `PolicyAgent` to the canonical playable-candidate path instead of caller-specific legality layering.
3. `packages/engine/test/unit/agents/policy-preview.test.ts` — ensure preview uses the same candidate contract and does not drift from agent/runtime legality.
4. `packages/engine/test/integration/fitl-policy-agent.test.ts` — lock the FITL bounded authored-policy regression against the legality mismatch exposed by the reassessment.
5. Additional focused regression near free-operation legality surfaces — prove grant-coupled denials are surfaced before policy selection rather than only at `applyMove()`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/kernel/move-completion.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`
