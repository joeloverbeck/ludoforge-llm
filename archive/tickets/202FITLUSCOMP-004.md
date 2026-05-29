# 202FITLUSCOMP-004: P2b — US posture evaluators (§4.4) + guardrails (§4.5)

**Status**: ✅ COMPLETED
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

## Outcome

**Completed**: 2026-05-29

**What changed** (`data/games/fire-in-the-lake/92-agents.md`):
- **Strengthened `us.preserveSupportAndAvailability`** (posture, hooked by every US template): added two `prefer` terms preserving the existing `must` + `own-margin`/`arvn-rival-risk`: `projected-support-delta` (`feature.projectedSupportDelta`, weight 4) and `available-us` (`coalesce(preview.feature.availableUsTroops, feature.availableUsTroops)`, weight 3), each `fallback: { contribution: 0 }` (the real posture-`prefer` fallback surface, not `onUnavailable`).
- **Added 3 guardrails** (FITL `guardrails` section, after `us.avoidPoliticalAirStrike`):
  - `us.aidEconFloor` — COIN-op tag + projected `var.global.aid < 10` → `demote` 400.
  - `us.avoidOvercommitment` — (air-lift | assault) + `availableUsTroops ≤ 2` + `projectedSupportDelta < 1` → `demote` 800.
  - `us.avoidArvnKingmaking` — `arvnNearWin` + not `usNearWin` + (train | pacify) + `projectedArvnMarginDelta > 0` → `demote` 600 (mirrors `arvn.doNotServeUSWin`).

**Dedupe / surface decisions (the explicit P2 deliverable)** — recorded in spec §4.4/§11:
- **`us.airStrikePoliticalCost` DROPPED.** It duplicates the existing `us.avoidPoliticalAirStrike` guardrail (both demote Air Strike on negative projected support/margin); and the real `CompiledPostureEvaluator` schema has no `applies`/`actionTags`/`scopes`, while postures only score a plan via a template `postureHook` (`plan-proposal.ts:577`) — a standalone posture would be inert. Dedupe = retain guardrail, drop posture.
- **`us.aidEconFloor` authored as a guardrail, not a posture**, for the same inert-posture reason — so it actually fires per-candidate.
- **"veto" → high-penalty `demote`.** `veto` is not a valid `GuardrailSeverity` (`prune`/`demote`/`warn`/`auditOnly`); FITL encodes hard vetoes as high-penalty demote, reserving `prune` for the pass-drop guardrail so the last legal move is never eliminated.

`us.avoidPoliticalAirStrike` is preserved unchanged; its witness is not removed.

**Verification**: FITL compiles **0 errors**; 3 guardrails present (`demote`), posture carries 4 `prefer` terms, `us.airStrikePoliticalCost` absent as guardrail and posture. Byte-identical recompile. Bootstrap regenerated; `schema:artifacts:check` clean. Full `policy-profile-quality` suite: **60 pass / 9 fail — identical** to baseline (the 9 are pre-existing stale convergence witnesses, unrelated to spec 202); the posture strengthening is live (hooked) and added zero new failures.
