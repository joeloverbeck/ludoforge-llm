# 203FITLNVACOM-005: NVA profile-quality witness suite (P4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — test authoring
**Deps**: `archive/tickets/203FITLNVACOM-004.md`

## Problem

With tickets 002–004 landed, the new NVA doctrine is authored and bound. Spec 203 §7 specifies 8 new profile-quality witnesses + 1 architectural invariant that prove the doctrine actually drives the policy agent in the intended ways and that Spec 201's shared-module bindings are correctly composed in `nva-baseline`.

Per Step 3's spec-bundled test suite exception, this ticket bundles all 9 tests because the spec §6 P4 explicitly defines the witness suite as one deliverable.

## Assumption Reassessment (2026-05-31)

1. The witness directory is `packages/engine/test/policy-profile-quality/` (per reassessment, confirmed via existing `nva-march-infiltrate-steal-vc-base.test.ts` and `nva-protects-trail-before-coup.test.ts`).
2. Witness convention: `@test-class: architectural-invariant` marker on profile-quality witnesses (per `.claude/rules/testing.md`). The 8 doctrine witnesses assert that the policy agent picks specific candidates given specific game states — they are architectural-invariant in the policy-profile-quality sense.
3. The 9th witness (`nva-templates-bind-shared-modules.test.ts`) is also `@test-class: architectural-invariant` but tests binding-list contents, not policy decisions.
4. Spec 201 has shipped (status COMPLETED, archived) — the architectural invariant can be authored now without gating.
5. The `policy-profile-quality` lane is a blocking CI lane (per Foundation Appendix amendment 2026-05-29). Failing witnesses block CI.
6. Boundary reset approved on 2026-05-31: `nva.eventLogisticsOrControlSwing` is not a plan template. Event doctrine remains covered by `shared.eventDirectSwing`, so binding-count assertions must expect the 5 existing NVA templates plus the 6 new ticket-002 templates.

## Architecture Check

1. **Spec-bundled coherent work unit (Step 5 Large-effort exception)**: 9 test files in one ticket. The spec author bundled the witness suite as one P4 deliverable; per Step 5's spec-bundled exception, Large effort is acceptable even when the per-file changes are not mechanically uniform.
2. **Foundation 16 (Testing as Proof)**: Each witness proves a specific behavioral claim from Spec 203's §3 competence requirements. No assertions of "should" without an automated test.
3. **Replay-identity preservation**: The 2 existing NVA witnesses continue to pass; this ticket only adds new witnesses, never modifies the existing ones.
4. **Foundation 20 (Preview Signal Integrity)**: Witnesses that exercise preview-dependent behaviors assert against deterministic trace output, not against direct preview-ref inspection.
5. **Foundation 8 (Determinism)**: Each witness uses a fixed seed + canonical initial state; replay-identity within the witness is implicit.

## What to Change

### 1. `nva-rally-improves-trail.test.ts`

Authored fixture: an NVA Rally microturn where Trail value is degraded. Assert that `nva.rallyTrail` template selects a Laos/Cambodia space with high `laosCambodiaPriority` weight, and rallies a Base or Guerrilla there. Test class: `architectural-invariant`.

### 2. `nva-march-into-populated-control.test.ts`

Authored fixture: an NVA March microturn where a high-population space could swing to NVA Control. Assert `nva.marchControl` template fires and selects the high-population destination via `feature.projectedSelfMarginDelta` ordering.

### 3. `nva-march-infiltrate-builds-nva-not-steal-vc.test.ts`

Authored fixture: a March + Infiltrate microturn where both NVA-build and VC-steal targets are available. Assert `nva.marchInfiltrateControl` fires (not `nva.infiltrateVcOnlyWhenRational`) when NVA gain is the rational outcome.

### 4. `nva-vc-rival-suppresses-terror.test.ts`

Authored fixture: VC near win (`condition.vcNearWin.satisfied` true). Assert `nva.terrorSupportReduction` template is suppressed by `nva.vcRivalRisk` strategy module's `suppressesPlanTemplates`, and `nva.attackAmbush` against a VC Base is preferred.

### 5. `nva-bombard-concentrated-coin.test.ts`

Authored fixture: Bombard target options include a 3+-cube COIN stack and a single-cube stack. Assert `nva.bombardCoinStack` picks the high-density stack, and `nva.avoidLowYieldBombard` demotes the low-yield candidate by 600 penalty.

### 6. `nva-attack-ambush-beats-conventional-attack.test.ts`

