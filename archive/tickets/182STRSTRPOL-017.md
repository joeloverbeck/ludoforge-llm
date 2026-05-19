# 182STRSTRPOL-017: Phase 4 — FITL turn-shape evaluator authoring + `minimumImpactSatisfied` conformance probe

**Status**: IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `data/games/fire-in-the-lake/92-agents.md` (add turn-shape evaluator), new conformance probe under `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/`
**Deps**: `archive/tickets/182STRSTRPOL-015.md`, `archive/tickets/182STRSTRPOL-016.md`

## Problem

Spec 182 Phase 4 acceptance (c) and (d) require:
- (c) "one turn-shape evaluator against FITL declaring `self-standing` + `leader-denial` objectives, validated by an audit probe that observes `minimumImpactSatisfied` true/false trajectories across a 15-seed scenario";
- (d) "one new probe modeled on the existing Spec 181 harness pattern asserts `turnShape.<id>.minimumImpactSatisfied` across a 15-seed scenario, proving the new layer is testable through the established harness (this is a net-new probe, not a modification of an existing Spec 181 probe)".

Plus (e) replay determinism for evaluator-using profile. This is the conformance ticket that proves the Phase 4 layer works end-to-end against the FITL profile.

## Assumption Reassessment (2026-05-18)

1. `data/games/fire-in-the-lake/92-agents.md` declares the ARVN profile with one existing selector and (post-ticket-005) at least one strategic module.
2. The standing-role refs (Spec 180) — e.g., `standingRole.self.delta.<something>`, `standingRole.currentLeader.delta.<something>` — are available for objective expressions; locate exact ref names during implementation.
3. The probe harness pattern from Spec 181 (`define-probe.ts` + `defineProbe` + per-game probe collector) is the established mechanism for FITL probes.
4. The architectural assertion from ticket 016 (`turn-shape-no-additional-preview-drive`) is used here as a sibling check.

## Implementation Reassessment (2026-05-19)

1. The live turn-shape objective surface computes deltas by evaluating ordinary numeric refs against the current and projected states. The FITL evaluator therefore uses `victory.currentMargin.self` and `victory.currentMargin.role:currentLeader`, not the draft placeholder `standingRole.*.delta.<axis>` refs.
2. The existing FITL probe corpus for ARVN profile-quality work is `policy-profile-quality/fitl-arvn-action-distribution-windows.json`, a 15-seed replay-window fixture reused by the Spec 181 action-distribution and Spec 182 module probes. The new probe reuses that fixture with `maxMatchesPerSeed: 1` and `windowMinDecisions: 100` so the assertion covers the existing 15-seed corpus without pinning exact actions.
3. Authored evaluator ids in the live FITL profile use camelCase, so the delivered evaluator id is `currentTurnImpact`.
4. The ticket's overhead acceptance needed an executable budget witness for the new probe, so `probe-budget.test.ts` now registers `turn-shape-minimum-impact-observed` alongside the existing FITL and architectural probes.

## Architecture Check

