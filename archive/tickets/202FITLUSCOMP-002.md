# 202FITLUSCOMP-002: P1 — US selectors (§4.2) + plan templates (§4.1) + new vocabulary synthesis

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None (unless 001 classified a required ref as a genuine engine gap — see Gate condition)
**Deps**: `archive/tickets/202FITLUSCOMP-001.md`

## Problem

`us-baseline` lacks the plan templates and item-local selectors needed to encode the US competence requirements (Pacification carrier, Patrol/Advise, Air Lift as projection + withdrawal, high-value-infrastructure Assault, event direct-swing). Spec 202 §4.1 specifies 6 new templates and §4.2 specifies the selectors they bind. Templates and selectors are a coherent doctrine unit — a template referencing a not-yet-authored selector dangles — so they land together, along with the new vocabulary they require (zone props + `feature.projectedArvnMarginDelta`) that ticket 001 classified as YAML-authorable.

**Gate condition**: For any ref ticket 001 classified as a genuine engine gap, descope the affected selector/template here and open the prerequisite engine spec; note the descope in this ticket's Outcome rather than authoring against a nonexistent surface.

## Assumption Reassessment (2026-05-29)

1. The real plan-template authoring surface (verified against existing `us.trainAdvise`, `data/games/fire-in-the-lake/92-agents.md:1281`) is `root: { actionTags, compound }`, `postureHook`, `roles` with inline `constraints` (`{ notEqual: role.X }`, `{ reachable: { from: role.X, to: role.Y, via: routeClass.land } }`, `{ distinctOriginDestination: { origin: role.X, destination: role.Y } }`), `steps: [{ label, role, match: {...} }]`, `caps`, `fallback`. The spec's §4.1 YAML already uses this corrected surface.
2. `us.patrolAdvise` already exists (partial) in `us-baseline`; this ticket strengthens it per §4.1 rather than creating a duplicate.
3. New vocabulary authorability is settled by ticket 001's §11 classification — reassess this list against that output before authoring.

## Architecture Check

1. Grouping templates + selectors + their vocabulary as one unit prevents mid-chain dangling references and matches the decomposer-grouped-coherent-unit pattern; the diff is reviewable because every entry is a sibling addition to one library file.
2. All authoring lands in `GameSpecDoc` YAML; no engine code (Foundation 1/2). Compound Air Lift shapes emerge from microturn step decisions, not pre-declared compounds (Foundation 19).
3. No backwards-compatibility shims; `us.airLiftTrain` is deliberately NOT authored (rationale recorded for the witness in ticket 006).

## What to Change

### 1. Author new US selectors (§4.2)

Add `us.pacifyTargetSpace`, `us.airLiftAssaultOrigin`, `us.airLiftRouteDestination`, `us.airLiftControlOrigin`, `us.airLiftControlDestination`, `us.assaultHighValueTarget`, `us.patrolLocTarget`, plus any targets for `us.assaultHighValueInfrastructure` / `us.eventDirectSwing`, with item-local features (no constant `value: 1` placeholders), using the authored selector shape (`zoneProp: { zone, prop }`, `filters`/`score`).

### 2. Author the new vocabulary (per 001 classification)

Author the YAML-authorable zone props (`coinControl`, `usTroopCount`, `usControlCritical`, `hasTerrorMarker`, `supportShiftAvailable`, `removableEnemyValue`, `controlSwingPossible`, `hasUsTroops`, `hasRemovableEnemy`) and `feature.projectedArvnMarginDelta` (sibling of `feature.projectedUsMarginDelta`) in their data homes as classified by 001.

### 3. Author the 6 plan templates (§4.1)

`us.trainPacify`, `us.patrolAdvise` (strengthen existing), `us.airLiftAssault`, `us.airLiftControlOrWithdrawal`, `us.assaultHighValueInfrastructure`, `us.eventDirectSwing` — using the verified authoring surface. Do NOT author `us.airLiftTrain` (excluded by design).

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add §4.2 selectors, §4.1 templates, `feature.projectedArvnMarginDelta` synthesis)

