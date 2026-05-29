# 202FITLUSCOMP-003: P2a — US strategy modules (§4.3)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: `archive/tickets/202FITLUSCOMP-002.md`

## Problem

`us-baseline` has no Support-building, availability-preservation, Aid/Econ-protection, or ARVN-kingmaker-throttle strategy modules. Spec 202 §4.3 specifies four: `us.buildSupport`, `us.preserveAvailability` (replacing the existing), `us.protectAidEcon`, and `us.avoidArvnKingmaking`. These gate/score plan templates authored in ticket 002 (via `enablesPlanTemplates`/`suppressesPlanTemplates`) and consume features authored there (`feature.projectedArvnMarginDelta`).

## Assumption Reassessment (2026-05-29)

1. `enablesPlanTemplates`/`suppressesPlanTemplates` are valid strategy-module fields (`packages/engine/src/kernel/schemas-core.ts`, Spec 197). Module shape is `traceLabel`/`when`/`applies`/`priority: { tier }`/`scoreGroups: [{ prefer: [...] }]` (verified against `StrategyModuleDef`).
2. Aid is referenced as `var.global.aid` (NOT `feature.aid`, which does not exist) — §4.3 `us.protectAidEcon.when` uses `var.global.aid` per the corrected spec.
3. `condition.arvnNearWin.satisfied` resolves (condition defined at `92-agents.md:405-428`); `feature.projectedArvnMarginDelta` is authored in ticket 002.

## Architecture Check

1. Modules score via explicit `prefer` terms over existing/authored features — no new tunable parameters (Foundation 2 stays evolvable via bindings/parameters already present).
2. All logic in `GameSpecDoc` YAML; no engine branching (Foundation 1).
3. `us.preserveAvailability` replaces the existing module rather than aliasing it — no compatibility shim (Foundation 14).

## What to Change

### 1. Author `us.buildSupport`

Gate on `feature.totalSupport < threshold`; `enablesPlanTemplates: [us.trainPacify, us.patrolAdvise, us.trainAdvise]`; `prefer` projected Support delta. Threshold is an initial draft (calibrated in ticket 006/P4).

### 2. Replace `us.preserveAvailability`

Gate on `feature.availableUsTroops < threshold`; `suppressesPlanTemplates: [us.airLiftAssault]`; `prefer` negative weight on available-US (coalesce preview/state).

### 3. Author `us.protectAidEcon`

Gate on `var.global.aid < threshold`; `enablesPlanTemplates: [us.patrolAdvise, us.trainAdvise]`; `prefer` projected Aid delta.

### 4. Author `us.avoidArvnKingmaking`

Gate on `condition.arvnNearWin.satisfied`; `suppressesPlanTemplates: [us.trainPacify, us.patrolAdvise]`; `prefer` negative weight on `feature.projectedArvnMarginDelta`; consumes `shared.allyRivalThrottle` (bound in ticket 005).

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add the four strategy modules)

## Out of Scope

- Binding these modules into `us-baseline.bindings.strategyModules` (ticket 005).
- Posture evaluators and guardrails (ticket 004).
- Threshold calibration (ticket 006 / P4) — initial draft values only here.

## Acceptance Criteria

### Tests That Must Pass

1. All four modules compile; `enablesPlanTemplates`/`suppressesPlanTemplates` references resolve to templates authored in ticket 002.
2. Eligibility-gating is observable via the Spec 197 trace surface.
3. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. No new tunable parameter is introduced; modules score via `prefer` terms only.
2. Compiler determinism: recompiling FITL yields byte-identical GameDef.

## Test Plan

### New/Modified Tests

1. Module behavior witnesses are authored in ticket 006 per the spec's §7 test bundling; this ticket is verified by compilation + trace inspection.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

**Completed**: 2026-05-29

**What changed** (`data/games/fire-in-the-lake/92-agents.md`, `strategyModules`):
- **`us.buildSupport`** — `when lt(feature.totalSupport, 30)`; `applies` scopes `[move]` tags `[train, patrol]`; tier 40; `enablesPlanTemplates: [us.trainPacify, us.patrolAdvise, us.trainAdvise]`; scoreGroup term `weight 5 · feature.projectedSupportDelta`.
- **`us.preserveAvailability`** (replaced existing) — `when lt(feature.availableUsTroops, 4)`; scopes `[move]`; tier 35; `suppressesPlanTemplates: [us.airLiftAssault]`; term `weight -3 · coalesce(preview.feature.availableUsTroops, feature.availableUsTroops)` (explicit preview→state fallback, Foundation 20).
- **`us.protectAidEcon`** — `when lt(var.global.aid, 15)`; tags `[patrol, train]`; tier 30; `enablesPlanTemplates: [us.patrolAdvise, us.trainAdvise]`; term `weight 4 · feature.projectedAidDelta`.
- **`us.avoidArvnKingmaking`** — `when condition.arvnNearWin.satisfied`; tier 60; `suppressesPlanTemplates: [us.trainPacify, us.patrolAdvise]`; term `weight -5 · feature.projectedArvnMarginDelta`. Pairs with the already-bound `shared.allyRivalThrottle` for the rival-throttle doctrine.

**Reassessment correction**: the spec §4.3 `scoreGroups: [{ prefer: [...] }]` shape is not the real module surface — `StrategyModuleDef` uses `scoreGroups: [{ id, summary: sum, terms: [{ id, weight, value }] }]` (verified against `shared.allyRivalThrottle`, `arvn.protectAidEcon`). Authored with the real shape. `enablesPlanTemplates`/`suppressesPlanTemplates` placed after the standard fields (per the arvn module at `92-agents.md:2072`). Initial draft thresholds (30/4/15) per spec — calibrated in ticket 006.

**Verification**: FITL compiles **0 errors**; all 4 modules present with `enablesPlanTemplates`/`suppressesPlanTemplates` resolving to the 002-authored templates (`us.trainPacify`, `us.patrolAdvise`, `us.airLiftAssault`, `us.trainAdvise`). Byte-identical recompile (determinism). Bootstrap fixture regenerated; `schema:artifacts:check` clean; passing US witness still passes; PQ fail set unchanged (9 pre-existing). Modules are authored but not yet bound (ticket 005), so us-baseline behavior is unchanged.
