# 201FITLSHADOC-005: Per-profile bindings and atomic blockImmediateWin removal

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: `tickets/201FITLSHADOC-004.md`

## Problem

Spec 201 §4.5 binds the six `shared.*` modules from ticket 004 into all four `*-baseline` profiles AND removes the three redundant `*.blockImmediateWin` modules (ARVN @ line 1498, US @ 1629, NVA @ 1705). VC's `vc.denyNvaIfNearWin` is preserved per §2 Non-Goals as faction-specific nuance — no `vc.blockImmediateWin` exists today.

This is the integration ticket that closes the four-faction parity scaffolding. Without it, the shared.* modules in ticket 004 are defined but never invoked.

This is a Foundation #14 atomic cut: the three blockImmediateWin removals and the four profile bindings land in the same change so the duplicated doctrine and its replacement do not coexist.

## Assumption Reassessment (2026-05-27)

1. `data/games/fire-in-the-lake/92-agents.md` declares the four profiles (`arvn-baseline`, `us-baseline`, `nva-baseline`, `vc-baseline`) with `bindings.strategyModules` lists. Three `*.blockImmediateWin` module definitions at lines 1498 / 1629 / 1705 are removed; their references in profile bindings (lines 2301, 2367, 2401 per the Spec 201 reassessment grep) are also removed.
2. The existing FITL convergence canaries — `arvn-seed-1000-deep-recovery.test.ts`, `fitl-seed-2057-regression.test.ts`, `fitl-march-dead-end-recovery.test.ts`, `fitl-variant-all-baselines-convergence.test.ts` — must continue to pass. Priority tiers in ticket 004's `shared.*` modules may need calibration to preserve replay-identity.
3. The four ally/rival relationships exist at lines 1379–1431 (`arvn.usNominalAlly`, `arvn.usNearWin`, `us.arvnNominalAlly`, `us.arvnNearWin`, `nva.vcNominalAlly`, `nva.vcNearWin`, `vc.nvaNominalAlly`, `vc.nvaNearWin`); `shared.allyRivalThrottle` reads ally identity through them — no relationship records added or modified.
4. VC has no `vc.blockImmediateWin` (verified during Spec 201 reassessment); `vc.denyNvaIfNearWin` is preserved as faction-specific nuance per Spec 201 §2 / §4.5.

## Architecture Check

1. Foundation #14 (No Backwards Compatibility): removal of three `*.blockImmediateWin` modules and their profile bindings happens in the SAME ticket as the `shared.*` bindings, so duplicated doctrine and replacement do not coexist. No compatibility shim. The atomic-cut shape is mechanically uniform (three structurally-identical module removals + four parallel binding updates) — Medium effort acceptable.
2. Foundation #15 (Architectural Completeness): this ticket is the architectural completion — the four-faction parity scaffolding is functional only when shared modules are bound into profiles.
3. Spec 201 §4.5 explicitly preserves faction-specific nuance modules (e.g., `arvn.denyUSIfNearWin` retained alongside `shared.blockCurrentLeader` per the §2 Non-Goal); VC's `vc.denyNvaIfNearWin` same treatment.

## What to Change

### 1. Remove three `*.blockImmediateWin` module definitions

Delete the following blocks from `agents.library.strategyModules`:

- `arvn.blockImmediateWin` block starting at line ~1498
- `us.blockImmediateWin` block starting at line ~1629
- `nva.blockImmediateWin` block starting at line ~1705

(Exact end lines to be confirmed via `/implement-ticket` reassessment phase — each block spans roughly 12–20 lines.)

### 2. Update `arvn-baseline.bindings.strategyModules`

