# 121TWOPHAPOL-004: Populate phase trace fields in diagnostics + golden tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agents/policy-diagnostics, test fixtures
**Deps**: `archive/tickets/121TWOPHAPOL-001.md`, `archive/tickets/121TWOPHAPOL-003.md`

## Problem

After ticket 001 adds phase fields to the trace type and ticket 003 produces phase metadata in the pipeline, the trace builder (`buildPolicyAgentDecisionTrace`) still doesn't populate those fields. The golden test files also lack phase-separated trace data. Without this wiring, the two-phase pipeline's decision rationale is invisible in traces.

## Assumption Reassessment (2026-04-09)

1. `buildPolicyAgentDecisionTrace` exists in `packages/engine/src/agents/policy-diagnostics.ts` — confirmed.
2. It receives `PolicyEvaluationMetadata` and `traceLevel` — confirmed.
3. `PolicyEvaluationMetadata` will carry `phase1Score` and `phase1ActionRanking` after ticket 003 — prerequisite.
4. Golden test files at `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` and `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json` — confirmed.

## Architecture Check

1. Wiring metadata fields into the trace builder is the standard pattern — every other trace field follows this path. No architectural novelty.
2. No game-specific logic — the trace builder is game-agnostic; it serializes whatever metadata the pipeline produces.
3. No backwards-compatibility shims — golden files are updated to reflect the new trace shape.

## What to Change

### 1. Wire phase fields in `buildPolicyAgentDecisionTrace`

In `policy-diagnostics.ts`, read `phase1Score`, `phase2Score`, and `phase1ActionRanking` from the input metadata and include them in the returned `PolicyAgentDecisionTrace` object.

For traces where the two-phase pipeline was not used (e.g., fallback agents), the fields remain `undefined` (they are optional on the type).

### 2. Update golden test files

Regenerate or manually update:
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json`
- `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json`

The golden files must include the new phase fields with values matching the deterministic test scenarios.

## Files to Touch

- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (modify)
- `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json` (modify)

## Out of Scope

- The trace type definition itself (ticket 001)
- The pipeline restructure that produces phase metadata (ticket 003)
- Isolation or regression tests (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. Golden tests pass with updated fixture files — the trace output matches the expected shape including phase fields.
2. When phase metadata is present, `phase1Score`, `phase2Score`, and `phase1ActionRanking` appear in the trace.
3. When phase metadata is absent (non-policy agents, fallback), the fields are absent from the trace.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `buildPolicyAgentDecisionTrace` remains a pure function — no side effects.
2. Golden files are deterministic — regenerating from the same input produces identical output.
3. Trace level filtering continues to work — verbose-only fields remain gated by trace level.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-diagnostics.test.ts` — if it exists, verify phase field population; if not, the golden tests serve as the coverage.
2. Golden test files serve as the primary regression guard for trace shape.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
