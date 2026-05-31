# 203FITLNVACOM-001: NVA selector vocabulary survey (P0)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — audit only
**Deps**: `specs/203-fitl-nva-completion.md`

## Problem

Spec 203 §11 carries 5 open questions about whether specific authoring refs and source-collection shapes exist in the current FITL DSL surface. Spec 203's §§4.1–4.4 stanzas use these refs as if available, with fallback paths noted when not. Before any plan template / selector / module / posture / guardrail YAML is authored (tickets 002+), the team needs concrete answers so the §4 stanzas can be finalized without speculative refs.

The §11 open questions are:

1. `tokenProp.zone.*` post-Infiltrate prediction refs (e.g., `nvaPieceCountPostInfiltrate`, `allOtherPieceCount`, `nvaControlPostInfiltrate`).
2. `feature.nvaTroopCount` availability.
3. `feature.projectedVcMarginDelta` / `preview.feature.projectedVcMarginDelta` availability.
4. `roleTarget.X.isVcBase` / `roleTarget.X.changesControl` post-binding role-target refs.
5. `source.collection.kind: tokens` with `faction:` filter support.

This ticket produces the inventory those answers consume, plus a documented fallback path for each unavailable ref so ticket 002 can author against a concrete surface.

## Assumption Reassessment (2026-05-31)

1. Reassessment confirmed `feature.nvaBaseCount` exists at `data/games/fire-in-the-lake/92-agents.md:176`, and `feature.projectedSelfMarginDelta@253` / `feature.projectedTrailDelta@343` / `feature.nvaMargin@67` are already authored at multiple sites.
2. Reassessment did not confirm the remaining refs (P0 scope). Spec 203's §11 lists them as P0 deliverables.
3. No mismatch with codebase truth — refs known-available are excluded from this ticket's scope; only the unresolved ones remain.

## Architecture Check

1. The survey is read-only — it greps the existing authored profile (`92-agents.md`) and the DSL compiler / schema source to answer each question. No engine changes, no data authoring.
2. Findings are recorded in this ticket's Outcome section, which becomes the durable input for ticket 002 — no separate report file (minimize artifacts).
3. For each unavailable ref, the survey documents a concrete fallback path (e.g., post-state `lookup` predicates, current-state aggregation with posture-time filtering) that downstream tickets can adopt without speculative authoring.

## What to Change

### 1. Token-prop post-Infiltrate refs

Grep `data/games/fire-in-the-lake/92-agents.md` and `packages/engine/src/` for `tokenProp\.zone\.`, `tokenProp.*postInfiltrate`, and similar predictive shapes. Determine whether the FITL DSL provides post-Infiltrate token aggregates, or whether the proposal must rely on current-state aggregation plus posture-time filtering.

### 2. Feature inventory

For each candidate feature name in Spec 203's §§4.1–4.4 — `feature.nvaTroopCount`, `feature.projectedVcMarginDelta`, `preview.feature.projectedVcMarginDelta`, `preview.feature.nvaBaseCount` — grep `92-agents.md` to confirm authored existence. If not authored, check `packages/engine/src/agents/`, `packages/engine/src/cnl/`, or `packages/engine/dist/` for compiler support of the feature name.

### 3. Role-target refs

Grep for `roleTarget\.` in `92-agents.md` to enumerate authored post-binding role-target refs. Determine whether `.isVcBase` and `.changesControl` are supported by the role-target ref vocabulary, or whether the §4.4 guardrails must use post-state `lookup` predicates on `tokens.vcBase` / control-swing aggregates.

### 4. Token-scoped source collections

Grep for `source: { collection: { kind: tokens` in `92-agents.md`. Determine whether token-scoped selectors with faction filters are an authored pattern, or whether `nva.infiltrateForNvaGain` must stay zone-scoped with per-zone scoring on VC-token presence (the §4.2 draft already takes this safer route).

### 5. Inventory output

Record findings in this ticket's Outcome section as a 5-question Q&A:
- For each question: status (available / not authored / structurally adjacent / requires authoring elsewhere) plus the line citation or source-file evidence.
- For each unavailable ref: the documented fallback path that ticket 002 will adopt.

## Files to Touch

- `tickets/203FITLNVACOM-001.md` (modify — Outcome section after survey completes)

## Out of Scope

- No data authoring (`data/games/fire-in-the-lake/92-agents.md` is read-only).
- No engine changes (`packages/engine/src/**` is read-only).
- No new report files or fixtures — the inventory lives in this ticket's Outcome section.
- No re-validation of refs already confirmed by the reassessment (`feature.nvaBaseCount@176`, `feature.projectedSelfMarginDelta@253`, `feature.projectedTrailDelta@343`, `feature.nvaMargin@67`, `condition.X.satisfied` form).

## Acceptance Criteria

### Tests That Must Pass

1. No tests modified; this is an audit ticket.
2. Existing suite: `pnpm turbo test` continues to pass (sanity).

### Invariants

1. Every Spec 203 §11 open question receives an explicit answer (available / unavailable + concrete fallback path).
2. No speculative refs survive into this ticket's Outcome — only confirmed availability or a concrete fallback path.

## Test Plan

### New/Modified Tests

None — audit ticket. The deliverable is the inventory in the Outcome section.

### Commands

1. `grep -nE 'tokenProp\.zone\.|feature\.nva|feature\.projected|preview\.feature|roleTarget\.|kind: tokens' data/games/fire-in-the-lake/92-agents.md`
2. `grep -rnE 'tokenProp\.zone\.|feature\.nva|feature\.projected|preview\.feature|roleTarget\.|kind: tokens' packages/engine/src/`
3. `pnpm run check:ticket-deps`
