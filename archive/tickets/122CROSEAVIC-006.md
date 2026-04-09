# 122CROSEAVIC-006: Add `seatAgg` diagnostic formatting

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agents/policy-expr, agents/policy-diagnostics
**Deps**: `archive/tickets/122CROSEAVIC-003.md`

## Problem

The remaining gap after ticket 003 is diagnostic formatting. `seatAgg` now compiles through the shared expression analyzer/compiler path, but `packages/engine/src/agents/policy-diagnostics.ts` still does not render `seatAgg` nodes cleanly in diagnostic output.

## Assumption Reassessment (2026-04-09)

1. `seatAgg` analyzer/compiler support landed in ticket 003 because `compile-agents.ts` delegates authored expression lowering through `packages/engine/src/agents/policy-expr.ts`.
2. `packages/engine/src/agents/policy-diagnostics.ts` still formats expression nodes for diagnostic output and remains the live owner for readable `seatAgg` rendering.
3. `packages/engine/test/unit/agents/policy-diagnostics.test.ts` exists and is the live test surface for formatter behavior.

## Architecture Check

1. Keeps the remaining work narrow: ticket 003 already owns compile-time analysis needed for authored lowering, so this ticket now focuses only on diagnostics output.
2. Diagnostic rendering should preserve the authored meaning of `over`, `aggOp`, and nested `$seat`-bound inner expressions without changing runtime semantics.
3. No backwards-compatibility shims.

## What to Change

### 1. Add diagnostic output for `seatAgg` (policy-diagnostics.ts)

Add formatting for `seatAgg` expression nodes in the diagnostic output. Include `over`, `aggOp`, and a recursive format of the inner `expr`.

### 2. Unit tests

Test cases:
- Diagnostic output for `seatAgg` includes `over`, `aggOp`, and inner expression.

## Files to Touch

- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/test/unit/agents/policy-diagnostics.test.ts` (modify — add seatAgg formatting tests)

## Out of Scope

- Compilation (ticket 003)
- Runtime evaluation (ticket 005)
- Validation (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. Diagnostic output for a `seatAgg` node is well-formed and includes `over`, `aggOp`, and inner expression details.
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All existing diagnostic formatting remains unchanged.
2. No further analyzer/compiler behavior changes occur in this ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-diagnostics.test.ts` — add `seatAgg` formatting tests

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

Completion date: 2026-04-09

Implemented the remaining live diagnostics support for `seatAgg` in `packages/engine/src/agents/policy-diagnostics.ts`. The diagnostics snapshot walker now descends into `seatAgg.expr`, so nested current-surface and preview-surface refs such as `victory.currentMargin.$seat` are collected and exposed through `surfaceRefs` instead of being silently omitted from policy diagnostics.

Added unit coverage in `packages/engine/test/unit/agents/policy-diagnostics.test.ts` proving that diagnostics snapshots include nested `seatAgg` refs for both current and preview victory-margin surfaces.

Ticket premise note: the live diagnostics owner was slightly narrower than the ticket wording implied. `policy-diagnostics.ts` does not currently expose a general expression pretty-printer for policy AST nodes; the concrete missing behavior was nested ref discovery for diagnostics snapshots. This ticket implemented that live owned gap without changing compiler/runtime semantics.

Schema/artifact ripple check: no schema or generated artifact surfaces changed in this ticket. `schema:artifacts:check` ran as part of the engine test lane and stayed clean.

Verification completed with:

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/unit/agents/policy-diagnostics.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
