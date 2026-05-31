# 203FITLNVACOM-003: NVA strategy modules, posture, and guardrails (P2)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data authoring in `92-agents.md`
**Deps**: `archive/tickets/203FITLNVACOM-002.md`

## Problem

With the new compile-valid NVA plan templates and their selectors authored (ticket 002), Spec 203 §§4.3–4.4 layer the doctrine gating + scoring + guardrail behaviors:

- §4.3 introduces 4 new strategy modules (`nva.baseNetwork`, `nva.takeControl`, `nva.conventionalPressure`, `nva.vcRivalRisk`) that gate the new templates via Spec 197's `enablesPlanTemplates` / `suppressesPlanTemplates` surface.
- §4.4 introduces `nva.avoidVcKingmaking` for VC-near-win demotion. `nva.preserveTrail` moved upstream into ticket 002 because ticket 002's templates reference it and intermediate artifacts must compile. `nva.protectLogisticsAndBases` is the existing posture, reused by other templates.
- §4.4 also introduces 2 new guardrails (`nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial`, `nva.avoidLowYieldBombard`).

This ticket authors strategy modules, `nva.avoidVcKingmaking`, and guardrails together because they share the same file and overlapping consumer set (modules' `enablesPlanTemplates` references template names from ticket 002; guardrails fire on `candidate.tag.*` and `roleTarget.*` refs whose availability was surveyed in ticket 001).

## Assumption Reassessment (2026-05-31)

1. `enablesPlanTemplates` / `suppressesPlanTemplates` are an active authored surface — `arvn.buildPoliticalEngine@2080-2092` exercises both fields.
2. Strategy module shape: `traceLabel`, `when`, `applies: { scopes, actionTags }`, `priority: { tier }`, `enablesPlanTemplates|suppressesPlanTemplates`, `scoreGroups: [{ id, summary, terms: [{ id, weight, value }] }]`, `guardrailIds: []`, `fallback: { ifInactive, ifSelectorEmpty }`. Sibling references: `nva.logisticsAndTrail@2334`, `arvn.holdHighPopControl@2110`.
3. Posture shape: `traceLabel`, optional `must: [...]`, `prefer: [{ id, value, weight, when?, fallback: { contribution: N } }]`. **No `applies` block on postures** — postures are scoped via the templates that bind them via `postureHook`. Sibling reference: `nva.protectLogisticsAndBases@1802`.
4. Guardrail shape: `scopes: [move]`, `when: { and: [...] }`, `severity: demote|prune`, `penalty: N`, `onUnavailable: noFire`. **`severity: veto` and `effect: veto` do not exist** in the authored surface. Sibling reference: `nva.doNotServeVcWin@2645`.
5. `condition.X.satisfied` IS the authored form (`92-agents.md:1915, 1930, 1948, 1965, 1997, 2012, 2056, 2057, 2132, 2317, 2634, 2635`).
6. `feature.nvaTroopCount` and `feature.projectedVcMarginDelta` availability are P0 deliverables from ticket 001; this ticket consumes the inventory and adopts the documented fallback paths if either is unavailable.
7. Boundary reset approved on 2026-05-31: `nva.preserveTrail` is no longer a ticket 003 deliverable. Ticket 002 authors it so the templates that reference it compile in the same slice.

## Architecture Check

1. **Foundation 1 (Engine Agnosticism)**: All authoring lands in `data/games/fire-in-the-lake/92-agents.md`. No engine changes — Spec 197 surface and Foundation 20 fallback declarations were established by prior shipped specs.
2. **Decomposer-grouped coherent unit**: Modules + one remaining posture + guardrails are tightly coupled — modules' `enablesPlanTemplates` references templates (ticket 002), and guardrails reference templates and roles (ticket 002). Medium effort is appropriate given the bounded artifact count (4+1+2=7 artifacts) and the spec-defined structure of each.
3. **Foundation 20 (Preview Signal Integrity)**: All postures' preview-derived `prefer` terms declare `fallback: { contribution: 0 }`. The `nva.avoidVcKingmaking` posture gates the term with `when: { ref: condition.vcNearWin.satisfied }` so the negative weight only applies when the condition fires.
4. **Foundation 14 (No Backwards Compatibility)**: New artifacts are authored inline alongside the existing NVA module / posture / guardrail blocks — no `_legacy` shims, no aliased compatibility paths.

## What to Change

### 1. Strategy modules

Append 4 new modules to the NVA strategy-module block of `92-agents.md` (currently `:2334-2391`):

- **`nva.baseNetwork`** — `when: { lt: [{ ref: feature.nvaBaseCount }, 6] }`. Applies to `[rally, infiltrate]`. Gates `nva.rallyTrail`, `nva.rallyInfiltrate` via `enablesPlanTemplates`. Scoring on `preview.feature.nvaBaseCount` with fallback to `feature.nvaBaseCount`.
- **`nva.takeControl`** — `when: { lt: [{ ref: feature.nvaMargin }, -3] }`. Applies to `[march, attack]`. Gates `nva.marchControl`, `nva.marchInfiltrateControl`. Scoring on `feature.projectedSelfMarginDelta`.
- **`nva.conventionalPressure`** — `when: { gt: [{ ref: feature.nvaTroopCount }, 8] }` (use ticket 001's fallback path if `feature.nvaTroopCount` is unavailable). Applies to `[attack, bombard]`. Gates `nva.attackAmbush`, `nva.bombardCoinStack`.
- **`nva.vcRivalRisk`** — `when: { ref: condition.vcNearWin.satisfied }`. Applies to `[move]`. Suppresses `nva.terrorSupportReduction` via `suppressesPlanTemplates`. Scoring on `feature.projectedVcMarginDelta` with `coalesce` fallback (use ticket 001's fallback path if unavailable).

### 2. Postures

Append 1 new posture to the NVA posture block of `92-agents.md`:

- **`nva.avoidVcKingmaking`** — `prefer: [{ id: vcKingmakingPenalty, when: { ref: condition.vcNearWin.satisfied }, value: { coalesce: [{ ref: preview.feature.projectedVcMarginDelta }, 0] }, weight: -6, fallback: { contribution: 0 } }]`. Use ticket 001's fallback path for `preview.feature.projectedVcMarginDelta` if unavailable.

### 3. Guardrails

Append 2 new guardrails to the NVA guardrail block of `92-agents.md` (currently `:2645-2683`):

- **`nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial`** — `scopes: [move]`, `when: { and: [{ ref: candidate.tag.infiltrate }, { ref: roleTarget.infiltrateSpace.isVcBase }, { lt: [{ coalesce: [{ ref: preview.feature.projectedSelfMarginDelta }, 0] }, 1] }, { not: { ref: condition.vcNearWin.satisfied } }] }`, `severity: demote`, `penalty: 600`, `onUnavailable: noFire`. If `roleTarget.infiltrateSpace.isVcBase` is unavailable per ticket 001, substitute the post-state `lookup` predicate for `tokens.vcBase > 0`.
- **`nva.avoidLowYieldBombard`** — `scopes: [move]`, `when: { and: [{ ref: candidate.tag.bombard }, { lt: [...] }, { not: { ref: roleTarget.bombardTarget.changesControl } }] }`, `severity: demote`, `penalty: 600`, `onUnavailable: noFire`. If `roleTarget.bombardTarget.changesControl` is unavailable, substitute a control-swing post-state aggregate per ticket 001's fallback.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — append to NVA strategy-module, posture, and guardrail blocks)

## Out of Scope

- Profile bindings (ticket 004 binds these artifacts into `nva-baseline.use.*`).
- Witness tests (ticket 005).
- Modifications to existing NVA strategy modules, postures, or guardrails (this ticket is additive only).
- Cross-faction artifacts (US, ARVN, VC).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — YAML compiles cleanly with new modules / postures / guardrails.
2. Existing NVA witnesses pass: `nva-march-infiltrate-steal-vc-base.test.ts`, `nva-protects-trail-before-coup.test.ts`.
3. Existing suite: `pnpm turbo test` — green.

### Invariants

1. No guardrail uses `severity: veto`, `effect: veto`, or `trigger:` field — these don't exist in the authored surface.
2. No posture declares an `applies:` block — postures are scoped via the templates that bind them via `postureHook`.
3. Every preview-derived posture / module term declares `fallback: { contribution: N }` or a `coalesce` default (Foundation 20).
4. Modules' `enablesPlanTemplates` / `suppressesPlanTemplates` only reference template names authored in ticket 002 plus pre-existing template names already in `92-agents.md` (no dangling references).

## Test Plan

### New/Modified Tests

None — witnesses land in ticket 005.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo test --force`
4. `pnpm run check:ticket-deps`
