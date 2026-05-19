# 182STRSTRPOL-016: Phase 4 — Architectural-invariant probe (no additional preview drive)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — new probe assertion under `packages/engine/test/policy-profile-quality/probes/assertions/` (sibling to `selected-not-by-reason.ts`)
**Deps**: `archive/tickets/182STRSTRPOL-014.md`

## Problem

Spec 182 Phase 4 acceptance (b) requires an "architectural-invariant test asserts no turn-shape evaluator triggers an additional preview drive (new probe modeled on Spec 181 §4.2's `selectedNotByReason` assertion at `packages/engine/test/policy-profile-quality/probes/assertions/selected-not-by-reason.ts`, extended for this scope)". This ticket creates the no-additional-preview-drive probe assertion + harness wiring, mirroring the established Spec 181 pattern. This is the test-level verification of the runtime guard ticket 014 introduced; they are paired.

## Assumption Reassessment (2026-05-18)

1. `packages/engine/test/policy-profile-quality/probes/assertions/selected-not-by-reason.ts` exists and is the established pattern — confirmed during reassessment.
2. The probe harness exposes assertion definition via `defineProbe` (per Spec 181 §4 + archived ticket 181STRSTRPOL-002).
3. Ticket 014 introduced a runtime guard (`POLICY_TURNSHAPE_UNREGISTERED_PREVIEW_DRIVE` or analog); this ticket adds a property-form assertion testing the guard across a probe corpus.

## Architecture Check

1. The probe assertion is generic (no game-specific logic; Foundation #1).
2. Property-form assertion (no exact-action witnesses) per Spec 181 §4 anti-overfit guidance.
3. Severity `profileQuality` per FOUNDATIONS Appendix — non-blocking CI, profile-maintainer signal.
4. Uses existing harness — no parallel implementation (Foundation #15).

## What to Change

### 1. Assertion definition

Create `packages/engine/test/policy-profile-quality/probes/assertions/turn-shape-no-additional-preview-drive.ts` (or analogous name) implementing the assertion. Pattern mirrors `selected-not-by-reason.ts`:

```ts
import type { AssertionContext, ProbeOutcome } from '../probe-types';

export const evaluateTurnShapeNoAdditionalPreviewDrive = (context: AssertionContext): ProbeOutcome => {
  // Inspect the trace for preview-drive events fired AFTER turn-shape evaluator dispatch.
  // If any fire, return fail; otherwise pass.
};
```

### 2. Assertion type registration

Add the new assertion kind to `probe-types.ts` and wire it through the probe runner. Pattern: extend the assertion-kind union and add a dispatch case in `probe-runner.ts`.

### 3. Conformance probe instance

Create `packages/engine/test/policy-profile-quality/probes/architectural/turn-shape-no-additional-preview-drive.probe.ts` that uses the new assertion against a turn-shape-using profile (likely the FITL profile from ticket 017, or a fixture).

### 4. Tests

- The probe assertion itself runs to completion deterministically.
- A profile authored with a deliberately misbehaving turn-shape evaluator (one that would trigger a new preview drive) produces a `fail` outcome.
- The default turn-shape-using profile produces a `pass` outcome.

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/assertions/turn-shape-no-additional-preview-drive.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/probe-types.ts` (modify — assertion-kind union)
- `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` (modify — dispatch case)
- `packages/engine/test/policy-profile-quality/probes/architectural/turn-shape-no-additional-preview-drive.probe.ts` (new)
- Per-game probe collector or `architectural.probes.test.ts` (modify if explicit registration needed)

## Out of Scope

- Conformance probe asserting `minimumImpactSatisfied` (ticket 017).
- FITL evaluator authoring (ticket 017).

## Acceptance Criteria

### Tests That Must Pass

1. The new probe assertion runs deterministically on a default turn-shape-using profile and produces `pass`.
2. A synthetic test that intentionally triggers an additional preview drive in a turn-shape evaluator produces `fail`.
3. Per-probe overhead < 200 ms per Spec 181 §8 Phase 0 acceptance (e).
4. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. Property-form assertion (no exact-action witnesses).
2. Severity `profileQuality` — non-blocking CI.
3. The assertion deterministically observes preview-drive events across two runs at the same seed.
4. No game-specific code in assertion logic (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/assertions/turn-shape-no-additional-preview-drive.ts` — assertion definition.
2. `packages/engine/test/policy-profile-quality/probes/architectural/turn-shape-no-additional-preview-drive.probe.ts` — probe instance.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/probes/architectural/turn-shape-no-additional-preview-drive.probe.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
