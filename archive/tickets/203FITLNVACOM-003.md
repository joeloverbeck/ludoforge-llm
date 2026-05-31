# 203FITLNVACOM-003: NVA strategy modules, posture, and guardrails (P2)

**Status**: COMPLETED
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

## Outcome

Completed 2026-05-31.

Implemented the ticket-003 NVA doctrine layer in `data/games/fire-in-the-lake/92-agents.md`:

1. Added support signals `feature.nvaTroopCount` and `candidate.feature.projectedVcMarginDelta`.
2. Added strategy modules `nva.baseNetwork`, `nva.takeControl`, `nva.conventionalPressure`, and `nva.vcRivalRisk`.
3. Added posture `nva.avoidVcKingmaking`.
4. Added guardrails `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial` and `nva.avoidLowYieldBombard`.

Implementation notes:

1. `nva.preserveTrail` remained owned by ticket 002, matching the approved boundary reset recorded there.
2. The king-making posture uses `feature.projectedVcMarginDelta`, not `preview.feature.projectedVcMarginDelta`, because the compiler does not accept the preview candidate-feature ref on posture evaluation. The value still has an explicit `coalesce` fallback and gates on `condition.vcNearWin.satisfied`.
3. The VC-base-steal and low-yield Bombard guardrails use the ticket-001 fallback path because the originally drafted `roleTarget.*` refs are not authored in the live surface. They demote low projected NVA-margin gain outside the VC-near-win denial case.
4. No profile bindings were changed; ticket 004 owns activation in `nva-baseline.use`.
5. No witness tests were added; ticket 005 owns new witness authoring.

Generated artifact provenance:

1. Artifact: `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json`.
2. Generator command: `UPDATE_GOLDEN=1 node --test packages/engine/dist/test/architecture/policy-wasm-coverage-manifest.test.js`.
3. Canonical inputs: production FITL agent catalog from `data/games/fire-in-the-lake/*.md` plus the retained coverage classifier in `packages/engine/test/architecture/policy-wasm-coverage-manifest.test.ts`.
4. Refresh reason: the production candidate feature set now includes `projectedVcMarginDelta`.
5. Durability witness: the retained generator test passed with and without `UPDATE_GOLDEN=1`.

Verification:

1. `pnpm turbo build --force` — passed; 3/3 tasks successful.
2. `node --test packages/engine/dist/test/policy-profile-quality/nva-march-infiltrate-steal-vc-base.test.js packages/engine/dist/test/policy-profile-quality/nva-protects-trail-before-coup.test.js` — passed; 2/2 suites passed.
3. `UPDATE_GOLDEN=1 node --test packages/engine/dist/test/architecture/policy-wasm-coverage-manifest.test.js` — passed and regenerated the coverage fixture.
4. `node --test packages/engine/dist/test/architecture/policy-wasm-coverage-manifest.test.js` — passed; 4/4 tests passed.
5. `pnpm -F @ludoforge/engine test:unit` — passed; 6107/6107 tests passed.
6. `pnpm turbo test --force` — passed; 5/5 tasks successful, engine default lane 189/189 compiled test files passed.

Source-size ledger: not applicable. This ticket changed authored FITL data and a generated JSON fixture; no TypeScript/source module crossed a source-size threshold.
