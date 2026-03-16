# 62MCTSSEAVIS-005: CiDiagnosticsReporter & ConsoleVisitor Test Helpers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — test helpers only
**Deps**: 62MCTSSEAVIS-001

## Problem

There are no visitor implementations for consuming search events. CI needs JSONL output for post-analysis and artifact upload. Local dev needs readable console output. FITL MCTS test helpers need integration points.

## What to Change

### 1. Create CiDiagnosticsReporter

`packages/engine/test/helpers/ci-diagnostics-reporter.ts`:
- Implements `MctsSearchVisitor`
- Writes JSONL to `MCTS_DIAGNOSTICS_DIR` (from env) if set
- Logs human-readable progress to console for key events (`searchStart`, `iterationBatch`, `searchComplete`, `poolExhausted`, `templateDropped`)
- Each JSONL line: `{ timestamp, scenario, event }`

### 2. Create ConsoleVisitor

`packages/engine/test/helpers/mcts-console-visitor.ts`:
- Implements `MctsSearchVisitor`
- Logs all events to console with formatting
- Useful for local debugging

### 3. Integrate into FITL MCTS test helpers

Update `fitl-mcts-test-helpers.ts` (or equivalent) to accept an optional visitor and pass it through to MCTS config.

## Files to Touch

- `packages/engine/test/helpers/ci-diagnostics-reporter.ts` (new)
- `packages/engine/test/helpers/mcts-console-visitor.ts` (new)
- `packages/engine/test/helpers/fitl-mcts-test-helpers.ts` (modify — accept visitor param)

## Out of Scope

- CI workflow YAML changes (62MCTSSEAVIS-020)
- Runner integration (Phase 5 tickets)
- Actual FITL test execution with visitor (62MCTSSEAVIS-006)
- Any changes to production source code

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `CiDiagnosticsReporter` writes valid JSONL when `MCTS_DIAGNOSTICS_DIR` is set
2. Unit test: `CiDiagnosticsReporter` falls back to console-only when env var unset
3. Unit test: `ConsoleVisitor` handles all event types without errors
4. Unit test: JSONL lines parse as valid JSON with `timestamp`, `scenario`, `event` fields
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Test helpers are test-only — not imported by production source
2. JSONL output is append-only (uses `appendFileSync`)
3. `CiDiagnosticsReporter` creates output directory if it doesn't exist
4. Both visitors handle every `MctsSearchEvent` type gracefully

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/helpers/ci-diagnostics-reporter.test.ts` — JSONL output, env var handling
2. `packages/engine/test/unit/helpers/mcts-console-visitor.test.ts` — all event type handling

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern diagnostics-reporter`
2. `pnpm turbo build && pnpm turbo typecheck`
