# 205FITLARVSEL-001: P0 — Selector vocabulary baseline for ARVN cleanup

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — vocabulary audit only
**Deps**: `specs/205-fitl-arvn-selector-cleanup.md`

## Problem

Spec 205 §§4.1–4.7 reference placeholder names like `zoneProp.pacificationEligible`, `markers.terror` lookup paths, and `aggregate.query.tokensInZone` in selector scope without confirming which authoring form is canonical. Downstream P1/P3 tickets (205FITLARVSEL-002, -004) need a resolved vocabulary baseline to author correct YAML — without it they would either guess (risking compile failures or silent zero-contribution degradation per spec §11 boolToNumber semantics) or stall.

## Assumption Reassessment (2026-06-01)

1. Spec 205 §11 lists the four resolution forms each placeholder must classify into: (a) existing `zoneProp.prop` field, (b) inline `lookup` against `policyState` markers/control state, (c) `aggregate` over `tokensInZone`, (d) new authored derived metric.
2. `data/games/fire-in-the-lake/40-content-data-assets.md:4-200` authors zone properties `population`, `econ`, `terrainTags`, `country`, `coastal`, `category`. Other fields used in §§4.1–4.7 (`pacificationEligible`, `controlSwingPossible`, etc.) are NOT directly authored on map zones and must classify into (b), (c), or (d).
3. The existing aggregate-query exemplar at `data/games/fire-in-the-lake/92-agents.md:2001-2019` lives inside a postState predicate condition where `zone: { zoneExpr: { ref: binding, name: <name> } }` uses a `binding` ref. Selector scope uses `selector.item.key` and the canonical wrapper is unconfirmed — confirm by grepping `data/games/**/*.md` for `aggregate:` blocks inside `quality.components`.
4. `lookup` over `policyState.markers` is exercised at `92-agents.md:580-587` (Support marker). Pattern is established; other marker paths (terror, pacification, control swing) need path-name confirmation against the marker schema.
5. `previewFallback` is documented for agent considerations at `packages/engine/src/cnl/lower-agent-considerations.ts:45,71`; its applicability to plan-template posture `prefer` terms is unverified. Informational only — does not block §§4.1–4.7 work.

## Architecture Check

1. Vocabulary audit is the cheapest way to resolve §11 Open Questions and prevent P1/P3 tickets from guessing or producing silently-degraded selectors.
2. No engine or data changes; the deliverable is a markdown report (Foundation #7 — specs are data, not code).
3. No backwards-compatibility shims introduced.
4. Foundation #1 (Engine Agnosticism) preserved — the baseline is a per-game audit; engine constructs (`zoneProp`, `lookup`, `aggregate`) referenced are generic.

## What to Change

### 1. Inventory placeholder names in §§4.1–4.7

For each name, classify into (a) / (b) / (c) / (d) with a cited authoring exemplar where applicable. Names to inventory:

- `zoneProp.pacificationEligible` (§4.1)
- `lookup: { path: [markers, terror] }` (§4.1) — confirm the marker path name against the FITL marker schema
- `zoneProp.controlSwingPossible` (§4.2) and `tokenProp.zone.controlSwingFromRemoval` (§4.7) — note that the latter notation conflates token and zone scopes (per spec §11 tokenProp clarification) and must resolve to a zone-scoped form
- `zoneProp.hasInsurgentBase` (§4.2, §4.3) — likely (c) aggregate over `tokensInZone` with `prop: type, op: in, value: ['base']`
- `zoneProp.hasUndergroundEnemy` / `zoneProp.undergroundGuerrillaCount` (§4.2, §4.3) — likely (c) with `prop: underground, op: eq, value: true`
- `zoneProp.hasArvnTroops` / `zoneProp.arvnTroopCount` (§4.4) — likely (c) with `prop: faction, op: eq, value: 'ARVN'`
- `zoneProp.arvnControlCritical` (§4.4) — may require (d) new derived metric
- `zoneProp.arvnCubesExceedUsCubes` (§4.6) — already framed as (c) aggregate comparison in spec §4.6

### 2. Confirm selector-scope `aggregate.query.tokensInZone` authoring shape

Determine whether selector-scope `aggregate.query.tokensInZone` uses `zone: { zoneExpr: { ref: selector.item.key } }` or a different wrapper. Approach:
- Grep `data/games/**/*.md` for `aggregate:` blocks within `quality.components` to find an existing selector-scope exemplar.
- If none exists, document the postulated shape and flag it as a P1 risk that the first implementing ticket (205FITLARVSEL-002) confirms via compile-and-test.

### 3. Confirm `previewFallback` posture support (informational)

Grep `packages/engine/src/cnl/lower-plan-templates*.ts` (or equivalent) and authored plan-template YAML for `previewFallback` in posture `prefer` terms. Record whether the construct compiles in posture scope. Informational — feeds the deferred §10 Sweep+Raid composition follow-up, not this spec's P1-P3.

### 4. Write the report

Output: `reports/205-fitl-arvn-selector-vocabulary-baseline.md`. Contains:
- Per-name classification table with cited exemplars
- The confirmed selector-scope aggregate-query shape (or a flagged unknown with mitigation plan)
- The `previewFallback` posture-support finding
- Any (d) new-derived-metric entries flagged for follow-up authoring

The report is consumed by 205FITLARVSEL-002 and 205FITLARVSEL-004.

## Files to Touch

- `reports/205-fitl-arvn-selector-vocabulary-baseline.md` (new)

## Out of Scope

- Authoring any new derived metric YAML — only flags which names need them.
- Modifying `data/games/fire-in-the-lake/92-agents.md` — that work lands in 205FITLARVSEL-002, -003, -004.
- Resolving the deferred §10 Sweep+Raid preview composition.
- Renaming or modifying any existing selector, plan template, or guardrail.

## Acceptance Criteria

### Tests That Must Pass

1. Report file `reports/205-fitl-arvn-selector-vocabulary-baseline.md` exists and classifies every placeholder name listed in spec §§4.1–4.7.
2. Existing suite: `pnpm turbo build` (no source changes; baseline is documentation).

### Invariants

1. Every name in §§4.1–4.7 has exactly one classification (a / b / c / d).
2. Every (a) classification cites an existing authored example with file:line.
3. Every (b) and (c) classification cites the canonical authoring pattern with a YAML or code reference.
4. Every (d) classification flags downstream impact and proposes a follow-up authoring plan.
5. Foundation #1 — the baseline names generic engine constructs; no game-specific engine surface invented.

## Test Plan

### New/Modified Tests

1. None — audit/report deliverable.

### Commands

1. `ls reports/205-fitl-arvn-selector-vocabulary-baseline.md` — confirm the report exists.
2. `pnpm turbo build` — verify no source files changed and the build remains byte-deterministic.
