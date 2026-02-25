# KERMOVECOMP-001: Promote move-template completion to kernel API boundary

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `kernel` API extraction, `agents` consumers, tests
**Deps**: EVEINTCHOPRO-005

## Problem

Template completion currently lives in `agents/template-completion.ts`, but non-agent callers (integration tests, harnesses, future runner/simulator flows) also need this generic move-completion behavior. Keeping completion in the agent layer creates a boundary leak and couples protocol-level engine behavior to a strategy module.

## Assumption Reassessment (2026-02-25)

1. `completeTemplateMove` is still implemented in `packages/engine/src/agents/template-completion.ts` and uses only game-agnostic kernel primitives (`legalChoicesEvaluate`, choice-option policy, PRNG). This remains a boundary mismatch.
2. Kernel event move enumeration has already been corrected per Spec 50 intent: `enumerateCurrentEventMoves()` emits base event templates and gates with `isMoveDecisionSequenceSatisfiable` instead of deterministic pre-resolution.
3. Agents already run completion for every legal move candidate (not only zero-param profile templates), so event templates are already completed before `applyMove`.
4. Remaining mismatch is ownership/API placement: integration and unit tests still import completion utilities from `agents/template-completion.ts` instead of kernel.
5. Kernel public export surface (`packages/engine/src/kernel/index.ts`) still does not expose a first-class move-completion helper.

## Architecture Check

1. Move-template completion is protocol/runtime behavior and belongs in kernel, not in agent strategy modules.
2. Event protocol behavior is already kernel-owned; completing this extraction removes the last agent-layer API leak around choice resolution.
3. No backwards-compatibility aliases/shims: migrate all imports to kernel and remove agent-level completion exports in this ticket.

## What to Change

### 1. Create kernel-level move completion module

Add a kernel module (for example `packages/engine/src/kernel/move-completion.ts`) exposing:
- `completeTemplateMove` (canonical API name)
- `MAX_CHOICES`

Keep implementation generic and reusable across agents, simulator, tests, and runner bridge logic.

### 2. Rewire agent consumers to kernel completion API

Update `RandomAgent` and `GreedyAgent` to import/use the kernel helper instead of agent-local completion implementation.

### 3. Migrate non-agent callers and tighten module boundaries

Update integration/unit tests currently importing from `agents/template-completion.ts` to kernel import path.
Delete `packages/engine/src/agents/template-completion.ts` and remove agent-barrel exports for it in this same ticket (no compatibility aliasing).

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/src/agents/template-completion.ts` (delete)
- `packages/engine/src/agents/index.ts` (modify)
- `packages/engine/test/unit/agents/template-completion.test.ts` (move/rename to kernel domain)
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
3. No production code imports remain from `src/agents/template-completion.ts`.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. `GameDef`, simulation, and kernel remain game-agnostic (no game-specific identifiers or branches).
2. Deterministic replayability remains unchanged for same seed and same move-selection policy.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-completion.test.ts` (new, moved from agents domain) — kernel ownership and behavior coverage.
2. `packages/engine/test/unit/agents/random-agent.test.ts` — verify agent completion via kernel helper path.
3. `packages/engine/test/integration/decision-sequence.test.ts` — verify template completion import/use from kernel API.
4. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — verify template completion import/use from kernel API.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-completion.test.js`
3. `node --test packages/engine/dist/test/unit/agents/random-agent.test.js`
4. `node --test packages/engine/dist/test/integration/decision-sequence.test.js`
5. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js`
6. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Extracted move-template completion to `packages/engine/src/kernel/move-completion.ts`.
  - Exported kernel completion API from `packages/engine/src/kernel/index.ts`.
  - Rewired agent consumers (`random-agent`, `greedy-agent`) to kernel completion imports.
  - Removed `packages/engine/src/agents/template-completion.ts` and its agent barrel export.
  - Moved completion unit coverage to `packages/engine/test/unit/kernel/move-completion.test.ts`.
  - Updated integration imports in `decision-sequence` and `fitl-events-tutorial-gulf-of-tonkin` tests.
- **Deviation from original plan**:
  - Scope was narrowed during reassessment because Spec 50 event-template enumeration behavior was already implemented in kernel; this ticket completed ownership/API boundary cleanup only.
- **Verification**:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/move-completion.test.js`
  - `node --test packages/engine/dist/test/unit/agents/random-agent.test.js`
  - `node --test packages/engine/dist/test/integration/decision-sequence.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js`
  - `pnpm -F @ludoforge/engine test` (pass: 271/271)
  - `pnpm -F @ludoforge/engine lint`
