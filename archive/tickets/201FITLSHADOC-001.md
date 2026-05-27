# 201FITLSHADOC-001: Metric availability survey + preview ref probe

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: `specs/201-fitl-shared-doctrine-and-lifecycle.md`

## Problem

Spec 201 §4.1 and §4.2 propose state features (`totalSupport`, `totalOpposition`, `nvaBaseCount`, `availableUsTroops`, `availableUsBases`) and candidate features (`projectedAllyMarginDelta` using `preview.relationship.nominalAlly.gainValueDelta`) whose underlying ref surfaces are *contingent* — they materialize only if either (a) a matching victory-standings formula or token-prop declaration exists, or (b) the Spec-187 relationship metadata surface exposes the preview-derived gainValue delta.

Before authoring these features (ticket 002), we need an authoritative survey of which refs materialize today vs. which need elsewhere-authoring. Features whose refs do not exist must be deferred (per Spec 201 §11 Open Questions) rather than written as broken YAML that the runtime silently ignores.

## Assumption Reassessment (2026-05-27)

1. The FITL data layout has `40-content-data-assets.md` (where `aid`, `patronage`, `trail` global vars are declared at lines 776–786) and `91-victory-standings.md` (where derived-metric formulas live). No `60-tokens.md` — confirmed by `ls data/games/fire-in-the-lake/` during Spec 201 reassessment.
2. `packages/engine/src/cnl/synthesize-derived-metrics.ts` auto-generates `metric.auto:*` metrics from declared victory-standings formulas; only `markerTotal`, `controlledPopulation`, `totalEcon` synthesis kinds exist per Spec 201's verification round.
3. Spec 187 landed the relationship metadata surface; whether `preview.relationship.nominalAlly.gainValueDelta` resolves through the preview engine is unverified — Spec 201 lists it as a P0 Open Question.

## Architecture Check

1. Foundation #2 (Evolution-First): the survey decides which YAML primitives ship in the next ticket. Authoring features against non-materializing refs would create silent runtime gaps that evolution cannot mutate around.
2. Foundation #16 (Testing as Proof): the survey produces a checked-in audit artifact (report) so the basis for the feature-availability decisions is reviewable. Investigation-only — no engine code changes.
3. No backwards-compatibility shims introduced; no aliasing.

## What to Change

### 1. Audit FITL victory-standings and token-data files

For each candidate state feature in Spec 201 §4.1, record whether it materializes from current declarations:

- `metric.auto:victory:totalSupport` — check `91-victory-standings.md` for a `totalSupport` formula.
- `metric.auto:victory:totalOpposition` — same.
- `nvaBaseCount` — Spec 201 already encodes via `globalTokenAgg` (mirrors `vcBaseCount` at `92-agents.md:104-112`). Confirm token-prop filter pattern is sufficient.
- `availableUsTroops` / `availableUsBases` — confirm whether US troops/bases in the Available standing pool can be filtered via `globalTokenAgg` `tokenFilter.props` against current token authoring.
- Optionally also check `sabotagedEcon`, `terrorMarkerCount` for completeness (mentioned in §11 Open Questions).

For each, classify as: **available** (cite the file:line that confirms), **available with adjustment** (the ref shape needs a syntax tweak; document the corrected shape), or **unavailable — defer** (the ref does not exist; mark the feature as deferred and note what would be required to author it).

### 2. Probe `preview.relationship.nominalAlly.gainValueDelta`

Verify whether the Spec-187 relationship metadata surface exposes a preview-derived ally-margin delta refable via that path. Two methods (use the cheaper one that yields a definitive answer):

- Trace through `packages/engine/src/agents/` for ref handlers resolving `preview.relationship.*` paths.
- Author a minimal probe: compile a profile with a candidate feature referencing `preview.relationship.nominalAlly.gainValueDelta`, run against a curated state with a nominal-ally relationship, and observe whether the policy surface resolves it or returns unavailable.

If unavailable, propose the per-faction direct margin fallback that Spec 201 §4.2 already names.

### 3. Update Spec 201 §11 Open Questions

For each Open Question item:
- Metric availability — list each named feature with its survey outcome.
- `preview.relationship.nominalAlly.gainValueDelta` ref — record verified status (available / fallback).
- Priority tier calibration — leave as-is; ticket 005 owns this.

## Files to Touch

- `reports/201-fitl-metric-availability-survey.md` (new — checked-in audit report)
- `specs/201-fitl-shared-doctrine-and-lifecycle.md` (modify — update §11 Open Questions with survey outcomes)

## Out of Scope

- No new YAML feature authoring (owned by 201FITLSHADOC-002).
- No engine changes; if a needed ref is unavailable, the deferral is recorded — no new metric synthesis kinds added.
- No strategic conditions, no shared modules (owned by 003 / 004 / 005 / 006).

## Acceptance Criteria

### Tests That Must Pass

1. Spec 201 §11 Open Questions has explicit outcomes recorded for each item.
2. `reports/201-fitl-metric-availability-survey.md` enumerates each Spec-201 §4.1 / §4.2 feature with one of {available, available with adjustment, unavailable — defer} plus an evidence citation.
3. Existing suite: `pnpm turbo build` passes (no code paths changed).

### Invariants

1. The survey modifies no engine source and no FITL YAML data file in this ticket.
2. Decisions are reproducible: every "available" verdict cites the specific file:line or synthesis-pipeline path that confirms availability.

## Test Plan

### New/Modified Tests

1. No new tests authored. Audit-only ticket; deliverable is a checked-in report plus the spec update.

### Commands

1. `pnpm turbo build` — confirm no inadvertent changes broke compilation.
2. Manual review of `reports/201-fitl-metric-availability-survey.md` — verify completeness against Spec 201 §4.1 / §4.2 lists.

## Outcome

Completed on 2026-05-27.

What changed:

- Added `reports/201-fitl-metric-availability-survey.md` with a per-feature verdict for every Spec 201 §11 metric/ref question.
- Updated Spec 201 §11 to record concrete P0 outcomes:
  - `totalSupport` / `totalOpposition` are available only with adjusted `metric.auto:victory:markerTotal:*` ids.
  - `nvaBaseCount` is available via `globalTokenAgg` faction/type filtering.
  - `availableUsTroops` / `availableUsBases` need `globalTokenAgg` plus `zoneFilter.zoneIds: [available-US:none]`, not token props alone.
  - `sabotagedEcon`, `terrorMarkerCount`, and `preview.relationship.nominalAlly.gainValueDelta` are deferred/unavailable.

Deviations:

- No probe fixture was authored because source tracing produced a definitive answer for `preview.relationship.nominalAlly.gainValueDelta`: only current-state `relationship.<role>.seat` / `.gainValue` refs are compiled today, and preview ref collection has no relationship family.
- No engine source or FITL YAML data file was modified.

Verification:

- Manual report completeness review: all Spec 201 §11 items were enumerated in `reports/201-fitl-metric-availability-survey.md`.
- `pnpm run check:ticket-deps` — passed for 6 active tickets and 2539 archived tickets.
- `git diff --check -- .codex/run-state/implement-spec-tickets.json specs/201-fitl-shared-doctrine-and-lifecycle.md tickets/201FITLSHADOC-001.md reports/201-fitl-metric-availability-survey.md` — passed.
- `pnpm turbo build` — passed (3 packages successful; cached package logs replayed).
