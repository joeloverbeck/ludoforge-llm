# 180STDVECOBSROL-002: Phase 1 - Bounded standing-projection route

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - policy preview/evaluation standing projection.
**Deps**: `tickets/180STDVECOBSROL-001.md`

## Problem

Spec 180 needs a generic way for action-selection preview to observe ordinary-operation effects on every seat's terminal standing. Spec 179's `outcomeGrantContinuation` only helps paths that actually publish `outcomeGrantResolve`; the production ordinary-operation witness does not. This ticket implements the bounded standing-projection route required to turn the Phase 0 RED witness green.

## Assumption Reassessment (2026-05-17)

1. The selected architecture preserves existing `preview.victory.*` scalar refs for ready cells and introduces status-bearing standing cells behind them.
2. The route must use the existing one-rules protocol, not raw effect inspection or FITL-specific action handling.
3. `tickets/180STDVECOBSROL-001.md` owns the focused RED witness this ticket must satisfy.

## Architecture Check

1. Projection is bounded by a named cap and recorded in trace metadata per Foundation 10.
2. Standing values are computed from existing terminal margin/ranking machinery, preserving engine agnosticism.
3. Unavailable, capped, hidden, stochastic, unresolved, failed, and gated standing cells remain distinct Foundation 20 statuses.

## What to Change

### 1. Implement standing projection

Add the smallest generic projection route needed for action-selection candidates to produce current/projected standing cells through the normal published-decision/apply path.

### 2. Preserve scalar compatibility for ready cells

Existing `preview.victory.currentMargin.<seat>` and `preview.victory.currentRank.<seat>` must continue to return the same numeric values when the projected standing cell is ready.

### 3. Emit status for unavailable cells

When the projection cannot observe a cell within the cap, the evaluator must record an unavailable preview status and require explicit fallback before the value contributes.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify if trace metadata is needed for the route)
- `packages/engine/src/kernel/types-core.ts` and schema sources (modify only if the trace/config surface requires it)
- `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` (modify from RED to GREEN)

## Out of Scope

- `seatAgg.availability` modes beyond what the projection needs to avoid silent numeric contribution.
- `previewUsage.seatMatrix` full materialization.
- Named role primitives.
- FITL ARVN campaign witness.

## Acceptance Criteria

### Tests That Must Pass

1. Phase 0 ordinary-operation standing witness is green.
2. Ready-cell scalar refs preserve existing `preview.victory.*` behavior.
3. Unavailable/capped projected standing does not contribute as numeric `0` without explicit fallback.
4. `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific engine branches.
2. No raw-effect shortcut outside the one-rules protocol.
3. Projection cap metadata is deterministic and trace-visible.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` - turns GREEN.
2. Focused preview-integrity regression for unavailable standing fallback.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled `node --test` witness command.
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
