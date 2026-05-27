# 201FITLSHADOC-002: State features and candidate features

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: `tickets/201FITLSHADOC-001.md`

## Problem

Spec 201 §4.1 and §4.2 introduce new state features (`distanceToCoup`, `monsoonNow`, `aid`, `trail`, plus survey-confirmed aggregate metrics) and new candidate features (`projectedLeaderMarginDelta`, `projectedAidDelta`, `projectedTrailDelta`, `projectedSupportDelta`, `projectedOppositionDelta`, plus survey-confirmed `projectedAllyMarginDelta`). These are the shared scaffolding that downstream tickets (003 conditions, 004 modules, 005 bindings, 006 witnesses) reference.

Without these features, the strategic conditions in ticket 003 cannot resolve their references, and the shared.* modules in ticket 004 cannot score candidates.

## Assumption Reassessment (2026-05-27)

1. `data/games/fire-in-the-lake/92-agents.md` declares `stateFeatures` and `candidateFeatures` blocks within `agents.library` (lines ~62 and ~148 per Spec 201 reassessment); new entries are additive at the bottom of each block.
2. Ticket 001's metric-availability survey has run and updated Spec 201 §11 — this ticket adopts only the features marked "available" or "available with adjustment", and skips deferred ones with a YAML comment referencing the survey.
3. `var.global.aid` and `var.global.trail` exist as game variables (declared in `40-content-data-assets.md:776,786`); analogous to the existing `var.global.patronage` ref at `92-agents.md:86`.
4. `activeCard.hasTag.<tag>` is the correct syntax (verified during Spec 201 reassessment: `packages/engine/src/agents/policy-surface.ts`; cookbook line 588).

## Architecture Check

1. Foundation #2 (Evolution-First): all new features are pure GameSpecDoc YAML data primitives consumed by evolution; the runtime treats them as additional library entries.
2. Foundation #20 (Preview Signal Integrity): every preview-derived candidate feature MUST declare explicit `previewFallback.onUnavailable: noContribution`. The new candidate features in §4.2 all include this clause; Foundation #20 is preserved without silent coercion.
3. No engine changes; no new schema fields; no backwards-compatibility shims.

## What to Change

### 1. State features — add to `agents.library.stateFeatures`

Add the entries from Spec 201 §4.1 verbatim (subject to ticket 001's survey outcomes):

- `distanceToCoup` (via `schedule.distance.toBoundary.coupEntry.cards` with `coalesce` fallback to 999)
- `monsoonNow` (boolean via `activeCard.hasTag.monsoon`)
- `aid` (via `var.global.aid`)
- `trail` (via `var.global.trail`)
- Survey-confirmed aggregate metrics from §4.1: any of `totalSupport`, `totalOpposition`, `nvaBaseCount`, `availableUsTroops`, `availableUsBases` whose underlying refs were confirmed available by ticket 001.

For deferred metrics (per ticket 001 survey), record a one-line YAML comment in the stateFeatures block: `# Deferred per 201FITLSHADOC-001 survey: <feature> — <reason>`. Downstream tickets in this chain do not consume deferred features; faction specs 202–204 surface them as their own Open Questions if needed.

### 2. Candidate features — add to `agents.library.candidateFeatures`

Add the entries from Spec 201 §4.2 verbatim:

- `projectedLeaderMarginDelta`
- `projectedAllyMarginDelta` — if ticket 001 survey confirmed `preview.relationship.nominalAlly.gainValueDelta`, use it; otherwise use per-faction direct margin fallback per Spec 201 §4.2 note.
- `projectedAidDelta`
- `projectedTrailDelta`
- `projectedSupportDelta`
- `projectedOppositionDelta`

Each declares `previewFallback.onUnavailable: noContribution` exactly as written in Spec 201 §4.2.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — additive entries to `stateFeatures` and `candidateFeatures` blocks within `agents.library`)

## Out of Scope

- Strategic conditions (owned by 003 — they reference these features but live in their own block).
- Shared strategy modules (owned by 004).
- Profile bindings (owned by 005).
- Authoring new derived metrics in `91-victory-standings.md` — survey-deferred items remain deferred until faction specs (202–204) need them.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds — features compile without diagnostic.
2. `pnpm turbo schema:artifacts` regenerates cleanly with no diff outside the additive surface.
3. Determinism: build twice; GameDef byte-identical.

### Invariants

1. Every preview-derived candidate feature in §4.2 declares `previewFallback.onUnavailable: noContribution` (Foundation #20).
2. Deferred features carry a YAML comment referencing the survey ticket (audit trail).
3. No engine code modified.

## Test Plan

### New/Modified Tests

1. No new tests in this ticket — features are authored but not yet consumed. Tests for these features are added when their consumers (modules, bindings) land in ticket 006 (witness suite).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo build` (twice) — confirm byte-identical GameDef
4. `pnpm turbo lint typecheck`
