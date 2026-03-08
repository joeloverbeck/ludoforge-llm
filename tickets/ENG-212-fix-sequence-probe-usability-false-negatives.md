# ENG-212: Fix Sequence-Probe Usability False Negatives

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — turn-flow free-operation viability probing in kernel/runtime
**Deps**: archive/tickets/ENG/ENG-208-harden-free-operation-discovery-api-surface.md, tickets/ENG-210-extract-free-op-viability-probe-boundary.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/effects-turn-flow.ts, packages/engine/test/integration/fitl-event-free-operation-grants.test.ts

## Problem

Current sequence-viability probing can classify later sequence steps as unusable solely because earlier synthetic blockers exist, even when earlier steps are themselves usable. This risks suppressing valid `requireUsableAtIssue` grant issuance.

## Assumption Reassessment (2026-03-08)

1. `isFreeOperationGrantUsableInCurrentState` now short-circuits on `isPendingFreeOperationGrantSequenceReady`, and callers can pass synthetic `sequenceProbeBlockers`.
2. Existing integration coverage verifies the negative case ("later steps not emitted when earlier step is unusable"), but does not explicitly verify the positive case ("later steps may emit when earlier step is usable").
3. Mismatch: probe-time usability and execution-time sequence lock semantics are currently conflated. Correction: probe logic must evaluate usability without introducing false negatives from synthetic blockers.

## Architecture Check

1. Separating probe-time usability from execution-time lock behavior is cleaner and prevents semantic coupling between unrelated checks.
2. The fix remains fully game-agnostic in `GameDef`/kernel logic and does not encode game-specific identifiers or branch logic.
3. No backward-compatibility shims or aliases; enforce one canonical probe behavior.

## What to Change

### 1. Correct probe-time sequence handling

Adjust viability probing so synthetic sequence blockers do not automatically force "unusable" outcomes for later steps when earlier steps are valid/usable.

### 2. Add positive and negative sequence probe coverage

Add explicit tests covering:
- later-step suppression when earlier required step is unusable
- later-step allowance when earlier required step is usable

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)

## Out of Scope

- Viability module ownership refactor itself (covered by ENG-210).
- Free-operation policy vocabulary/schema parity work (covered by ENG-211).

## Acceptance Criteria

### Tests That Must Pass

1. Later sequence steps are suppressed when earlier required steps are currently unusable.
2. Later sequence steps are not suppressed when earlier required steps are currently usable.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Probe-time viability checks and execution-time sequence lock checks are semantically consistent and deterministic.
2. Runtime remains game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add positive-path sequence viability emission assertion.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — ensure effect-issued sequence grants follow corrected probe semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