Per Spec 201 §4.5 ARVN binding example:
- Add six `shared.*` entries at the top of the list (`shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.resourceLogistics`, `shared.eventDirectSwing`, `shared.allyRivalThrottle`).
- Remove `arvn.blockImmediateWin` reference (line ~2367).
- Preserve `arvn.denyUSIfNearWin` (comment per Spec 201 §4.5 corrected text: "preserved alongside shared.blockCurrentLeader: ARVN-specific scoring of US near-win throttle, distinct from generic leader-block (§2 Non-Goals)").
- Preserve all other ARVN-specific modules (`arvn.harvestPatronage`, `arvn.holdHighPopControl`, `arvn.protectAidEcon`, `arvn.selectiveViolence`, `arvn.preCoupRedeployDiscipline`, `arvn.buildPoliticalEngine`, `arvnPursueProjectedMargin`).

### 3. Update `us-baseline.bindings.strategyModules`

Per Spec 201 §4.5 US stub:
- Add six `shared.*` entries at the top.
- Remove `us.blockImmediateWin` reference (line ~2301).
- Preserve existing US-specific modules (`us.createAndDefendSupport`, `us.forceMultiplier`, `us.preserveAvailability`).

### 4. Update `nva-baseline.bindings.strategyModules`

Per Spec 201 §4.5 NVA stub:
- Add six `shared.*` entries at the top.
- Remove `nva.blockImmediateWin` reference (line ~2401).
- Preserve existing NVA-specific modules (`nva.logisticsAndTrail`, `nva.controlAndBases`, `nva.vcRivalLeverage`).

### 5. Update `vc-baseline.bindings.strategyModules`

Per Spec 201 §4.5 VC stub:
- Add six `shared.*` entries at the top.
- No `vc.blockImmediateWin` removal (none exists today).
- Preserve existing VC-specific modules (`vc.buildPoliticalNetwork`, `vc.subvertRegimeSecurity`, `vc.fundAndAmbushCarefully`, `vc.denyNvaIfNearWin`).

### 6. Calibrate priority tiers if convergence canaries fail

If FITL convergence canaries fail under the new bindings:
- Adjust the six `shared.*` priority tiers (initial values from ticket 004: 90/80/70/65/60/50) until canaries pass.
- Replay-identity is the acceptance gate; canary failure is a calibration signal, not a rollback signal.
- Record the final tiers in a one-line comment in the `shared.*` module definitions.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — three module deletions + four profile binding updates + optional priority-tier calibration)

## Out of Scope

- Profile-quality witnesses for shared module behavior (owned by 006).
- Per-faction completion (Specs 202–204 own US / NVA / VC binding extensions beyond the shared.* layer).
- ARVN selector cleanup (Spec 205).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds.
2. All four `*-baseline` profiles bind the six `shared.*` modules.
3. None of the four profiles references any `*.blockImmediateWin` module.
4. Convergence canaries replay byte-identically: `arvn-seed-1000-deep-recovery`, `fitl-seed-2057-regression`, `fitl-march-dead-end-recovery`, `fitl-variant-all-baselines-convergence`.
5. `pnpm turbo schema:artifacts` regenerates cleanly.

### Invariants

1. Atomic-cut requirement: the three `*.blockImmediateWin` deletions and the four profile binding additions land in the same diff (Foundation #14).
2. No engine code modified.
3. `vc.denyNvaIfNearWin` remains in the VC profile bindings (faction-specific nuance preserved per Spec 201 §2).
4. Existing relationships (lines 1379–1431) and per-faction near-win conditions (lines 261–297) are untouched.

## Test Plan

### New/Modified Tests

1. No new tests in this ticket — witness coverage is owned by 006.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/policy-profile-quality/arvn-seed-1000-deep-recovery.test.js packages/engine/dist/test/policy-profile-quality/fitl-seed-2057-regression.test.js packages/engine/dist/test/policy-profile-quality/fitl-march-dead-end-recovery.test.js packages/engine/dist/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.js`
3. `pnpm turbo build && pnpm turbo schema:artifacts` (run twice — verify byte-identical GameDef)
4. `pnpm turbo lint typecheck test`
