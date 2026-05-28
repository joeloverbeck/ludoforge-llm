# 201FITLSHADOC-004: Shared strategy modules

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: `archive/tickets/201FITLSHADOC-003.md`

## Problem

Spec 201 §4.4 introduces six new shared strategy modules (`shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.resourceLogistics`, `shared.eventDirectSwing`, `shared.allyRivalThrottle`) consumed by all four `*-baseline` profile bindings (ticket 005). These modules each carry `when` clauses against ticket 003's conditions and score groups against ticket 002's features.

Without these modules, the four-faction parity scaffolding has no doctrine layer — profiles continue to reimplement the same handlers per faction (the existing three `*.blockImmediateWin` duplicates being the canonical example).

## Assumption Reassessment (2026-05-27)

1. `data/games/fire-in-the-lake/92-agents.md` declares a `strategyModules` block at line 1433 with twenty-one existing entries (verified by enumeration during Spec 201 reassessment). The six new `shared.*` entries are additive.
2. Strategy modules support the field set used by §4.4 (`traceLabel`, `when`, `applies`, `priority`, `scoreGroups`) — confirmed during Spec 201 reassessment via `compile-agent-strategy-modules.ts:19-59`.
3. The `enablesPlanTemplates` / `suppressesPlanTemplates` fields are not used by these shared modules (Spec 201 §4.4 comment: "this module elevates the scoring tier of any candidate that completes the win" — no template gating). The fields are optional per Spec 197, so the omission is safe.
4. Reassessment on 2026-05-28 found the spec draft's `scoreGroups: prefer` shorthand is not a live compiler contract. `compile-agent-strategy-modules.ts` requires `scoreGroups[].id`, optional `summary`, and `terms[]`.
5. Reassessment on 2026-05-28 also found two drafted terms directly coalesce preview refs inside module terms. Because module score terms do not carry per-term preview fallback declarations, the implementation uses existing fallback-backed candidate features where preview evidence is needed, preserving Foundation #20.
6. Reassessment on 2026-05-28 found `activeCard.hasAnnotation.directVictorySwing` is not a supported policy ref. This ticket keeps `shared.eventDirectSwing` gated on the existing `candidate.tag.event-play` surface; generic active-card annotation routing is not introduced here.

## Architecture Check

1. Foundation #15 (Architectural Completeness): shared modules close the duplicated-doctrine gap (three `*.blockImmediateWin` modules will be replaced in ticket 005 by `shared.blockCurrentLeader`).
2. Foundation #20 (Preview Signal Integrity): module terms that depend on preview evidence use existing candidate features with compiled `previewFallback.onUnavailable: noContribution` instead of directly coalescing preview refs inside module score terms.
3. Priority tiers (90/80/70/65/60/50) are illustrative; ticket 005's P3 calibration may adjust them to preserve replay-identity against existing convergence canaries. This ticket records the initial tiers; calibration lives downstream.
4. No engine changes; no schema additions.

## What to Change

### 1. Shared strategy modules — add to `agents.library.strategyModules`

Add the six entries from Spec 201 §4.4 using the live `scoreGroups[].id/summary/terms[]` schema:

- `shared.immediateWin` (tier 90; `when: condition.selfCanWinNow.satisfied`; score term weight=10 of `feature.projectedSelfMargin`)
- `shared.blockCurrentLeader` (tier 80; `when: condition.currentLeaderNearWin.satisfied`; score term weight=10 of negative `feature.projectedLeaderMarginDelta`)
- `shared.nearCoupConcreteSwing` (tier 70; `when: condition.coupImminent.satisfied`; score term weight=5 of `feature.projectedSelfMarginDelta + feature.projectedAidDelta`)
- `shared.resourceLogistics` (tier 60; `when: condition.resourcesLow.satisfied`; score terms over fallback-backed logistics deltas `feature.projectedAidDelta` and `feature.projectedTrailDelta`)
- `shared.eventDirectSwing` (tier 50; `when: candidate.tag.event-play`; score term weight=8 of fallback-backed `feature.projectedSelfMargin`)
- `shared.allyRivalThrottle` (tier 65; `when: condition.allyNearWin.satisfied`; score term weight=-6 of `feature.projectedAllyMarginDelta`)

Each module declares `applies.scopes: [move]` and a `traceLabel` matching Spec 201's text.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — six additive entries in `strategyModules` block)
- `specs/201-fitl-shared-doctrine-and-lifecycle.md` (modify — align §4.4 examples with the live module schema and Foundation #20 fallback boundary)

## Out of Scope

- Per-profile bindings (owned by 005).
- Removal of existing `*.blockImmediateWin` modules (owned by 005 — they are removed in the same change as their `shared.*` replacements bind into profiles, per Foundation #14 atomic-cut requirement).
- Priority-tier calibration against convergence canaries (deferred to 005's P3 acceptance).
- Plan-template gating via `enablesPlanTemplates` / `suppressesPlanTemplates` (not used by shared modules; reserved for future per-faction modules in Specs 202–204).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — modules compile without diagnostic.
2. Each `shared.*` module carries the required fields (`traceLabel`, `when`, `applies`, `priority`, `scoreGroups`).
3. `pnpm turbo schema:artifacts` regenerates cleanly.

### Invariants

1. All six `shared.*` modules defined at the spec-201-illustrative priority tiers (subject to 005's calibration).
2. No engine code modified.
3. Existing strategy modules (21 entries) remain unchanged in this ticket — removals owned by 005.

## Test Plan

### New/Modified Tests

1. No new tests yet — module behavior is verified once they are bound into profiles (ticket 006 witnesses). This ticket only checks compile-time well-formedness.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo lint typecheck`

## Outcome (2026-05-28)

Implemented.

What landed:

1. Added six additive `shared.*` strategy modules to `data/games/fire-in-the-lake/92-agents.md`: `shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.resourceLogistics`, `shared.eventDirectSwing`, and `shared.allyRivalThrottle`.
2. Authored the modules with the live `scoreGroups[].id/summary/terms[]` schema; no `scoreGroups: prefer` shorthand or compiler compatibility alias was added.
3. Kept preview-dependent module scoring on existing fallback-backed candidate features (`projectedSelfMargin`, `projectedLeaderMarginDelta`, `projectedSelfMarginDelta`, `projectedAidDelta`, `projectedTrailDelta`, `projectedAllyMarginDelta`) to preserve Foundation #20.
4. Retargeted `shared.eventDirectSwing` to the supported `candidate.tag.event-play` gate because `activeCard.hasAnnotation.directVictorySwing` is not a supported policy ref.
5. Updated Spec 201 §1 and §4.4 to match the live schema and event-direct-swing boundary.
6. Left all existing strategy modules, profile bindings, and `*.blockImmediateWin` modules unchanged; those remain owned by ticket 005.

Source-size decision:

1. No TypeScript source file was modified.
2. `data/games/fire-in-the-lake/92-agents.md` is a preexisting large GameSpecDoc data file; this ticket's additive data block is the requested rule-authoritative YAML change.

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. Production compile/module probe — passed; all six `shared.*` modules were present with expected trace labels, priority tiers, and score groups.
3. `pnpm turbo schema:artifacts` — passed; no schema artifacts changed.
4. `pnpm turbo lint typecheck` — passed (`5/5` tasks).
