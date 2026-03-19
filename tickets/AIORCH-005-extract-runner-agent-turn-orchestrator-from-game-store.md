# AIORCH-005: Extract Runner Agent-Turn Orchestrator from Game Store

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only orchestration boundary refactor
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-010-migrate-runner-seat-config-to-human-vs-agent-descriptors.md

## Problem

`packages/runner/src/store/game-store.ts` still owns too many responsibilities for AI-controlled turns. It is simultaneously:

- the Zustand state container,
- the move-mutation coordinator,
- the owner of `GameDefRuntime` lifecycle,
- the owner of per-player agent RNG state,
- the caller of descriptor-driven agent selection, and
- the loop that resolves full agent turns.

That coupling is no longer the cleanest architecture after `15GAMAGEPOLIR-010`. The runner now has a canonical structured seat-controller contract, but the orchestration lifecycle for agent seats still lives as mutable local state inside the store factory.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/store/game-store.ts` currently creates and resets `GameDefRuntime` during `initGame` / `initGameFromHistory`, stores `agentRngByPlayer` in store-local mutable state, and performs agent move selection directly inside `resolveSingleAiStep`.
2. `packages/runner/src/store/ai-move-policy.ts` is already a pure descriptor-driven helper module, but it is not the true orchestration boundary because runtime ownership, RNG lifecycle, and step/turn semantics still live in the store.
3. Archived ticket `15GAMAGEPOLIR-010` already normalized runner seat ownership onto `{ kind: 'human' } | { kind: 'agent'; agent: AgentDescriptor }`, so the inputs needed for a dedicated agent-turn orchestration boundary are now stable.
4. The live mismatch is architectural, not behavioral: the current code works, but `game-store.ts` remains the wrong long-term owner for agent execution lifecycle. The corrected scope is to extract that lifecycle comprehensively, not to tweak selection helpers in place.
5. Existing test coverage is concentrated in `packages/runner/test/store/game-store.test.ts` and `packages/runner/test/store/ai-move-policy.test.ts`. This ticket should add direct orchestrator tests rather than keep all agent-turn verification indirect through the store.

## Architecture Check

1. A dedicated runner agent-turn orchestrator is cleaner than store-local mutable closures because it gives agent execution lifecycle one explicit owner.
2. The orchestrator must stay fully generic: it may depend on `GameDef`, `GameDefRuntime`, `Move`, `SeatController`, and engine `AgentDescriptor`, but it must not encode game-specific rules, spec ids, or visual-config concerns.
3. This preserves the intended ownership boundary: `GameSpecDoc` remains the place for game-specific non-visual behavior/data, `visual-config.yaml` remains presentation-only, and `GameDef` plus simulation remain game-agnostic.
4. No backwards-compatibility shim should preserve store-owned agent orchestration paths. `game-store.ts` should switch directly to the new boundary.
5. If trace emission remains duplicated between human and agent move application after extraction, factor the duplicated trace-event assembly into a shared runner helper rather than leaving partial duplication in the store.

## What to Change

### 1. Introduce a dedicated runner agent-turn orchestrator module

Add a runner-local orchestration module, for example `packages/runner/src/store/agent-turn-orchestrator.ts`, that owns:

- runtime creation/reset for a game session,
- per-player agent RNG initialization and advancement,
- descriptor-driven move selection for agent seats,
- explicit step outcomes for agent resolution,
- deterministic data needed by the store to apply a chosen move and emit diagnostics/traces.

This module should expose an explicit session lifecycle API rather than leaking mutable maps through `game-store.ts`.

### 2. Refactor game-store to consume the orchestrator

`packages/runner/src/store/game-store.ts` should stop directly owning:

- `createGameDefRuntime(...)`,
- `agentRngByPlayer`,
- direct `selectAgentMove(...)` calls,
- agent-turn loop internals that belong to the orchestrator.

The store should remain responsible for:

- session/bootstrap state,
- worker calls and mutation application,
- user-driven move construction,
- persisted/render-facing state,
- final diagnostics surfaced to UI.

### 3. Keep AI move policy helpers pure and narrow

After extraction, `packages/runner/src/store/ai-move-policy.ts` should either remain a pure helper module or be reduced further if the orchestrator becomes its natural home. Do not leave two partial orchestration owners.

### 4. Add direct orchestration tests

Add a focused orchestrator test suite that proves:

- runtime/session reset is deterministic,
- per-player RNG ownership is preserved across multiple agent turns,
- human seats are not executed through the agent path,
- structured agent descriptors remain the sole non-human execution input.

Update store tests to assert integration with the orchestrator boundary rather than duplicating orchestration internals.

## Files to Touch

- `packages/runner/src/store/agent-turn-orchestrator.ts` (new)
- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/store/ai-move-policy.ts` (modify if helper ownership narrows)
- `packages/runner/src/trace/*` or a small shared runner trace helper (new/modify only if move-applied trace duplication is factored during extraction)
- `packages/runner/test/store/agent-turn-orchestrator.test.ts` (new)
- `packages/runner/test/store/game-store.test.ts` (modify)
- `packages/runner/test/store/ai-move-policy.test.ts` (modify only if helper surface changes)

## Out of Scope

- changing engine agent semantics or `AgentDescriptor` schema
- changing `GameSpecDoc` or `visual-config.yaml` ownership rules
- adding game-specific runner branching
- bootstrap fixture generation changes
- persistence/session payload shape changes unless the extraction proves a current contract is leaky

## Acceptance Criteria

### Tests That Must Pass

1. A dedicated runner orchestrator module owns runtime and per-player agent RNG lifecycle instead of `game-store.ts`.
2. `packages/runner/test/store/agent-turn-orchestrator.test.ts` proves deterministic session initialization/reset, descriptor-driven selection, and per-player RNG advancement.
3. `packages/runner/test/store/game-store.test.ts` proves `resolveAiStep` / `resolveAiTurn` operate through the orchestrator boundary rather than direct store-local orchestration state.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `GameDef` and simulation stay game-agnostic; the orchestrator remains a generic runner boundary only.
2. Structured seat controllers and engine-owned `AgentDescriptor` values remain the only non-human control contract.
3. Exactly one runner boundary owns agent execution lifecycle; no split store/helper/orchestrator ownership remains.
4. No backwards-compatibility alias path preserves direct store-owned orchestration as a supported contract.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/agent-turn-orchestrator.test.ts` — direct coverage for session lifecycle, per-player RNG ownership, and descriptor-driven selection.
2. `packages/runner/test/store/game-store.test.ts` — integration coverage that the store delegates AI step/turn resolution through the orchestrator boundary.
3. `packages/runner/test/store/ai-move-policy.test.ts` — helper-surface regression coverage only if extraction narrows or moves helper responsibilities.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/store/agent-turn-orchestrator.test.ts test/store/game-store.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm run check:ticket-deps`
