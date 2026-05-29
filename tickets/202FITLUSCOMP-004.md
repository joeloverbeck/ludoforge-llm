# 202FITLUSCOMP-004: P2b — US posture evaluators (§4.4) + guardrails (§4.5)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: `archive/tickets/202FITLUSCOMP-002.md`

## Problem

`us-baseline` has one posture evaluator and two guardrails. Spec 202 §4.4 strengthens `us.preserveSupportAndAvailability` and adds `us.airStrikePoliticalCost` + `us.aidEconFloor`; §4.5 adds the `us.avoidOvercommitment` and `us.avoidArvnKingmaking` guardrails. These consume features authored in ticket 002 (`feature.projectedArvnMarginDelta`) and shipped preview refs.

## Assumption Reassessment (2026-05-29)

1. `us.preserveSupportAndAvailability` exists (`92-agents.md:1477-1504`) with `must` + `prefer` terms; this ticket strengthens it with projected-Support-delta and available-US-delta `prefer` terms — not a rewrite.
2. `us.airStrikePoliticalCost` is re-expressed via `preview.feature.projectedSupportDelta` (the nonexistent `roleTarget.target.*` was removed in reassessment). It overlaps the existing `us.avoidPoliticalAirStrike` guardrail (`92-agents.md:2203`, uses `feature.projectedUsMarginDelta`) — **dedupe decision is part of this ticket** (retain both, or drop the posture).
3. Guardrails author `when:`/`severity:`/`onUnavailable:` (verified against `us.avoidPoliticalAirStrike`), NOT `trigger:`/`effect:`. Preview-derived `prefer`/guardrail terms declare `onUnavailable: noContribution`/`noFire` (Foundation 20).

## Architecture Check

1. Effect-aware steering via projected-delta refs is the established FITL pattern (the existing political-air-strike guardrail uses the same proxy) — re-expressing the posture this way keeps the engine generic (no new ref namespace) and fixes the root cause (Foundation 1/15).
2. All authoring in `GameSpecDoc` YAML; no engine code.
3. Preview-signal integrity: every preview-derived term declares an explicit fallback, never silently coerced (Foundation 20).

## What to Change

### 1. Strengthen `us.preserveSupportAndAvailability` (§4.4)

Add `prefer` terms for `feature.projectedSupportDelta` and available-US (coalesce preview/state), each with `onUnavailable: noContribution`. Preserve existing `must`/`prefer` terms.

### 2. Author `us.airStrikePoliticalCost` and `us.aidEconFloor` (§4.4)

`us.airStrikePoliticalCost`: demote air-strike candidates with negative `preview.feature.projectedSupportDelta`. `us.aidEconFloor`: demote candidates dropping Aid below a floor (coalesce `preview.var.global.aid`/`var.global.aid`). **Resolve the `us.airStrikePoliticalCost` vs `us.avoidPoliticalAirStrike` overlap** and record the decision.

### 3. Author `us.avoidOvercommitment` and `us.avoidArvnKingmaking` guardrails (§4.5)

`when:`/`severity: veto`/`onUnavailable: noFire`, per §4.5. `us.avoidArvnKingmaking` gates on `condition.arvnNearWin.satisfied` + not `condition.usNearWin.satisfied` + train/pacify tags + positive `preview.feature.projectedArvnMarginDelta`.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — strengthen one posture, add two postures and two guardrails)

## Out of Scope

- Binding into `us-baseline.bindings` (ticket 005).
- Strategy modules (ticket 003).
- The existing `us.avoidPoliticalAirStrike` is preserved unless the §2 dedupe decision explicitly removes it; do not remove the `us-avoids-airstrike-populated-support.test.ts` witness.

## Acceptance Criteria

### Tests That Must Pass

1. All postures/guardrails compile; `onUnavailable` fallbacks present on every preview-derived term.
2. The existing `us-avoids-airstrike-populated-support.test.ts` still passes.
3. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. No preview-derived ref is silently coerced — each declares an explicit fallback (Foundation 20).
2. Compiler determinism: recompiling FITL yields byte-identical GameDef.

## Test Plan

### New/Modified Tests

1. Posture/guardrail behavior witnesses are authored in ticket 006 per the spec's §7 test bundling; this ticket is verified by compilation + the preserved air-strike witness.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo build && pnpm turbo test`
