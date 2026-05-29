# 202FITLUSCOMP-002: P1 — US selectors (§4.2) + plan templates (§4.1) + new vocabulary synthesis

**Status**: PENDING
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