`Likely surface` (refined against 001's classification — exact data home for new zone props depends on which are derivable in-selector vs require token/zone-data authoring): FITL token/zone data assets under `data/games/fire-in-the-lake/`.

## Out of Scope

- Strategy modules (003), posture/guardrails (004), `us-baseline` bindings (005) — templates/selectors are authored but not yet bound into the profile here.
- `us.airLiftTrain` — excluded by design; its exclusion witness is authored in 006.
- Any ref classified by 001 as a genuine engine gap — descope and escalate, do not author.

## Acceptance Criteria

### Tests That Must Pass

1. All 6 new templates and their selectors compile (GameDef compilation succeeds for FITL).
2. `reachable`/`distinctOriginDestination` route bindings on the Air Lift templates resolve against FITL's authored `routeGraph`.
3. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. No selector uses a constant `value: 1` placeholder — every score term references item-local features.
2. `us.airLiftTrain` is absent from the authored templates.
3. Compiler determinism: recompiling FITL yields byte-identical GameDef.

## Test Plan

### New/Modified Tests

1. Template-compilation coverage is exercised by the FITL GameDef build; dedicated profile-quality witnesses are authored in ticket 006 (per the spec's §7 test-suite bundling).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

**Completed**: 2026-05-29

**What changed** (`data/games/fire-in-the-lake/92-agents.md`):
- **New candidateFeature** `projectedArvnMarginDelta` = `sub(feature.projectedArvnMargin, feature.arvnMargin)` (sibling of `projectedUsMarginDelta`).
- **7 new item-local selectors**: `us.pacifyTargetSpace`, `us.patrolLocTarget`, `us.airLiftAssaultOrigin`, `us.airLiftRouteDestination`, `us.airLiftControlOrigin`, `us.airLiftControlDestination`, `us.assaultHighValueTarget`. All score via per-zone `zoneProp` (population/econ/category) + `lookup` (supportOpposition marker) — no constant `value: 1` placeholders. Per the P0 audit, per-zone faction-token counts are not expressible, so control-criticality / enemy-value are proxied by `population` and the support/opposition marker (documented inline + in spec §11).
- **5 plan templates**: `us.trainPacify` (new), `us.patrolAdvise` (strengthened — now binds `us.patrolLocTarget` + `us.adviseTargetSpace` with `notEqual` constraint, replacing the `us.patrolEconLoc` form), `us.airLiftAssault` (new; `reachable` + `distinctOriginDestination` role constraints via `routeClass.land`, mirroring the proven `arvn.trainTransport` pattern), `us.airLiftControlOrWithdrawal` (new; `reachable` origin→destination), `us.assaultHighValueInfrastructure` (new).
- `us.airLiftTrain` NOT authored (excluded by design — witness in 006).

**Deviation (user-approved 1-3-1)**: `us.eventDirectSwing` is **not** authored as a plan template. The engine requires every template to bind ≥1 role+step to a concrete microturn decision (`compile-agent-plan-templates.ts:69`), but FITL events share the single `event` action with heterogeneous, card-specific decisions and no uniform bindable `decisionPath`. The doctrine is already encoded by the bound `shared.eventDirectSwing` strategy module. Excluded with rationale (mirroring `us.airLiftTrain`), recorded in spec §4.1/§11; propagates to 005 (5 not 6 template bindings) and 006 (no dedicated witness; architectural witness covers `shared.eventDirectSwing`). Reversible.

**Note**: the now-orphaned `us.patrolEconLoc` selector is left in place (removal is ARVN-style selector cleanup, Spec 205 scope; it remains a valid library entry).

**Verification**:
- FITL compiles with **0 errors**; all 5 templates + 7 selectors + new candidateFeature present in the compiled GameDef.
- Recompile is **byte-identical** (sha256 match) — determinism invariant holds.
- `policy-profile-quality` suite: **identical** fail set with vs. without these changes (60 pass / 9 fail) — the 9 are pre-existing stale convergence witnesses on branch `implemented-spec-206` (verified via clean-baseline rebuild), unrelated to spec 202; my changes add **zero** new failures.
- Bootstrap fixture (`packages/runner/src/bootstrap/fitl-game-def.json`) regenerated; `bootstrap-fixtures check`, `schema:artifacts:check`, and `pnpm turbo build` all green.
- `reachable`/`distinctOriginDestination` route bindings compile against `fitl.routeGraph` (same authored form as the working `arvn.trainTransport`/`arvn.assaultTransportAssault`).
