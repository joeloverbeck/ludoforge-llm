# AGENTSUNSET-003: Remove built-in agent modes from runner configuration and trace presentation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only after policy-only engine contract lands
**Deps**: `archive/tickets/AGENTSUNSET-002.md`

## Problem

The runner still exposes “Built-in Random” and “Built-in Greedy” in pre-game configuration and still formats `builtin:*` trace labels. Once the engine contract is policy-only, leaving those runner affordances in place would advertise unsupported product behavior and create a split-brain contract between runner UI and engine runtime.

## Assumption Reassessment (2026-04-22)

1. `packages/runner/src/ui/PreGameConfigScreen.tsx` still offers `builtin:greedy` and `builtin:random` as selectable agent modes.
2. `packages/runner/src/trace/console-trace-subscriber.ts` still formats builtin agent trace labels specially.
3. `packages/runner/src/store/ai-move-policy.ts` already defaults missing agent controllers to `{ kind: 'policy' }`, so the runner’s natural default is policy-first.
4. `docs/FOUNDATIONS.md` requires one rules protocol and truthful client contracts. The runner should not expose choices the engine no longer supports.

## Architecture Check

1. A policy-only runner surface is cleaner than UI-level legacy options or hidden fallback coercions.
2. The runner remains a client of the engine’s generic contract rather than owning a second agent-model compatibility layer.
3. No backwards-compatibility shims should be introduced in UI or store logic.

## What to Change

### 1. Remove built-in agent modes from pre-game setup

Update `PreGameConfigScreen` so agent mode selection is policy-only, including labels, parsing, formatting, and tests.

### 2. Narrow runner trace formatting

Update runner trace subscribers and related tests to reflect the policy-only `agentDecision` surface after `AGENTSUNSET-002`.

### 3. Reassess runner tests for truthful defaults

Refresh runner tests so they prove:

- policy is the only agent mode,
- human-vs-agent seat configuration still works,
- runner trace output remains truthful with policy-agent decisions.

## Files to Touch

- `packages/runner/src/ui/PreGameConfigScreen.tsx` (modify)
- `packages/runner/src/store/ai-move-policy.ts` (modify as needed)
- `packages/runner/src/trace/console-trace-subscriber.ts` (modify)
- `packages/runner/test/ui/PreGameConfigScreen.test.tsx` (modify)
- `packages/runner/test/trace/console-trace-subscriber.test.ts` (modify)

## Out of Scope

- Engine-side descriptor/schema removal.
- Adding new runner AI features beyond policy-only cleanup.
- Archive/document cleanup outside touched runner docs/tests.

## Acceptance Criteria

### Tests That Must Pass

1. Runner pre-game UI no longer offers built-in random/greedy agent choices.
2. Runner trace formatting no longer expects builtin agent-decision payloads.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Runner agent configuration stays aligned with the engine’s policy-only contract.
2. Missing or default AI seats still normalize to authored policy control without hidden fallback modes.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/PreGameConfigScreen.test.tsx` — prove policy-only seat-agent configuration.
2. `packages/runner/test/trace/console-trace-subscriber.test.ts` — prove policy-only agent trace labeling.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`
