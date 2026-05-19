# 182STRSTRPOL-016: Phase 4 — Architectural-invariant probe (no additional preview drive)

**Status**: IMPLEMENTED
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

## Implementation Reassessment (2026-05-19)

1. No FITL turn-shape-using profile exists yet; ticket 017 still owns FITL evaluator authoring. This ticket therefore uses a synthetic turn-shape architectural fixture in `architectural.probes.test.ts`, matching the ticket's allowed fixture path.
2. The runtime guard signal exists as `POLICY_TURNSHAPE_UNREGISTERED_PREVIEW_DRIVE` in `PolicyRuntimeError.detail.signal`. The probe runner now captures that structured runtime failure for matching probe microturns so the new assertion can return a deterministic probe `fail` instead of leaking an unstructured test throw.
3. The draft command that targeted the probe module directly was not the live harness executable shape: probe files define data, while `architectural.probes.test.ts` is the collector/test. The final focused proof uses the collector plus the new assertion unit test.

## Architecture Check

1. The probe assertion is generic (no game-specific logic; Foundation #1).
2. Property-form assertion (no exact-action witnesses) per Spec 181 §4 anti-overfit guidance.
3. Severity `architecturalInvariant` because this probe verifies the engine-layer no-additional-preview-drive guard; FITL profile-quality turn-shape conformance remains with ticket 017.
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
2. Severity `architecturalInvariant` for the no-additional-preview-drive guard.
3. The assertion deterministically observes preview-drive events across two runs at the same seed.
4. No game-specific code in assertion logic (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/assertions/turn-shape-no-additional-preview-drive.ts` — assertion definition.
2. `packages/engine/test/policy-profile-quality/probes/architectural/turn-shape-no-additional-preview-drive.probe.ts` — probe instance.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/probes/architectural/turn-shape-no-additional-preview-drive.probe.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-19
Outcome amended: 2026-05-19

Implemented the Phase 4 no-additional-preview-drive architectural probe:

- Added `turnShapeNoAdditionalPreviewDrive` as a probe assertion kind and dispatch target.
- Added `runtimeFailure` capture to the probe runner for matching `PolicyRuntimeError` failures, preserving the structured `POLICY_TURNSHAPE_UNREGISTERED_PREVIEW_DRIVE` signal for assertions.
- Added `packages/engine/test/policy-profile-quality/probes/assertions/turn-shape-no-additional-preview-drive.ts` and focused assertion tests proving both pass and fail behavior.
- Added `packages/engine/test/policy-profile-quality/probes/architectural/turn-shape-no-additional-preview-drive.probe.ts`.
- Wired `architectural.probes.test.ts` to run the new probe against a synthetic turn-shape profile fixture. FITL evaluator authoring was completed and archived in `archive/tickets/182STRSTRPOL-017.md`.

Verification substitution:

- Draft command `node --test packages/engine/dist/test/policy-profile-quality/probes/architectural/turn-shape-no-additional-preview-drive.probe.js` was replaced by `node --test packages/engine/dist/test/policy-profile-quality/probes/architectural.probes.test.js`; direct probe modules are data definitions and do not independently execute the harness.

Source-size ledger:

| path | final lines | active growth | crossed cap? | decision |
| --- | ---: | ---: | --- | --- |
| `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` | 565 | +56 | no | Under cap; growth is focused runtime-failure capture for probe assertions. |
| `packages/engine/test/policy-profile-quality/probes/probe-types.ts` | 214 | +8 | no | Under cap; new assertion and runtime-failure shape only. |
| `packages/engine/test/policy-profile-quality/probes/architectural.probes.test.ts` | 98 | +67 | no | Under cap; synthetic fixture and collector wiring only. |

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/policy-profile-quality/probes/assertions/turn-shape-no-additional-preview-drive.test.js` — passed; 2 tests.
- `node --test packages/engine/dist/test/policy-profile-quality/probes/assertions/dispatch.test.js` — passed; 1 test.
- `node --test packages/engine/dist/test/policy-profile-quality/probes/architectural.probes.test.js` — passed; 2 probes, including `turn-shape-no-additional-preview-drive` at 3.463 ms.
- `pnpm turbo build` — passed; 3/3 tasks successful.
- `pnpm turbo test` — passed; 5/5 tasks successful; engine default lane reported 98/98 files passed.
- `pnpm turbo lint` — passed; 2/2 tasks successful.
- `pnpm turbo typecheck` — passed; 3/3 tasks successful.
