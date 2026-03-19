# 15GAMAGEPOLIR-009: Migrate Engine Agent Selection to Structured Descriptors

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agent factory and CLI-facing parsing contracts
**Deps**: specs/15-gamespec-agent-policy-ir.md, tickets/15GAMAGEPOLIR-008-integrate-policyagent-with-traces-and-diagnostics.md

## Problem

The engine still treats agent selection as narrow strings like `random` and `greedy`. Spec 15 requires structured descriptors so policy selection becomes a first-class runtime contract rather than more string parsing.

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/agents/factory.ts` currently exposes string-based `AgentType` parsing for `random` and `greedy`.
2. Engine/CLI boundaries should accept textual sugar, but normalize immediately into structured descriptors.
3. Corrected scope: this ticket is engine-facing normalization only. Runner store/UI changes belong in a separate ticket.

## Architecture Check

1. Structured descriptors are cleaner than accumulating more sentinel strings like `policy:<profileId>` across multiple boundaries.
2. Normalizing early inside the engine boundary keeps the simulator contract explicit and future-proof.
3. No backwards-compatibility alias layer should preserve old `ai-greedy` style runner strings inside engine internals.

## What to Change

### 1. Add the structured descriptor model

Introduce engine-facing types for:

- `{ kind: 'policy'; profileId?: PolicyProfileId }`
- `{ kind: 'builtin'; builtinId: 'random' | 'greedy' }`

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
3. Existing suite: `pnpm -F @ludoforge/engine test`

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
