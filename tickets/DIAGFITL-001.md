# DIAGFITL-001: Fix trace level string mismatch in tournament runner

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — campaign tooling only
**Deps**: None

## Problem

The FITL tournament runner (`campaigns/fitl-vc-agent-evolution/run-tournament.mjs`, line 189) creates PolicyAgents with `traceLevel: 'detailed'`, but the engine's `PolicyDecisionTraceLevel` type (`packages/engine/src/agents/policy-diagnostics.ts:13`) only accepts `'summary' | 'verbose'`. Since `'detailed'` is not a recognized value, the trace level defaults to `'summary'`, which omits per-candidate score breakdowns (`candidates[]` array with `scoreContributions`, `prunedBy`, `previewOutcome`). This makes diagnosis of score differentiation issues impossible without code changes.

## Assumption Reassessment (2026-04-02)

1. `PolicyDecisionTraceLevel` is `'summary' | 'verbose'` — confirmed at `policy-diagnostics.ts:13`
2. `run-tournament.mjs:189` passes `'detailed'` — confirmed via grep
3. The `buildPolicyAgentDecisionTrace` function defaults to `'summary'` when given an unrecognized value — confirmed at `policy-diagnostics.ts:44,103` (default parameter)

## Architecture Check

1. TypeScript type safety should prevent this mismatch, but `.mjs` files bypass type checking. The fix is straightforward: change the string literal.
2. No engine code changes — only campaign tooling.
3. No backwards-compatibility concerns.

## What to Change

### 1. Fix trace level string in run-tournament.mjs

In `campaigns/fitl-vc-agent-evolution/run-tournament.mjs`, line 189:
- Change `traceLevel: 'detailed'` to `traceLevel: 'verbose'`

This enables per-candidate score breakdowns in the `last-trace.json` output.

## Files to Touch

- `campaigns/fitl-vc-agent-evolution/run-tournament.mjs` (modify)

## Out of Scope

- Adding a `'detailed'` trace level to the engine (unnecessary — `'verbose'` already provides full detail)
- Changing trace output format or adding new trace fields
- Converting run-tournament.mjs to TypeScript

## Acceptance Criteria

### Tests That Must Pass

1. Run `node campaigns/fitl-vc-agent-evolution/run-tournament.mjs --seeds 1 --players 4 --evolved-seat vc --max-turns 500 --trace-seed 1000` — should produce `last-trace.json` with `candidates[]` array in each `agentDecision`
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Trace output must include per-candidate `scoreContributions` when trace level is `'verbose'`
2. Tournament harness compositeScore computation must be unaffected by trace level change

## Test Plan

### New/Modified Tests

1. No new engine tests required — this is a campaign tooling fix

### Commands

1. `node campaigns/fitl-vc-agent-evolution/run-tournament.mjs --seeds 1 --players 4 --evolved-seat vc --max-turns 500 --trace-seed 1000` — verify `last-trace.json` has `candidates[]`
2. `pnpm -F @ludoforge/engine test`
