# 15GAMAGEPOLIR-009: Migrate Engine Agent Selection to Structured Descriptors

**Status**: ✅ COMPLETED
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
4. There is no active engine CLI integration point yet: `packages/engine/src/cli/index.ts` is still a stub and is not part of the current agent-selection path. Any textual sugar work in this ticket belongs in the factory/parser boundary only.
5. Existing tests already cover the legacy string contract in `packages/engine/test/unit/agents/factory.test.ts` and `packages/engine/test/unit/agents/factory-api-shape.test.ts`; this ticket should migrate and strengthen those tests rather than assuming a brand-new factory test surface.
6. Corrected scope: this ticket is engine-facing normalization only. Runner store/UI changes belong in a separate ticket.

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

Allow immediate parser sugar such as:

- `policy`
- `policy:<profileId>`
- `builtin:random`
- `builtin:greedy`

but lower them immediately into structured descriptors.

The authoritative creation contract should become `AgentDescriptor`; string parsing should be a thin normalization layer that exists only at the edge.

### 3. Update engine-side tests around factory behavior

Cover invalid descriptors, forced profile overrides, and authored-binding default resolution.

## File List

- `packages/engine/src/agents/factory.ts` (modify)
- `packages/engine/src/agents/index.ts` (modify only if exports or public types need to surface new helpers)
- `packages/engine/test/unit/agents/factory.test.ts` (modify)
- `packages/engine/test/unit/agents/factory-api-shape.test.ts` (modify)

## Out of Scope

- runner `PlayerSeat` / session-store migration
- pre-game UI changes
- authored FITL/Texas policies
- benchmark/performance work

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/factory.test.ts` proves textual shorthands normalize into structured descriptors and reject unknown descriptor shapes.
2. `packages/engine/test/unit/agents/factory.test.ts` proves `policy` resolves authored bindings by default while `policy:<profileId>` forces an explicit authored profile through the created `PolicyAgent`.
3. No engine-facing factory/parser path remains stringly after normalization beyond immediate CLI sugar parsing.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Engine factories and simulator-facing contracts store structured descriptors, not long-term sentinel strings.
2. Built-in `random` and `greedy` remain available as opt-in developer tools.
3. Default policy execution still routes through authored bindings, not game-specific engine branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/factory.test.ts` — descriptor normalization, policy profile routing, and rejection coverage.
2. `packages/engine/test/unit/agents/factory-api-shape.test.ts` — public factory API behavior after descriptor migration.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What changed:
  - Replaced the factory's stringly `AgentType` contract with `AgentDescriptor` normalization and validation.
  - Added explicit parsing for `policy`, `policy:<profileId>`, `builtin:random`, and `builtin:greedy`.
  - Updated factory tests to cover descriptor validation, parser normalization, and policy profile override behavior through the factory surface.
- Deviations from original plan:
  - `packages/engine/src/cli/index.ts` was not touched because it is still a stub and is not part of the live agent-selection path.
  - The implementation intentionally removed naked builtin string parsing from the factory/parser surface instead of preserving it as an alias, because the structured descriptor contract is the cleaner long-term runtime boundary.
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/agents/factory.test.js packages/engine/dist/test/unit/agents/factory-api-shape.test.js packages/engine/dist/test/unit/agents/policy-agent.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm run check:ticket-deps`
