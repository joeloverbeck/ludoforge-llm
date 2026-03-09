# ENG-212: Fix Sequence-Probe Usability False Negatives

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — turn-flow free-operation viability probing in kernel/runtime
**Deps**: archive/tickets/ENG/ENG-208-harden-free-operation-discovery-api-surface.md, archive/tickets/ENG/ENG-210-extract-free-op-viability-probe-boundary.md, archive/tickets/ENG/ENG-211-add-free-op-viability-contract-parity-guards.md, packages/engine/src/kernel/free-operation-viability.ts, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/effects-turn-flow.ts, packages/engine/test/integration/fitl-event-free-operation-grants.test.ts, packages/engine/test/unit/effects-turn-flow.test.ts

## Problem

Current sequence-viability probing can classify later sequence steps as unusable solely because earlier synthetic blockers exist, even when earlier steps are themselves usable. This risks suppressing valid `requireUsableAtIssue` grant issuance.

## Assumption Reassessment (2026-03-09)

1. `isFreeOperationGrantUsableInCurrentState` enforces sequence readiness via `isPendingFreeOperationGrantSequenceReady`, and both event-issued and effect-issued callers pass synthetic `sequenceProbeBlockers`.
2. Existing integration coverage already verifies one negative sequence case (`card-effect-require-usable-issue-sequence`: later effect step suppressed when earlier step is unusable), but there is no explicit positive sequence case asserting later-step emission when earlier step is usable.
3. Existing unit coverage (`effects-turn-flow.test.ts`) verifies suppression on failed usability probes but does not currently assert positive sequence emission parity.
4. Architectural mismatch confirmed: synthetic probe blockers currently model "earlier sequence step exists" rather than "earlier sequence step remains pending/unusable". This over-approximates lock state and can produce false negatives.

## Architecture Check

1. Separating probe-time viability from execution-time lock state remains the correct boundary, but sequence emulation must preserve the same semantic contract as runtime authorization (`isPendingFreeOperationGrantSequenceReady`) without over-blocking.
2. The fix remains fully game-agnostic in `GameDef`/kernel logic and does not encode game-specific identifiers or branch logic.
3. No backward-compatibility shims or aliases; enforce one canonical probe behavior.
4. Preferred direction: keep sequence-probe synthesis local and data-driven, and avoid duplicating sequence-readiness policy across multiple call sites.

## What to Change

### 1. Correct probe-time sequence handling

Adjust viability probing so synthetic sequence blockers represent only earlier steps that remain effectively blocking during probe. Later steps must not be auto-classified as unusable when earlier steps are themselves usable.

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
3. Sequence probe emulation does not introduce synthetic blockers that cannot exist in real pending grant state.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add positive-path sequence viability emission assertion.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — ensure effect-issued sequence grants follow corrected probe semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Updated `free-operation` viability probing to derive sequence blockers from earlier steps that are actually unusable, instead of treating all earlier steps as blockers.
- Kept the probe policy game-agnostic and centralized in `packages/engine/src/kernel/free-operation-viability.ts`, with both `turn-flow-eligibility` and `effects-turn-flow` using the same candidate-driven semantics.
- For effect-issued grants, probe candidate derivation now uses prior sibling event effects (when available) via event effect-path context, with a conservative synthetic fallback for non-event contexts.
- Added/strengthened sequence coverage in both integration and unit suites to assert:
  - suppression when earlier steps are unusable
  - allowance when earlier steps are usable
