# 179ACTSELPRE-009: Phase 2d - Specify ordinary-operation preview visibility successor

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Unknown - design first; no engine changes until the successor surface is specified and a focused failing witness exists.
**Deps**: `archive/tickets/179ACTSELPRE-008.md`

## Problem

Ticket 008 found no usable production FITL event/free-operation replacement witness for Spec 179's `outcomeGrantResolve` opt-in. The original Phase 2 ARVN witness still targets ordinary operation candidates (`patrol`, `sweep`, `assault`) whose opponent-margin effects need action-selection preview visibility, but current production FITL grant routing exposes event/free-operation grants as free-operation `actionSelection` moves rather than `outcomeGrantResolve` frames.

This ticket owns the next ordinary-operation preview visibility surface. It must decide whether the right successor is a focused `previewEffect.*`-style projection, a Spec 180 standing-vector/outer-preview amendment, or another bounded generic surface, then update the active spec/ticket graph before implementation starts.

## Assumption Reassessment (2026-05-17)

1. Spec 179 Phase 1 substrate is present and synthetically tested, but current production FITL does not produce a closing `outcomeGrantResolve` witness for that substrate.
2. Ticket 008's production card-46 shaded probe verified that `freeOperationGrants` can issue pending grants while still producing zero `previewUsage.outcomeGrantContinuation.exitCounts`.
3. Spec 180 exists as a standing-vector observability spec, but it currently assumes Spec 179 produces the missing signal. This successor must reassess whether Spec 180 should be amended, superseded, or kept as a later observability layer.

## Architecture Check

1. Preserve Foundations #1 and #5: the successor must be a generic one-rules-protocol surface, not FITL-specific engine logic.
2. Preserve Foundation #10: any projection or continuation must be bounded by explicit candidate/step/effect limits and reproducibility metadata.
3. Preserve Foundations #15 and #20: ordinary-operation opponent effects must not be represented as ready numeric signal unless the projection actually observed the relevant effects; unavailable/capped/partial signal needs explicit trace provenance.

## What to Change

### 1. Reassess successor architecture

Compare the live options against `docs/FOUNDATIONS.md`, Spec 179 evidence, `reports/spec-179-remediation.md`, and `specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md`:

- focused `previewEffect.*` / ordinary-operation effect projection,
- amendment of Spec 180 so it owns both signal production and observability,
- or a narrower generic continuation/projection route that preserves Spec 179 as synthetic-only substrate.

### 2. Update the graph before implementation

Patch the chosen active spec/ticket artifacts so they no longer imply that Spec 179 can close on a production event/free-operation `outcomeGrantResolve` witness.

### 3. Define the first proving witness

Specify the smallest bounded FITL ARVN ordinary-operation witness and the generic cross-game or synthetic invariant needed before code changes.

## Files to Touch

- `specs/179-action-selection-preview-outcome-grant-opt-in.md` (modify if successor ownership changes Spec 179 wording)
- `specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` (modify if selected as the successor architecture)
- `reports/179-phase-2-post-opt-in-witness.md` (modify if the successor changes the witness ledger)
- `tickets/179ACTSELPRE-005.md`, `tickets/179ACTSELPRE-006.md`, `tickets/179ACTSELPRE-007.md`, `archive/tickets/179ACTSELPRE-008.md` (modify only for dependency/status cleanup)
- `packages/engine/src/**` and `packages/engine/test/**` (modify only after the successor surface and first failing witness are specified)

## Out of Scope

- Lowering the old `currentMargin.nva` / `currentMargin.vc` thresholds and calling Spec 179 passed.
- FITL-specific engine branches or profile-only hacks.
- WASM-route alignment before the successor surface defines the route that needs alignment.

## Acceptance Criteria

### Tests That Must Pass

1. Active spec/ticket graph names the ordinary-operation preview visibility owner truthfully.
2. The selected successor surface has a bounded proof plan and at least one focused failing witness identified before engine implementation begins.
3. `pnpm run check:ticket-deps`.

### Invariants

1. No claim that event/free-operation grant evidence proves ordinary operation opponent-margin visibility.
2. No new preview scalar can silently coerce unavailable/capped signal into a numeric contribution.
3. No engine implementation without first adding or identifying a focused failing witness for the selected generic surface.

## Test Plan

### New/Modified Tests

1. No tests are expected until the successor architecture is selected.

### Commands

1. `pnpm run check:ticket-deps`
