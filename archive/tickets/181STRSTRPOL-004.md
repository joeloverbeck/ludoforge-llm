# 181STRSTRPOL-004: Phase 0 — Architectural-invariant constructibility probe

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/test/policy-profile-quality/probes/architectural/` only (no engine src changes)
**Deps**: `archive/tickets/181STRSTRPOL-002.md`

## Problem

Spec 181 §8 Phase 0 acceptance (c) requires at least one architectural-invariant probe that gates CI — a deterministic, game-agnostic property assertion the engine MUST satisfy regardless of profile. Without it, the probe harness is a profile-quality-only facility; CI never benefits from the deterministic gate the harness can provide. Foundation #18 (Constructibility Is Part of Legality) is the natural first invariant — every published candidate must be constructible at its microturn scope.

## Assumption Reassessment (2026-05-18)

1. Foundation #18 publication contract: "Every kernel-published legal action is constructible atomically at its microturn scope." The kernel already enforces this via the publication probe in `packages/engine/src/kernel/microturn/`. Confirmed by Step 2 verification this session.
2. The runner from 001 supports `severity: 'architecturalInvariant'` → test fails on probe fail.
3. Boundary reset approved 2026-05-18: live source has no canonical constructibility advisory such as `POLICY_PUBLISHED_NON_CONSTRUCTIBLE_CANDIDATE`. The correct Foundation-aligned proof is a direct `publishedFrontierConstructible` probe assertion that attempts every published decision through the public `applyPublishedDecision` path from the matched pre-decision state. This is stronger than asserting advisory absence and keeps the ticket test-only.
4. Conformance corpus per Foundation #16: probe should run against a small fixture game (not FITL, since FITL is expensive). Use Texas Hold'em or a dedicated architectural fixture if one exists under `packages/engine/test/architecture/`.

## Architecture Check

1. The probe is engine-side test infrastructure asserting an engine-side invariant — no game-specific code (Foundation #1, #16).
2. Property-form: asserts the direct invariant ("every published frontier decision applies through the public path") rather than an exact-action ("seed X ply Y selects action A"). Foundation #18 is asserted over a meaningful decision corpus without adding production advisory surface.
3. CI-gating: severity `architecturalInvariant` ensures regressions block merges. This is the correct severity tier for engine-determinism-class invariants (per the Appendix split between determinism/ and policy-profile-quality/).

## What to Change

### 1. Direct constructibility assertion

Add a generic probe assertion kind `publishedFrontierConstructible`. For each matched microturn, the runner records a compact constructibility summary by applying every `microturn.legalActions[]` decision through `applyPublishedDecision`. The assertion passes only when every published decision is constructible through that public path.

This replaces the stale draft advisory route. No production advisory or kernel runtime surface is added by this ticket.

### 2. Probe file

Create `packages/engine/test/policy-profile-quality/probes/architectural/constructibility-published.probe.ts`:

```ts
import { defineProbe } from '../../define-probe';