Authored fixture: Attack microturn where guerrilla attrition makes Ambush selector valuable. Assert `nva.attackAmbush` template scores higher than plain Attack.

### 7. `nva-blocks-vc-near-win.test.ts`

Authored fixture: VC at -1 margin. Assert the NVA policy plan selects a VC-Base removal candidate or NVA-Opposition reduction, not a new NVA Control candidate that doesn't deny VC.

### 8. `nva-avoid-low-yield-vc-steal.test.ts`

Authored fixture: Infiltrate target is a VC Base; neither NVA-margin gain nor VC-margin denial materializes. Assert `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial` demotes the candidate by 600 penalty.

### 9. `nva-templates-bind-shared-modules.test.ts`

Architectural invariant. Authored as a direct YAML/compiled-profile inspection: load the compiled `nva-baseline` profile, assert that `use.strategyModules` includes all 7 shared modules from Spec 201 (`shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.resourceLogistics`, `shared.eventDirectSwing`, `shared.allyRivalThrottle`, `shared.monsoonOperationalRestriction`) + the 3 existing faction modules (`nva.logisticsAndTrail`, `nva.controlAndBases`, `nva.vcRivalLeverage`) + the 4 new faction modules from ticket 003 (`nva.baseNetwork`, `nva.takeControl`, `nva.conventionalPressure`, `nva.vcRivalRisk`) — 14 total. Assert `use.planTemplates` includes the 5 existing + 6 new from ticket 002, with no `nva.eventLogisticsOrControlSwing` binding. No state simulation needed.

## Files to Touch

- `packages/engine/test/policy-profile-quality/nva-rally-improves-trail.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-march-into-populated-control.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-march-infiltrate-builds-nva-not-steal-vc.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-vc-rival-suppresses-terror.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-bombard-concentrated-coin.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-attack-ambush-beats-conventional-attack.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-blocks-vc-near-win.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-avoid-low-yield-vc-steal.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-templates-bind-shared-modules.test.ts` (new)

## Out of Scope

- Modifications to existing NVA witnesses (preserved per Spec 203 §2 non-goal).
- Witnesses for non-NVA factions (out of scope for Spec 203).
- Replay-identity reattestation against Spec 201 (ticket 006).
- New helper utilities or test-state-builders unless an existing helper is genuinely insufficient (prefer pattern-matching against existing FITL witnesses' fixture style).

## Acceptance Criteria

### Tests That Must Pass

1. All 9 new witnesses pass: `pnpm turbo build && node --test packages/engine/dist/test/policy-profile-quality/nva-*.test.js`.
2. Existing NVA witnesses continue to pass: `nva-march-infiltrate-steal-vc-base.test.ts`, `nva-protects-trail-before-coup.test.ts`.
3. Full suite: `pnpm turbo test --force` — green (including the blocking `policy-profile-quality` lane).

### Invariants

1. Every witness carries an explicit `@test-class:` marker (architectural-invariant for all 9).
2. No witness mutates input state (Foundation 11).
3. Witness fixtures use deterministic seeds + canonical initial state — no wall-clock or randomized inputs.
4. Each witness file is under ~250 lines of test code (review-ergonomic, even though the ticket's cumulative size is Large).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/nva-rally-improves-trail.test.ts` — verifies §1.
2. `packages/engine/test/policy-profile-quality/nva-march-into-populated-control.test.ts` — verifies §2.
3. `packages/engine/test/policy-profile-quality/nva-march-infiltrate-builds-nva-not-steal-vc.test.ts` — verifies §3.
4. `packages/engine/test/policy-profile-quality/nva-vc-rival-suppresses-terror.test.ts` — verifies §4.
5. `packages/engine/test/policy-profile-quality/nva-bombard-concentrated-coin.test.ts` — verifies §5.
6. `packages/engine/test/policy-profile-quality/nva-attack-ambush-beats-conventional-attack.test.ts` — verifies §6.
7. `packages/engine/test/policy-profile-quality/nva-blocks-vc-near-win.test.ts` — verifies §7.
8. `packages/engine/test/policy-profile-quality/nva-avoid-low-yield-vc-steal.test.ts` — verifies §8.
9. `packages/engine/test/policy-profile-quality/nva-templates-bind-shared-modules.test.ts` — architectural invariant (§9).

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/policy-profile-quality/nva-*.test.js` (targeted new witnesses)
2. `pnpm turbo test --force` (full suite, bypassing Turbo cache)
3. `pnpm run check:ticket-deps`
