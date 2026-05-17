# 180STDVECOBSROL-003: Phase 2 - Status-aware outer-preview seatAgg

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - policy expression/evaluator/compiler/schema.
**Deps**: `archive/tickets/180STDVECOBSROL-001.md`

## Problem

Ticket 002 owns the base Foundation 20 repair required by the Phase 1 standing witness: an all-unavailable preview-derived `seatAgg(sum)` must remain unavailable instead of contributing numeric `0`. This ticket adds the explicit authored availability modes, compiler/validator/schema wiring, and migration diagnostics so authors can choose how partial per-seat preview availability is handled.

## Assumption Reassessment (2026-05-17)

1. `PolicyPreviewTraceOutcome` already has the status vocabulary needed for unavailable cells.
2. The compiler diagnostic `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` already protects inner-preview refs and should extend to status-aware outer-preview aggregates.
3. Existing profiles need a migration path, but new authoring should be explicit about availability.
4. Boundary reset approved in-session on 2026-05-17: base all-unavailable silent-zero prevention moved to `archive/tickets/180STDVECOBSROL-002.md`; this ticket remains the owner of the availability-mode API and partial-availability semantics.

## Architecture Check

1. Extend `seatAgg` in place rather than adding a duplicate `standingAgg` IR node.
2. Preserve engine agnosticism by keeping aggregation over generic seats and terminal-derived refs.
3. No compatibility alias is added; legacy `skipUnavailable` is a documented mode with advisory migration pressure.

## What to Change

### 1. Add `seatAgg.availability`

Support `requireAllReady`, `requireAnyReady`, `selfAndTargetReady`, and `skipUnavailable`.

### 2. Propagate unavailable status

When an aggregate is unavailable under its selected mode, register the preview ref as unavailable and require `previewFallback` before contribution. Preserve the base ticket-002 behavior that all-unavailable preview aggregates do not silently contribute numeric `0`.

### 3. Update compiler/validator/schema artifacts

Thread the new field through the authored profile schema, compiled IR, runtime evaluator, generated schemas, and focused tests.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts` (modify if schema shape changes)
- `packages/engine/schemas/*.json` (regenerate if schema shape changes)
- focused tests under `packages/engine/test/architecture/preview-integrity/` and `packages/engine/test/unit/cnl/`

## Out of Scope

- Standing-projection route implementation.
- Base all-unavailable silent-zero prevention for the Phase 1 standing witness.
- Full `previewUsage.seatMatrix`.
- Named role primitives.
- Production profile migration beyond minimal fixture/test data.

## Acceptance Criteria

### Tests That Must Pass

1. Four availability modes are covered by focused tests.
2. Preview-derived aggregate without explicit fallback fails or warns according to the selected mode.
3. Generated schema artifacts are in sync.
4. `pnpm -F @ludoforge/engine test`.

### Invariants

1. Unavailable preview signal never silently becomes numeric contribution under explicit status-aware modes.
2. Existing ready-only aggregate behavior stays deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-availability.test.ts` - four-mode behavior.
2. Compiler/validator test for `seatAgg.availability` and fallback diagnostic.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled test commands for availability and compiler diagnostics.
3. `pnpm -F @ludoforge/engine run schema:artifacts:check`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
