# 204FITLVCCOM-003: P1 — VC candidateFeatures and new selectors

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — YAML authoring in `data/games/fire-in-the-lake/92-agents.md`
**Deps**: `archive/tickets/204FITLVCCOM-001.md`

## Problem

Spec 204 §4.1 and §4.3 reference signals that don't yet exist in `data/games/fire-in-the-lake/92-agents.md`: a `feature.projectedNvaMarginDelta` candidateFeature, an Underground-Guerrilla feature (or proxy), and 8 new item-local selectors (`vc.rallyBaseTarget`, `vc.rallySpaceForFutureOps`, `vc.taxLocTarget`, `vc.terrorHighPopTarget`, `vc.subvertHighValueTarget`, `vc.marchSpreadDestination`, `vc.attackAmbushTarget`, `vc.agitationReadinessTarget`).

Ticket 004 (P1 plan templates) cannot author its templates without the selectors; ticket 005-008 (future P2a/P2b modules and postures) cannot reference the new candidateFeatures until they're authored. This ticket lands the standalone authoring foundation that everything downstream binds to.

The exact authoring shape of the Underground-Guerrilla feature and the `vc.subvertHighValueTarget` proxy depends on the audit-table classification produced by 001 — implement against the resolved choices, not the spec's draft alternatives.

## Assumption Reassessment (2026-06-01)

1. The verified authoring surface for candidateFeatures uses the existing `candidateFeatures:` block in `data/games/fire-in-the-lake/92-agents.md` — reference shape: `projectedArvnMarginDelta@274` as `sub(feature.projectedArvnMargin, feature.arvnMargin)`. `feature.projectedNvaMargin` and `feature.nvaMargin` both exist; confirmed by `archive/tickets/204FITLVCCOM-001.md`.
2. The verified authoring surface for selectors uses `scopes`/`source`/`quality`/`result` per `vc.terrorAgitationSpace@1509` and `vc.taxFundingSpace@1555`. Item-local zone-prop reads use nested `zoneProp: { zone: { ref: selector.item.key }, prop: <name> }` for static attrs (population/econ/category); `lookup` for dynamic markers (supportOpposition); proxies for faction-specific per-zone token reads per Spec 202's §11 audit.
3. The trigger-report's fictional schema (`scope: zones`, flat `{ ref: zoneProp.X }` filters, separate `filters`/`score` keys) was caught in the reassessment — do NOT use it. Reference `archive/specs/202-fitl-us-completion.md:444` and Spec 204 §9 Corrected if implementation drifts.
4. The audit table in spec §11 (resolved by 001) supersedes any alternative listed in spec §4.2 — implement the classified path.

## Architecture Check

1. **F1 (Engine Agnosticism)** — pure YAML authoring; engine code untouched.
2. **F2 (Evolution-First)** — all new signals expressible via existing item-local read surfaces (no engine prerequisite).
3. **F15 (Architectural Completeness)** — coherent foundation for downstream ticket 004 (plan templates) and future P2a/P2b tickets (strategy modules + postures); no half-authored state.
4. **F20 (Preview Signal Integrity)** — selectors do not introduce preview-derived contributions (selectors operate on current state; preview belongs in postures/modules). No `fallback` declaration needed at the selector layer.
5. **Decomposer-grouped coherent unit** — features and selectors are authored together because the selectors' `quality.components` reference the new features (e.g., `vc.subvertHighValueTarget` scores against `feature.projectedArvnMarginDelta` sign filter). Splitting features from selectors would create a transitional state where selectors compile but reference unknown features.
6. **No backwards-compatibility shims** — new selectors are net-new; no aliases to deprecated names.

## What to Change

### 1. Author new candidateFeatures (under `candidateFeatures:` block)

**`feature.projectedNvaMarginDelta`** — sibling of `projectedArvnMarginDelta@274`:

