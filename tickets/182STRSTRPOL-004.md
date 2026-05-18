# 182STRSTRPOL-004: Phase 2 — FITL strategic module conformance test

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `data/games/fire-in-the-lake/92-agents.md` (add minimal conformance module), `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/` (new probe)
**Deps**: `archive/tickets/182STRSTRPOL-003.md`

## Problem

Spec 182 Phase 2 acceptance (b) requires "one module bound to a Spec 181 selector for FITL" as conformance proof that the strategic-modules layer integrates with the existing selector substrate. The existing FITL profile (`data/games/fire-in-the-lake/92-agents.md`) already declares one selector — `arvnMicroturnOptionProjectedMargin` (lines 207-228). This ticket adds one minimal strategic module bound to that selector and a probe asserting the module activates and contributes score correctly. Module evaluation overhead must stay within Spec 181 §8 Phase 0 acceptance (e) per-probe budget (< 200 ms).

## Assumption Reassessment (2026-05-18)

1. `data/games/fire-in-the-lake/92-agents.md` declares `arvnMicroturnOptionProjectedMargin` selector (lines 207-228) bound to `microturnOptions` source — confirmed during reassessment.
2. The probe harness at `packages/engine/test/policy-profile-quality/probes/` accepts new probe files; pattern established by Spec 181 tickets.
3. Spec 181's ARVN action-distribution probe (`archive/tickets/181STRSTRPOL-003.md`, file `arvn-action-distribution.probe.ts`) is the conformance precedent for FITL probes.
4. The ARVN action-distribution probe's current calibration (per archived 181STRSTRPOL-003 Outcome) is `aggregateOutcome: { kind: "pass" }` — this conformance test must not regress that.

## Architecture Check

1. The conformance module lives in YAML game data, not engine code (Foundation #1, #2).
2. The probe is data — under `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/` because it's game-specific; the runner that drives it is game-agnostic.
3. Property-form assertions only (e.g., "module activates on N% of decisions matching condition X"), not exact-action witnesses, per Spec 181 §4 anti-overfit guidance.
4. Severity `profileQuality`: failure emits `POLICY_PROFILE_QUALITY_REGRESSION`, not a determinism failure.

## What to Change

### 1. Minimal conformance module in FITL profile

Add a small `strategyModules` entry to `data/games/fire-in-the-lake/92-agents.md` (locate insertion point during implementation; convention is alphabetical or alongside related considerations). Suggested shape:

```yaml
strategyModules:
  arvnPursueProjectedMargin:
    traceLabel: "ARVN pursue projected margin"
    when: { ref: condition.<existing-arvn-condition>.satisfied }   # confirm existing condition during implementation
    applies:
      scopes: [microturn]
    priority:
      tier: 20
    selectors:
      - role: primaryTarget
        selectorId: arvnMicroturnOptionProjectedMargin
    scoreGroups:
      - id: targetQuality
        summary: sum
        terms:
          - weight: 10
            value: { ref: selector.arvnMicroturnOptionProjectedMargin.current.quality }
    guardrailIds: []
    fallback:
      ifInactive: noContribution
      ifSelectorEmpty: noContribution
```

Bind the existing condition + selector; do NOT introduce new selectors or conditions here — that's outside Phase 2 scope.

### 2. Conformance probe

Create `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-module-activation.probe.ts` modeled on `arvn-action-distribution.probe.ts`. Assert:
- Module `arvnPursueProjectedMargin` activates on a measurable fraction of ARVN microturn decisions (`module.<id>.active === true`).
- When active, contribution is non-zero.
- Trace contains the `modules.active` entry with correct `traceLabel`.

### 3. Spec 181 ARVN action-distribution probe non-regression

Re-run `archive/tickets/181STRSTRPOL-003.md`'s probe (`arvn-action-distribution.probe.ts`) and confirm `aggregateOutcome: { kind: "pass" }` is preserved or improved. Document the post-module distribution in the new probe's calibration comment.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add minimal `strategyModules` entry)
- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-module-activation.probe.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.ts` (modify only if probe-file registration is explicit, not automatic; check 181STRSTRPOL-003 outcome for guidance)

## Out of Scope

- ARVN `build-political-engine` module (ticket 005 owns net-new authoring + cookbook).
- Texas Hold'em conformance — spec §2 notes Texas Hold'em selector adoption is a Spec 181 follow-on, not a Spec 182 deliverable.
- Profile-quality lint warnings (ticket 012 owns `RARELY_SAFE` + `FIRES_UNIFORM`).

## Acceptance Criteria

### Tests That Must Pass

1. New `arvn-module-activation.probe.ts` runs to completion and produces a deterministic outcome (`pass` or `POLICY_PROFILE_QUALITY_REGRESSION` — either is acceptable as a baseline signal).
2. Existing `arvn-action-distribution.probe.ts` continues to pass or improve.
3. Per-probe overhead < 200 ms (Spec 181 §8 Phase 0 acceptance (e); validated by the existing budget gate at 181STRSTRPOL-005).
4. `pnpm turbo test`.

### Invariants

1. Property-form assertions only — no exact-action witnesses.
2. New module's `selectorId` references the existing `arvnMicroturnOptionProjectedMargin` — no net-new selectors introduced (Foundation #2 — YAML-authorable, but scope of this ticket is one module only).
3. Severity `profileQuality`; does NOT block CI on failure.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-module-activation.probe.ts` — single conformance probe asserting module activation + contribution + trace shape.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
