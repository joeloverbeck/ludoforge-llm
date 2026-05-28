# 201FITLSHADOC-004: Shared strategy modules

**Status**: PENDING
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

## Architecture Check

1. Foundation #15 (Architectural Completeness): shared modules close the duplicated-doctrine gap (three `*.blockImmediateWin` modules will be replaced in ticket 005 by `shared.blockCurrentLeader`).
2. Foundation #20 (Preview Signal Integrity): any `prefer` term sourcing a preview-derived candidate feature inherits that feature's compiled `previewFallback.onUnavailable: noContribution` clause from ticket 002, enabled by prerequisite ticket `201FITLSHADOC-001B` — Foundation #20 integrity preserved.
3. Priority tiers (90/80/70/65/60/50) are illustrative; ticket 005's P3 calibration may adjust them to preserve replay-identity against existing convergence canaries. This ticket records the initial tiers; calibration lives downstream.
4. No engine changes; no schema additions.

## What to Change

### 1. Shared strategy modules — add to `agents.library.strategyModules`

Add the six entries from Spec 201 §4.4 verbatim:

- `shared.immediateWin` (tier 90; `when: condition.selfCanWinNow.satisfied`; scoreGroups: prefer weight=10 of `feature.projectedSelfMargin`)
- `shared.blockCurrentLeader` (tier 80; `when: condition.currentLeaderNearWin.satisfied`; scoreGroups: prefer weight=10 of negative `feature.projectedLeaderMarginDelta`)
- `shared.nearCoupConcreteSwing` (tier 70; `when: condition.coupImminent.satisfied`; scoreGroups: prefer weight=5 of `feature.projectedSelfMarginDelta + feature.projectedAidDelta`)
- `shared.resourceLogistics` (tier 60; `when: condition.resourcesLow.satisfied`; scoreGroups: prefer weight=4 of preview-or-current `var.player.self.resources`)
- `shared.eventDirectSwing` (tier 50; `when: candidate.tag.event-play OR activeCard.hasAnnotation.directVictorySwing`; scoreGroups: prefer weight=8 of `preview.victory.currentMargin.self` coalesce-to-current)
- `shared.allyRivalThrottle` (tier 65; `when: condition.allyNearWin.satisfied`; scoreGroups: prefer weight=-6 of `feature.projectedAllyMarginDelta`)

Each module declares `applies.scopes: [move]` and a `traceLabel` matching Spec 201's text.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — six additive entries in `strategyModules` block)

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
