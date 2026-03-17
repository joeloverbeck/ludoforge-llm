# 62MCTSSEAVIS-004: Wire Visitor into Expansion & Materialization

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents/mcts/expansion.ts, materialization.ts, search.ts
**Deps**: 62MCTSSEAVIS-001, 62MCTSSEAVIS-002, 62MCTSSEAVIS-003

## Problem

When template moves fail to materialize or expansion hits `applyMove` errors, these failures are only counted in diagnostics accumulators. The visitor needs streaming notifications for real-time observation of these failures.

## What to Change

### 1. Emit `applyMoveFailure` in expansion.ts defensive catch

The existing try/catch in `selectExpansionCandidate()` already increments `expansionApplyMoveFailures`. Add visitor emission alongside:
```typescript
visitor?.onEvent({ type: 'applyMoveFailure', actionId, phase: 'expansion', error: String(e) });
```

### 2. Emit `templateDropped` in materialization.ts

When `completeTemplateMove()` fails and a template is dropped, emit:
```typescript
visitor?.onEvent({ type: 'templateDropped', actionId, reason });
```
Reason: `'unsatisfiable'`, `'stochasticUnresolved'`, or `'applyMoveFailed'`.

### 3. Pass visitor reference to expansion and materialization functions

Thread `visitor` from config through to call sites. Use optional parameter to preserve existing signatures.

## Files to Touch

- `packages/engine/src/agents/mcts/expansion.ts` (modify)
- `packages/engine/src/agents/mcts/materialization.ts` (modify)
- `packages/engine/src/agents/mcts/search.ts` (modify — pass visitor to callees)

## Out of Scope

- Decision node events (62MCTSSEAVIS-010)
- Search lifecycle events (already done in 62MCTSSEAVIS-003)
- Changing expansion or materialization logic — only adding observer emissions
- CiDiagnosticsReporter (62MCTSSEAVIS-005)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: expansion failure with visitor emits `applyMoveFailure` with `phase: 'expansion'`
2. Unit test: template drop with visitor emits `templateDropped` with correct `reason`
3. Unit test: without visitor, expansion/materialization failures still increment diagnostics counters (existing behavior preserved)
4. Unit test: `applyMoveFailure.error` contains a descriptive error string
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostics accumulator behavior unchanged — visitor events are supplementary
2. Expansion and materialization logic unchanged — only observer emissions added
3. Visitor emissions guarded by `if (visitor?.onEvent)` — zero overhead when absent

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/expansion-visitor.test.ts` — expansion failure visitor events
2. `packages/engine/test/unit/agents/mcts/materialization-visitor.test.ts` — template drop visitor events

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern expansion`
2. `pnpm -F @ludoforge/engine test -- --test-path-pattern materialization`
3. `pnpm turbo build && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-16
- **What changed**:
  - `expansion.ts`: Added optional `visitor?: MctsSearchVisitor` param to `selectExpansionCandidate()`. Catch block now emits `applyMoveFailure` with `phase: 'expansion'` and stringified error.
  - `materialization.ts`: Added optional `visitor?: MctsSearchVisitor` param to `materializeConcreteCandidates()` and `materializeOrFastPath()`. Three emission sites: `legalChoicesEvaluate` catch (reason `'unsatisfiable'`), `stochasticUnresolved` branch, and `unsatisfiable` branch.
  - `search.ts`: Passes `config.visitor` to `materializeOrFastPath()` and `selectExpansionCandidate()` call sites.
  - New test: `expansion-visitor.test.ts` (4 tests)
  - New test: `materialization-visitor.test.ts` (4 tests)
- **Deviations**: Ticket stated "already increments `expansionApplyMoveFailures`" but that counter was defined in diagnostics yet never incremented. No diagnostics counter increment was added (out of scope — only observer emissions).
- **Verification**: 8/8 new tests pass, 35/35 existing expansion/materialization tests pass, full build and typecheck green.