```yaml
projectedNvaMarginDelta:
  expr:
    sub:
      - { ref: feature.projectedNvaMargin }
      - { ref: feature.nvaMargin }
```

Cite the exact shape and adjacent siblings (`projectedUsMarginDelta@268`, `projectedArvnMarginDelta@274`, `projectedVcMarginDelta@280`) from `data/games/fire-in-the-lake/92-agents.md`.

**Underground-Guerrilla feature** — author per ticket 001's resolution. Path (a) is a new `globalTokenAgg` candidateFeature; path (b) shifts the work to the posture (§4.4) and authors no new candidateFeature here; path (c) reuses the existing `feature.vcGuerrillaCount@95` and authors no new candidateFeature. Choose by reading the audit table outcome in spec §11; do not implement a path the audit rejected.

### 2. Author new selectors (under `agentSelectors:` block)

For each selector, use the verified `scopes`/`source`/`quality`/`result` surface. Use existing nearby VC selectors as reference shapes:

- `vc.terrorHighPopTarget` — reference `vc.terrorAgitationSpace@1509` for population + supportOpposition pattern. Components: `populationLeverage` (weight 5), `supportTarget` (weight 4), `nonCoinControlled` proxy (weight 3) — per spec §4.2.
- `vc.taxLocTarget` — reference `vc.taxFundingSpace@1555` for LoC-category + econ pattern. Components: `locFunding` (weight 8), `econYield` (weight 3) — per spec §4.2.
- `vc.rallyBaseTarget` — reference `vc.rallyBaseOrUndergroundSpace@1473` for Base-priority pattern. Score Highland/Jungle and non-Support spaces.
- `vc.rallySpaceForFutureOps` — Rally targets for the Rally+Tax compound (sets up future Terror/Rally with funded resources).
- `vc.subvertHighValueTarget` — ARVN-Patronage-priority proxy per ticket 001's resolution (likely `population` + `supportOpposition` marker filter + `feature.projectedArvnMarginDelta` sign filter).
- `vc.marchSpreadDestination` — Underground-network spread targets (Opposition/Neutral spaces).
- `vc.attackAmbushTarget` — surgical-removal targets (high-value COIN concentrations).
- `vc.agitationReadinessTarget` — VC pieces in non-COIN-Controlled spaces. Per spec §4.2: filter by `coinControl` proxy + `hasVcPiece` proxy; score by population + opposition marker.

Author each selector with `result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }` matching existing VC selectors.

### 3. Verify build and existing-witness regression

After authoring, run:
- `pnpm -F @ludoforge/engine build` — compiles `92-agents.md` into GameDef.
- `pnpm -F @ludoforge/engine test --grep 'vc-avoids-conventional-attack-without-ambush|vc-protects-bases-from-nva-infiltrate'` (adjusted to `node --test` syntax: `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js`).

Both witnesses must pass — the new selectors must not collide with existing selector-library entries, and the new candidateFeatures must not perturb existing module scoring.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add 1-2 candidateFeatures under existing `candidateFeatures:` block; add 8 selectors under existing `agentSelectors:` block)

## Out of Scope

