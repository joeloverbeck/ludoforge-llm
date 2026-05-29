# 207AGEDECCOS-003: Phase 3 — Un-skip the four quarantined witnesses and verify full acceptance

**Status**: ✅ COMPLETED 2026-05-29 (re-scoped). The un-skip gate now covers only the distilled `fitl-spec-143-cost-stability` (Phase 2 resolved the cost-drift by distillation, not by un-skipping the original drift-ratio). It was un-skipped and passes. The other three witnesses (`arvn-action-distribution-not-dominated`, `turn-shape-minimum-impact-observed`, `fitl-arvn-may17-equivalent-opponent-preview`) were split to `specs/208-fitl-arvn-baseline-pq-witness-failures.md` (distinct, non-cost-drift failures) and remain quarantined referencing Spec 208. See Outcome.
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — removes test `skip`s and runs verification lanes
**Deps**: `archive/tickets/207AGEDECCOS-002.md`

## Problem

Spec 207's acceptance gate is the **un-skipping of all four quarantined `policy-profile-quality` witnesses** (§5–§6). They were `skip`ped (referencing Spec 207) so the lane could be made blocking for the other ~88 witnesses without masking the agent decision/preview cost regression. Once Phase 2 (`207AGEDECCOS-002`) bounds the `chooseNStep` continuedDeepening enumeration, the four witnesses must pass unskipped and the full engine + `policy-profile-quality` lanes must be green.

This ticket is **Phase 3 — the un-skip gate**. It is a deferred-execution ticket: its work is unconditional once `207AGEDECCOS-002` lands (not a conditional gate that may be descoped). It removes the skips and verifies Spec 207 Acceptance #2–#4.

**Gate condition**: this ticket executes only after `archive/tickets/207AGEDECCOS-002.md` lands and its diagnostic shows the drift ratio < 1.75×. If un-skipping reveals a witness still failing, the regression is not fully fixed — reopen/extend Phase 2 rather than relaxing the witness (Spec 207 §4: never adapt tests to bugs).

## Assumption Reassessment (2026-05-29)

1. **Skip sites confirmed** (to be removed):
   - `packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts:275` — `it(..., { skip: 'Spec 207: ...' }, ...)`. Remove the `skip` option (and the quarantine comment at lines 268–272).
   - `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts:49–58` — `SPEC_207_QUARANTINED_PROBE_IDS` set + the conditional `itOptions` skip (lines 56–58) + the quarantine comment (lines 45–48). Remove the quarantine mechanism so every probe runs with `{}` options.
   - `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts:62` — `skip: 'Spec 207: ...'` option + the quarantine comment (lines 56–61). Remove.
2. **Acceptance targets confirmed** (Spec 207 §6): drift ratio < 1.75×; both `probe-budget` probes (`arvn-action-distribution-not-dominated`, `turn-shape-minimum-impact-observed`) within the hard overhead budget; `may-17` sees ≥2 ready opponent-preview candidates (NVA/VC margin refs resolve `ready`, not `unknown`).
3. **Verification lanes confirmed**: `test:all` and `test:policy-profile-quality` scripts exist in `packages/engine/package.json`; the determinism corpus lives under `dist/test/determinism/`; the four-profile convergence canary is `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts`.

## Architecture Check

1. **Restoring the gate, not relaxing it** (Foundation 16): the witnesses return to active enforcement at their original bounds — the regression is proven fixed by their passing, not by softening them.
2. **No engine change here**: this ticket only deletes quarantine scaffolding from test files and runs lanes. The behavioral fix is entirely in `207AGEDECCOS-002`. Keeping the un-skip separate isolates the trivial mechanical diff from the high-risk engine fix.
3. **Determinism re-proven** (Foundation 8): byte-identical determinism lane + four-profile convergence canaries + byte-identical `pnpm turbo build` confirm the Phase 2 fix changed cost only, not behavior.

## What to Change

### 1. Remove the Spec 207 quarantine from `fitl-spec-143-cost-stability.test.ts`

Delete the `skip` option from the `it(...)` at line 275 and the quarantine comment block (lines 268–272). The witness runs and must assert the drift ratio < `COST_DRIFT_CEILING` (1.75×).