1. The turn-shape evaluator lives in YAML game data (Foundation #1, #2).
2. The conformance probe is data — under `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/` because it's game-specific.
3. Property-form assertions (e.g., "`minimumImpactSatisfied` true on N% of decisions across the 15-seed corpus") rather than exact-action witnesses (Spec 181 §4 anti-overfit).
4. Replay-determinism test uses the existing determinism infrastructure (Foundation #8, #16).
5. Severity `profileQuality` for the conformance probe; replay-determinism is a hard engine-level invariant (per FOUNDATIONS Appendix separation).

## What to Change

### 1. FITL turn-shape evaluator

Add to `data/games/fire-in-the-lake/92-agents.md` under `turnShapeEvaluators`:

```yaml
turnShapeEvaluators:
  currentTurnImpact:
    traceLabel: "current turn impact"
    source: currentPreviewDrive
    bounds:
      depthCapRef: profile.preview.inner.depthCap
      maxSyntheticDecisions: 8
    objectives:
      - id: self-standing
        delta: { ref: victory.currentMargin.self }
      - id: leader-denial
        delta: { ref: victory.currentMargin.role:currentLeader }
    minimumImpact:
      or:
        - gt: [{ ref: turnShape.currentTurnImpact.objective.self-standing.delta }, 0]
        - lt: [{ ref: turnShape.currentTurnImpact.objective.leader-denial.delta }, 0]
    fallback:
      onPreviewUnavailable: traceOnly
```

Add to `profile.use.turnShapeEvaluators: [currentTurnImpact]` for the ARVN profile.

### 2. minimumImpactSatisfied conformance probe

Create `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/turn-shape-minimum-impact.probe.ts`:

```ts
import { defineProbe } from '../../define-probe';

export const turnShapeMinimumImpactObserved = defineProbe({
  id: 'turn-shape-minimum-impact-observed',
  game: 'fire-in-the-lake',
  profile: 'arvn-evolved',
  seat: 'ARVN',
  stateBinding: {
    scenario: 'fitl-default',
    stateSamples: arvnReplayWindows,                     // existing 15-seed replay-window corpus
    maxMatchesPerSeed: 1,
    decisionFilter: { phase: 'main' },
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'every',
  },
  assertions: [
    {
      kind: 'turnShapeMinimumImpactObservedBoth',         // new assertion kind; see step 3
      evaluatorId: 'currentTurnImpact',
      windowMinDecisions: 100,
    },
  ],
  severity: 'profileQuality',
  tags: ['arvn-evolved', 'turn-shape', 'spec-182-phase-4'],
});
```

### 3. New assertion kind: `turnShapeMinimumImpactObservedBoth`

Add `packages/engine/test/policy-profile-quality/probes/assertions/turn-shape-minimum-impact-observed.ts`. The assertion observes `turnShape.<id>.minimumImpactSatisfied` across the corpus and passes if BOTH true and false trajectories appear — proving the evaluator is selective, not constant.

Wire into `probe-types.ts` and `probe-runner.ts` (same pattern as ticket 016).

### 4. Replay-determinism test

`packages/engine/test/determinism/turn-shape-replay-determinism.test.ts`: turn-shape-using profile produces bit-identical canonical serialized state across two runs.

### 5. Cookbook entry (deferred to ticket 005 or this ticket)

Optionally extend `docs/agent-dsl-cookbook.md` with a turn-shape evaluator authoring section (modeled on the strategic-module section from ticket 005). Defer if cookbook entry already exists from broader DSL documentation work.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add `turnShapeEvaluators` block + `profile.use.turnShapeEvaluators` reference)
- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/turn-shape-minimum-impact.probe.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/assertions/turn-shape-minimum-impact-observed.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/probe-types.ts` (modify — add assertion kind)
- `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` (modify — dispatch case)
- `packages/engine/test/determinism/turn-shape-replay-determinism.test.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.ts` (modify only if probe-file registration is explicit, not automatic)
- `docs/agent-dsl-cookbook.md` (modify — optional turn-shape evaluator section)

## Out of Scope

- Texas Hold'em conformance (out of Spec 182 scope per §2).
- Additional FITL turn-shape evaluators beyond `currentTurnImpact` (one evaluator is the spec's conformance requirement).
- Tighter calibration of `maxSyntheticDecisions` — initial value can be wide; tune in follow-up work if needed.

## Acceptance Criteria

### Tests That Must Pass

1. New `turn-shape-minimum-impact.probe.ts` runs deterministically and observes both `minimumImpactSatisfied: true` and `:false` trajectories across the 15-seed corpus (asserting selectivity).
2. New `turn-shape-replay-determinism.test.ts` — bit-identical canonical serialized state across two runs.
3. Spec 181 ARVN action-distribution probe still passes (or improves) after this ticket lands.
4. Per-probe overhead < 200 ms per Spec 181 §8 Phase 0 acceptance (e).
5. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. The FITL evaluator's `minimumImpact` predicate is data-authored (Foundation #2).
2. Probe assertions are property-form (no exact-action witnesses).
3. Replay determinism holds (Foundation #8).
4. The architectural no-additional-preview-drive probe (ticket 016) continues to pass against this profile.
5. No game-specific code in probe runner or assertion logic (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/turn-shape-minimum-impact.probe.ts` — conformance probe.
2. `packages/engine/test/policy-profile-quality/probes/assertions/turn-shape-minimum-impact-observed.ts` — assertion definition.
3. `packages/engine/test/determinism/turn-shape-replay-determinism.test.ts` — replay determinism.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/turn-shape-replay-determinism.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-19

Implemented the FITL Phase 4 turn-shape conformance slice:

- Added `currentTurnImpact` under `data/games/fire-in-the-lake/92-agents.md` with `self-standing` and `leader-denial` objectives, a data-authored `minimumImpact` predicate, and `traceOnly` preview-unavailable fallback.
- Enabled `currentTurnImpact` for the `arvn-evolved` profile.
- Added `turnShapeMinimumImpactObservedBoth` as a generic property-form probe assertion and wired it through `probe-types.ts`, `assertions/index.ts`, `dispatch.test.ts`, and aggregate-window handling in `probe-runner.ts`.
- Added `turn-shape-minimum-impact.probe.ts` under the FITL probe suite, registered it in `fire-in-the-lake.probes.test.ts`, and registered it in `probe-budget.test.ts`.
- Added `turn-shape-replay-determinism.test.ts` proving the FITL turn-shape-using profile produces byte-identical final state, decisions, and serialized trace across repeated runs.
- Did not edit `docs/agent-dsl-cookbook.md`; that ticket item was explicitly optional and broader DSL documentation already landed outside this ticket's required acceptance surface.

Verification substitutions and command ledger:

| ticket command / lane | final citation |
| --- | --- |
| `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js` | Split serially into `pnpm -F @ludoforge/engine build` and `node --test packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js`; both passed. |
| `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/turn-shape-replay-determinism.test.js` | Split serially into `pnpm -F @ludoforge/engine build` and `node --test packages/engine/dist/test/determinism/turn-shape-replay-determinism.test.js`; both passed. |
| Spec 181 ARVN action-distribution probe still passes | Covered by `node --test packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js`, which passed all three registered FITL probes including `arvn-action-distribution-not-dominated`. |
| per-probe overhead budget | `node --test packages/engine/dist/test/policy-profile-quality/probes/probe-budget.test.js` passed with `turn-shape-minimum-impact-observed` registered. |
| architectural no-additional-preview-drive sibling check | Covered by `pnpm turbo test`; the engine default lane reported 98/98 files passed, including the architectural probe collector. |
| broad lanes | `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck` all passed. |

Source-size decision:

- Mechanical sweep found no touched TypeScript source/test file at or above 600 lines and no active growth at or above 100 lines. No extraction or 1-3-1 source-size deferral was triggered.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/policy-profile-quality/probes/assertions/turn-shape-minimum-impact-observed.test.js` — passed; 3 tests.
- `node --test packages/engine/dist/test/policy-profile-quality/probes/assertions/dispatch.test.js` — passed; 1 test.
- `node --test packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js` — passed; 3 probes.
- `node --test packages/engine/dist/test/determinism/turn-shape-replay-determinism.test.js` — passed; 1 test.
- `node --test packages/engine/dist/test/policy-profile-quality/probes/probe-budget.test.js` — passed; 3 probes.
- `pnpm run check:ticket-deps` — passed for 1 active ticket and 2445 archived tickets.
- `git diff --check` — passed.
- `pnpm turbo build` — passed; 3/3 tasks successful.
- `pnpm turbo test` — passed; 5/5 tasks successful; engine default lane reported 98/98 files passed.
- `pnpm turbo lint` — passed; 2/2 tasks successful.
- `pnpm turbo typecheck` — passed; 3/3 tasks successful.