- Plan templates and selector rebinding on `vc.terrorTax`/`vc.terrorSubvert` — that's ticket 004.
- Strategy modules (`vc.oppositionEngine`, `vc.baseNetwork`, etc.) — deferred to future P2a ticket.
- Posture evaluators (`vc.preserveUndergroundAndBases`, etc.) and guardrails (`vc.avoidTaxWhenSupportShiftIsTooCostly`) — deferred to future P2b ticket.
- `vc-baseline` bindings update (§4.6) — deferred to future P3 ticket (the new selectors are referenced by templates in 004, but `vc-baseline.use.planTemplates` is bound in P3).
- Witness suite (§7's 8 new tests) — deferred to future P4 ticket.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` succeeds.
2. `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` — both existing VC witnesses pass.
3. `pnpm run check:ticket-deps` succeeds.

### Invariants

1. `data/games/fire-in-the-lake/92-agents.md` compiles to a valid GameDef.
2. New selectors use only `scopes`/`source`/`quality`/`result` (no `scope: zones`, no flat `filters:`, no `score:` key — verify via `grep -nE '^\s+(scope|filters|score):' data/games/fire-in-the-lake/92-agents.md` returning no matches inside the new selector bodies).
3. New candidateFeatures use existing `feature.*` operand refs; no engine ref namespace is extended.
4. Existing two VC witnesses (`vc-avoids-conventional-attack-without-ambush`, `vc-protects-bases-from-nva-infiltrate`) pass — the new selectors don't perturb the existing plan-template scoring.

### Architecture Invariant

1. Selectors that need faction-specific per-zone token counts use proxies (population + supportOpposition marker + `feature.*` deltas) per Spec 202 §11 audit, NOT a hypothetical token-faction filter on `zoneTokenAgg`.

## Test Plan

### New/Modified Tests

- None — selectors and candidateFeatures are scoring infrastructure; behavioral coverage lands in the witness suite (deferred to future P4 ticket). Build + existing-witness regression are sufficient for this ticket.

### Commands

1. `pnpm -F @ludoforge/engine build` — primary build check.
2. `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` — existing-witness regression.
3. `pnpm turbo test` — full-suite verification at session close.
4. `pnpm run check:ticket-deps` — Deps validation.

## Outcome

**Completed**: 2026-06-01

**What changed**:
- Added `feature.projectedNvaMarginDelta` as `sub(feature.projectedNvaMargin, feature.nvaMargin)`.
- Added `feature.vcUndergroundGuerrillaCount` with `globalTokenAgg` over `faction: VC`, `type: guerrilla`, and `activity: underground`, matching the P0a resolution in `archive/tickets/204FITLVCCOM-001.md`.
- Added eight VC selectors in `data/games/fire-in-the-lake/92-agents.md`: `vc.rallyBaseTarget`, `vc.rallySpaceForFutureOps`, `vc.taxLocTarget`, `vc.terrorHighPopTarget`, `vc.subvertHighValueTarget`, `vc.marchSpreadDestination`, `vc.attackAmbushTarget`, and `vc.agitationReadinessTarget`.
- Kept faction-specific per-zone needs expressed through population, Support/Opposition markers, and projected-margin proxies; no `zoneTokenAgg` faction filter or engine ref extension was introduced.
- Post-review cleanup retargeted Spec 204's ticket list to this archived path and clarified `archive/tickets/204FITLVCCOM-004.md`'s selector-availability handoff to include `vc.agitationReadinessTarget`.

**Deviations from plan**:
- `vc.rallyBaseTarget` uses verified scalar/item-local proxies (`category`, Support/Opposition marker, projected VC margin) rather than reading `terrainTags` directly; `terrainTags` is an array and was not part of the audited selector-safe scalar surface.

**Verification**:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` from `packages/engine` after build — passed, 2/2 tests.
- `pnpm run check:ticket-deps` — passed.
- `grep -nE '^\\s+(scope|filters|score):' data/games/fire-in-the-lake/92-agents.md` — no matches.
- `git diff --check -- data/games/fire-in-the-lake/92-agents.md` — passed.

**Terminal closeout**:
- Ticket graph/status integrity: `pnpm run check:ticket-deps` passed before terminal status.
- Source-size decision: not triggered as a source-file extraction; `92-agents.md` is a preexisting large GameSpecDoc authoring file, and this ticket's required YAML additions belong in that existing data block.
- Untracked/touched-file hygiene: worktree contained only `data/games/fire-in-the-lake/92-agents.md` before this Outcome edit; whitespace check passed for the YAML edit.
- Proof lane classification: required lanes green; no red or substituted lanes.
- Terminal status allowed: every named candidateFeature and selector deliverable is present, buildable, and covered by the required existing-witness regression.