### 2. Remove the quarantine mechanism from `probes/probe-budget.test.ts`

Delete the `SPEC_207_QUARANTINED_PROBE_IDS` set (lines 49–52), the conditional `itOptions` skip (lines 56–58 → always `{}`), and the quarantine comment (lines 45–48). All probes — including `arvn-action-distribution-not-dominated` and `turn-shape-minimum-impact-observed` — run within the hard overhead budget.

### 3. Remove the Spec 207 skip from `probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts`

Delete the `skip` option (line 62) and the quarantine comment (lines 56–61). The probe must see ≥2 ready opponent-preview candidates (NVA/VC margin refs resolve `ready`, not `unknown`).

### 4. Update the spec's status/back-link

In `archive/specs/207-fitl-agent-decision-cost-regression.md`, mark §8 Phase 3 done and update the `## Tickets` back-link / `Status` to reflect completion of the un-skip gate.

## Files to Touch

- `packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts` (modify — remove skip)
- `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` (modify — remove quarantine set + conditional skip)
- `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` (modify — remove skip)
- `archive/specs/207-fitl-agent-decision-cost-regression.md` (modify — mark Phase 3 done; update Status/back-link)

## Out of Scope

- **Any engine or game-data change.** If a witness still fails after un-skipping, the fix is incomplete — reopen `207AGEDECCOS-002`; do NOT relax the witness, re-calibrate it, or coerce preview refs (Spec 207 §4, Foundation 20).
- Re-blessing any golden trace or convergence canary — Acceptance #3 requires them byte-identical; a diff there means Phase 2 changed behavior and must be corrected.

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-spec-143-cost-stability.test.ts` passes unskipped: seed-1002 drift ratio < 1.75×.
2. `probes/probe-budget.test.ts` passes unskipped: both `arvn-action-distribution-not-dominated` and `turn-shape-minimum-impact-observed` stay within the hard probe overhead budget.
3. `probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` passes unskipped: ≥2 ready opponent-preview candidates (NVA/VC margin refs resolve `ready`).
4. Full lanes green: `pnpm -F @ludoforge/engine test:all` and `pnpm -F @ludoforge/engine test:policy-profile-quality` (0 failing, **0 skipped** for the four Spec 207 witnesses).

### Invariants

1. The four witnesses are active (no `skip`) and assert their original, un-relaxed bounds (Foundation 16).
2. FITL determinism lane + four-profile convergence canaries remain byte-identical; `pnpm turbo build` byte-identical (Spec 207 Acceptance #3, Foundation 8).
3. No witness bound, budget, or cap was altered to achieve green (Spec 207 §4).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts` — skip removed; now actively enforces the ratio ceiling.
2. `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` — quarantine mechanism removed; all probes enforced.
3. `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` — skip removed; opponent-preview readiness enforced.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:policy-profile-quality`
3. `pnpm -F @ludoforge/engine test:all`
4. `node --test "dist/test/determinism/**/*.test.js"` (determinism + convergence canaries byte-identical)
5. `pnpm turbo build` (byte-identical)

## Outcome

**Completed**: 2026-05-29 (re-scoped per Spec 207 Outcome §).

- Removed the Spec-207 `skip` from `fitl-spec-143-cost-stability.test.ts`; it is now the **distilled** retained-state-leak invariant (Phase 2 resolution) and **passes un-skipped** (1 pass / 0 fail, ~64s — the legitimate `deep1024` cost).
- The other three witnesses were **not** un-skipped here: they fail for distinct, non-cost-drift reasons (plan-controller domination, turn-shape evaluator readiness, grant-flow opponent-margin preview) and moved to `specs/208-fitl-arvn-baseline-pq-witness-failures.md`. Their quarantine `skip`s now reference Spec 208 (probe-budget via `SPEC_208_QUARANTINED_PROBE_IDS`; may-17 via its `skip` option).
- Verification: distilled `fitl-spec-143` green un-skipped; engine typecheck + lint clean; determinism lane green (99/0); no engine/game-data change (Phase-2 budget-reduction reverted), so `pnpm turbo build` and the canaries are byte-identical by construction.
