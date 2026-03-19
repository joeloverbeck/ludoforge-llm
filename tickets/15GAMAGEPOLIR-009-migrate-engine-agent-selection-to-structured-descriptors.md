# 15GAMAGEPOLIR-009: Migrate Engine Agent Selection to Structured Descriptors

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agent factory and CLI-facing parsing contracts
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-008-integrate-policyagent-with-traces-and-diagnostics.md

## Problem

The engine still treats agent selection as narrow strings like `random` and `greedy`. Spec 15 requires structured descriptors so policy selection becomes a first-class runtime contract rather than more string parsing.

## Assumption Reassessment (2026-03-19)

1. Ticket `15GAMAGEPOLIR-008` already introduced engine-owned structured decision payload types in `packages/engine/src/kernel/types-core.ts` (`BuiltinAgentDescriptor`, `PolicyAgentDescriptor`, `AgentDescriptor`) and added a real `PolicyAgent`. This ticket must reuse those types instead of inventing a parallel descriptor model.
2. `packages/engine/src/agents/factory.ts` still uses string-based `AgentType` parsing and construction, even though it now knows about `policy` as a string token in addition to `random` and `greedy`.
3. Simulator move traces are already structured via `agentDecision`; the remaining gap is selection/configuration normalization at the engine boundary, not trace modeling.
4. Engine/CLI boundaries should accept textual sugar, but normalize immediately into structured descriptors.
5. Corrected scope: this ticket is engine-facing normalization only. Runner store/UI changes belong in a separate ticket.

## Architecture Check

1. Structured descriptors are cleaner than accumulating more sentinel strings like `policy:<profileId>` across multiple boundaries.
2. Because `AgentDescriptor` already exists in core types, the clean move is to make factories/parsers consume and emit that single contract rather than layering another adapter abstraction on top.
3. Normalizing early inside the engine boundary keeps the simulator contract explicit and future-proof.
4. No backwards-compatibility alias layer should preserve old `ai-greedy` style runner strings inside engine internals.

## What to Change

### 1. Add the structured descriptor model

Adopt the existing engine-facing descriptor types already added by ticket `008`:

- `{ kind: 'policy'; profileId?: string }`
- `{ kind: 'builtin'; builtinId: 'random' | 'greedy' }`

and make them the authoritative factory/parser contract.

### 2. Update factory/parser normalization

Allow CLI sugar such as:

- `policy`
- `policy:<profileId>`
- `builtin:random`
- `builtin:greedy`

but lower them immediately into structured descriptors.

### 3. Update engine-side tests around factory behavior

Cover invalid descriptors, forced profile overrides, and authored-binding default resolution.

## File List

- `packages/engine/src/agents/factory.ts` (modify)
- `packages/engine/src/agents/index.ts` (modify if exports change)
- `packages/engine/src/kernel/types-core.ts` (modify only if descriptor naming or ownership needs tightening)
- `packages/engine/src/cli/index.ts` (modify)
- `packages/engine/test/unit/agents/factory.test.ts` (new)

## Out of Scope

- runner `PlayerSeat` / session-store migration
- pre-game UI changes
- authored FITL/Texas policies
- benchmark/performance work

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/factory.test.ts` proves textual shorthands normalize into structured descriptors and reject unknown descriptor shapes.
2. `packages/engine/test/unit/agents/factory.test.ts` proves `policy` resolves authored bindings by default while `policy:<profileId>` forces an explicit authored profile.
3. No engine-facing factory/parser path remains stringly after normalization beyond immediate CLI sugar parsing.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Engine factories and simulator-facing contracts store structured descriptors, not long-term sentinel strings.
2. Built-in `random` and `greedy` remain available as opt-in developer tools.
3. Default policy execution still routes through authored bindings, not game-specific engine branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/factory.test.ts` — descriptor normalization and rejection coverage.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`