export const everyPublishedCandidateIsConstructible = defineProbe({
  id: 'every-published-candidate-is-constructible',
  game: 'texas-holdem',                                // small, fast; or a dedicated arch fixture if available
  profile: 'default',
  seat: '0',
  stateBinding: {
    scenario: 'default',
    seedRange: { start: 2000, end: 2009 },              // 10 seeds, low cost
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'every',
  },
  assertions: [
    {
      kind: 'publishedFrontierConstructible',
    },
  ],
  severity: 'architecturalInvariant',
  tags: ['constructibility', 'foundation-18', 'arch-invariant'],
});
```

### 3. Per-game test wrapper

Ensure `architectural.probes.test.ts` (the architectural wrapper) discovers `*.probe.ts` files under `probes/architectural/`. Pattern matches the per-game wrappers from 001.

### 4. Advisory code reconciliation

Completed by approved reassessment: no live canonical advisory exists, so this ticket uses the direct `publishedFrontierConstructible` proof instead of adding production advisory surface.

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/architectural/constructibility-published.probe.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/architectural.probes.test.ts` (new or modify — depends on whether 001's wrapper already covers architectural probes generically)
- `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` (modify — record compact constructibility summary per matched frontier)
- `packages/engine/test/policy-profile-quality/probes/probe-types.ts` (modify — assertion and summary types)
- `packages/engine/test/policy-profile-quality/probes/assertions/published-frontier-constructible.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/assertions/published-frontier-constructible.test.ts` (new)

## Out of Scope

- Adding additional architectural invariants beyond constructibility (subsequent specs can add more probes — Spec 181 only requires "at least one").
- Game-specific behavior probes (003 owns the ARVN probe).
- Kernel changes to surface a new advisory if none exists (out of scope; if reconciliation reveals no canonical signal, raise via 1-3-1 before reshaping the probe).

## Acceptance Criteria

### Tests That Must Pass

1. `architectural.probes.test.ts` — probe runs to completion against the chosen game and seed range.
2. Outcome is `pass` (current engine code satisfies the invariant per Foundation #18).
3. Determinism: re-run produces bit-identical outcome.
4. Existing suite: `pnpm turbo test`
5. Synthetic-fail check: `published-frontier-constructible.test.ts` includes a retained synthetic failure fixture proving the assertion fails when one published decision summary records a constructibility failure.

### Invariants

1. Severity is `architecturalInvariant` — failures block CI (Foundation #16).
2. No game-specific identifiers in the probe assertions; only Foundation-#18-derived contract checks.
3. Property-form only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/architectural/constructibility-published.probe.ts` — single probe.
2. `packages/engine/test/policy-profile-quality/probes/assertions/published-frontier-constructible.test.ts` — assertion pass/fail coverage.

### Commands

1. `pnpm -F @ludoforge/engine test -- architectural.probes`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed 2026-05-18.

Implemented the approved Option 1 reset: the probe harness now records a compact constructibility summary for every matched published frontier, and the new `publishedFrontierConstructible` assertion fails if any published decision cannot be applied through `applyPublishedDecision` from the same pre-decision state. This keeps the proof aligned with Foundation #18 without adding a production advisory surface that does not exist in the live engine.

Added the architectural-invariant Texas probe wrapper and retained assertion unit coverage for pass, synthetic failure, and partial-frontier misconfiguration cases. The synthetic failure fixture records a deliberate constructibility failure and proves the assertion reports it as a probe failure.

Reconciliation notes:

- Live source had no canonical `POLICY_PUBLISHED_NON_CONSTRUCTIBLE_CANDIDATE`-style advisory. After reassessment against `docs/FOUNDATIONS.md`, the direct constructibility assertion was approved as the stronger test-only proof.
- The initial ticket draft still named stale advisory behavior; the artifact was repaired after the reset and all verification below was run against the corrected direct-proof implementation.
- The drafted shorthand command `pnpm -F @ludoforge/engine test -- architectural.probes` is stale in the current runner and failed with "Could not find 'architectural.probes'". The exact source-path command below is the truthful focused substitute.

Verification:

- `pnpm -F @ludoforge/engine build` — pass
- `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/probes/assertions/published-frontier-constructible.test.js dist/test/policy-profile-quality/probes/architectural.probes.test.js` — pass
- `pnpm -F @ludoforge/engine test -- test/policy-profile-quality/probes/architectural.probes.test.ts` — pass
- `pnpm -F @ludoforge/engine test -- test/policy-profile-quality/probes/assertions/published-frontier-constructible.test.ts` — pass
- `pnpm -F @ludoforge/engine test -- test/policy-profile-quality/probes/assertions/published-frontier-constructible.test.ts test/policy-profile-quality/probes/architectural.probes.test.ts` — pass after review hardening
- `pnpm -F @ludoforge/engine typecheck` — pass
- `pnpm turbo test` — pass after adding the required `@test-class` marker to the new assertion unit test

Source-size ledger: changed and new files remain under the repository file-size guideline.
