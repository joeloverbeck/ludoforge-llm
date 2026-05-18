# 181STRSTRPOL-004: Phase 0 — Architectural-invariant constructibility probe

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/test/policy-profile-quality/probes/architectural/` only (no engine src changes)
**Deps**: `tickets/181STRSTRPOL-002.md`

## Problem

Spec 181 §8 Phase 0 acceptance (c) requires at least one architectural-invariant probe that gates CI — a deterministic, game-agnostic property assertion the engine MUST satisfy regardless of profile. Without it, the probe harness is a profile-quality-only facility; CI never benefits from the deterministic gate the harness can provide. Foundation #18 (Constructibility Is Part of Legality) is the natural first invariant — every published candidate must be constructible at its microturn scope.

## Assumption Reassessment (2026-05-18)

1. Foundation #18 publication contract: "Every kernel-published legal action is constructible atomically at its microturn scope." The kernel already enforces this via the publication probe in `packages/engine/src/kernel/microturn/`. Confirmed by Step 2 verification this session.
2. The runner from 001 supports `severity: 'architecturalInvariant'` → test fails on probe fail.
3. The assertion kind `traceLacksAdvisory` from 002 is the natural shape: assert no `POLICY_PUBLISHED_NON_CONSTRUCTIBLE_CANDIDATE` advisory (or equivalent kernel-emitted advisory; confirm canonical advisory code during implementation; if no such advisory exists, this probe instead uses `traceContainsField` to assert that `selectedCandidate.constructibilityProbe === 'pass'` — confirm trace field shape).
4. Conformance corpus per Foundation #16: probe should run against a small fixture game (not FITL, since FITL is expensive). Use Texas Hold'em or a dedicated architectural fixture if one exists under `packages/engine/test/architecture/`.

## Architecture Check

1. The probe is engine-side test infrastructure asserting an engine-side invariant — no game-specific code (Foundation #1, #16).
2. Property-form: asserts the negative ("no non-constructible advisory ever surfaces") rather than an exact-action ("seed X ply Y selects action A"). Foundation #18 is asserted via the advisory absence over a meaningful decision corpus.
3. CI-gating: severity `architecturalInvariant` ensures regressions block merges. This is the correct severity tier for engine-determinism-class invariants (per the Appendix split between determinism/ and policy-profile-quality/).

## What to Change

### 1. Probe file

Create `packages/engine/test/policy-profile-quality/probes/architectural/constructibility-published.probe.ts`:

```ts
import { defineProbe } from '../../define-probe';

export const everyPublishedCandidateIsConstructible = defineProbe({
  id: 'every-published-candidate-is-constructible',
  game: 'texas-holdem',                                // small, fast; or a dedicated arch fixture if available
  profile: 'baseline',                                  // confirm canonical baseline profile id
  seat: 'seat-0',                                       // any seat
  stateBinding: {
    scenario: 'texas-holdem-default',                   // confirm
    seedRange: { start: 2000, end: 2009 },              // 10 seeds, low cost
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'every',
  },
  assertions: [
    {
      kind: 'traceLacksAdvisory',
      code: 'POLICY_PUBLISHED_NON_CONSTRUCTIBLE_CANDIDATE', // confirm canonical code; adjust if kernel uses a different name
    },
  ],
  severity: 'architecturalInvariant',
  tags: ['constructibility', 'foundation-18', 'arch-invariant'],
});
```

### 2. Per-game test wrapper

Ensure `architectural.probes.test.ts` (the architectural wrapper) discovers `*.probe.ts` files under `probes/architectural/`. Pattern matches the per-game wrappers from 001.

### 3. Advisory code reconciliation

If `POLICY_PUBLISHED_NON_CONSTRUCTIBLE_CANDIDATE` is not the canonical kernel advisory code for this invariant, search `packages/engine/src/kernel/microturn/` and `packages/engine/src/agents/` for the actual code (likely something like `POLICY_PUBLICATION_PROBE_FAILED` or similar). Update the probe to reference the live code. If no such advisory exists, the assertion shape changes to `traceContainsField { field: 'publicationProbe.allPassed' }` plus a complementary unit test that constructs a non-constructible candidate fixture and confirms the kernel surfaces the right signal — but this fallback is much heavier; prefer the canonical advisory route.

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/architectural/constructibility-published.probe.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/architectural.probes.test.ts` (new or modify — depends on whether 001's wrapper already covers architectural probes generically)

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
5. Synthetic-fail check: temporarily reshape the probe to assert an inverted advisory (e.g., `traceHasAdvisory { code: 'POLICY_PUBLISHED_NON_CONSTRUCTIBLE_CANDIDATE' }`); confirm the test FAILS (gates CI) when the assertion would fail. Revert after confirming the synthetic-fail behavior. Do not commit the synthetic.

### Invariants

1. Severity is `architecturalInvariant` — failures block CI (Foundation #16).
2. No game-specific identifiers in the probe assertions; only Foundation-#18-derived contract checks.
3. Property-form only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/architectural/constructibility-published.probe.ts` — single probe.

### Commands

1. `pnpm -F @ludoforge/engine test -- architectural.probes`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
