# KERMOVECOMP-001: Promote move-template completion to kernel API boundary

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `kernel` API extraction, `agents` consumers, tests
**Deps**: EVEINTCHOPRO-005

## Problem

Template completion currently lives in `agents/template-completion.ts`, but non-agent callers (integration tests, harnesses, future runner/simulator flows) also need this generic move-completion behavior. Keeping completion in the agent layer creates a boundary leak and couples protocol-level engine behavior to a strategy module.

## Assumption Reassessment (2026-02-24)

1. `completeTemplateMove` uses only game-agnostic kernel primitives (`legalChoicesEvaluate`, choice-option policy, PRNG) and contains no strategy-specific or game-specific logic.
2. Engine integration tests currently import completion from the agent module (`packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`), which indicates a layering mismatch.
3. Kernel public export surface (`packages/engine/src/kernel/index.ts`) does not currently expose a first-class move-completion helper.

## Architecture Check

1. Moving completion into kernel clarifies ownership: protocol completion is runtime/legal-choice machinery, not agent strategy.
2. This strengthens the `GameSpecDoc` vs `GameDef` agnostic boundary by keeping generic move-resolution behavior in shared engine runtime APIs.
3. No backwards-compatibility aliases/shims: migrate imports directly to kernel path and remove agent-level export for completion utilities.

## What to Change

### 1. Create kernel-level move completion module

Add a kernel module (for example `packages/engine/src/kernel/move-completion.ts`) exposing:
- `completeMoveTemplate` (or equivalent canonical name)
- optional helper(s) needed by callers for explicit completion flow

Keep implementation generic and reusable across agents, simulator, tests, and runner bridge logic.

### 2. Rewire agent consumers to kernel completion API

Update `RandomAgent` and `GreedyAgent` to import/use the kernel helper instead of agent-local completion implementation.

### 3. Migrate non-agent callers and tighten module boundaries

Update integration/unit tests currently importing from `agents/template-completion.ts` to kernel import path.
Remove or deprecate agent module export of completion helper in this same ticket (no compatibility aliasing).

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/src/agents/template-completion.ts` (delete or reduce to agent-specific-only content)
- `packages/engine/src/agents/index.ts` (modify)
- `packages/engine/test/unit/agents/template-completion.test.ts` (modify; move/rename if needed)
- `packages/engine/test/integration/decision-sequence.test.ts` (modify imports)
- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` (modify imports)

## Out of Scope

- New event UX/runner prompt flows.
- Decision-quality heuristics for agents.
- Changes to `GameSpecDoc` schemas or game content payloads.

## Acceptance Criteria

### Tests That Must Pass

1. Kernel-level completion helper covers existing template-completion behavior (pending loops, chooseOne/chooseN handling, unsatisfiable -> null).
2. Agents continue to return apply-safe completed moves under event-template and profile-template scenarios.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. `GameDef`, simulation, and kernel remain game-agnostic (no game-specific identifiers or branches).
2. Deterministic replayability remains unchanged for same seed and same move-selection policy.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-completion.test.ts` (new or moved) — kernel ownership and behavior coverage.
2. `packages/engine/test/unit/agents/random-agent.test.ts` — verify agent completion via kernel helper path.
3. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — verify template completion import/use from kernel API.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-completion.test.js`
3. `node --test packages/engine/dist/test/unit/agents/random-agent.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js`
5. `pnpm -F @ludoforge/engine test`

