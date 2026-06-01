# 204FITLVCCOM-006: P2b - VC postures and guardrails

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None - YAML authoring in `data/games/fire-in-the-lake/92-agents.md`
**Deps**: `archive/tickets/204FITLVCCOM-004.md`, `archive/tickets/204FITLVCCOM-005.md`

## Problem

Ticket 004 intentionally used existing `vc.protectOppositionAndBases` posture hooks as a transitional choice because the Spec 204 P2b postures did not exist yet. Spec 204 also requires a Tax guardrail and an NVA-near-win strengthening of `vc.protectBasesFromNvaInfiltrate`. Without this ticket, the new templates lack the preservation posture that should value Underground guerrillas, VC Bases, Agitation resources, and NVA-kingmaking risk.

## Assumption Reassessment (2026-06-01)

1. The live posture surface uses `prefer` terms with explicit `fallback: { contribution: 0 }`, matching `vc.protectOppositionAndBases` and the US/NVA posture additions.
2. Ticket 003 authored `feature.projectedNvaMarginDelta` and `feature.vcUndergroundGuerrillaCount`; prefer those exact refs when available instead of the older draft proxies.
3. Ticket 004 used transitional `postureHook: vc.protectOppositionAndBases` on the new templates. This ticket owns replacing those transitional hooks with the new postures where Spec 204 §4.4 requires it.
4. Ticket 005 owns strategy-module definitions. This ticket may rely on `vc.nvaRivalRisk` existing when deciding whether `vc.avoidNvaKingmaking` should be standalone, folded into the module, or attached as a second posture term.

## Architecture Check

1. Pure YAML posture and guardrail authoring preserves Foundations #1, #2, #7, and #20.
2. Preview-derived posture terms declare explicit fallbacks; unavailable preview signal is not silently coerced.
3. Existing templates are updated in place rather than aliased or duplicated, preserving the no-shim rule.

## What to Change

### 1. Author VC posture evaluators

Add, or defensibly re-express if live schema requires it:

- `vc.preserveUndergroundAndBases`
- `vc.preserveAgitationResources`
- `vc.avoidNvaKingmaking` or an equivalent NVA-risk posture contribution wired through `vc.nvaRivalRisk`

Use `feature.vcUndergroundGuerrillaCount`, `feature.vcBaseCount`, `var.player.self.resources`, `condition.coupImminent.satisfied`, `condition.nvaNearWin.satisfied`, and `feature.projectedNvaMarginDelta` as the primary live refs when they compile.

### 2. Replace transitional posture hooks

Update the new templates from ticket 004:

- `vc.rallyBaseNetwork`, `vc.attackAmbush`, and `vc.marchSpread` should use `vc.preserveUndergroundAndBases`.
- `vc.rallyTax` and `vc.agitationPrep` should use `vc.preserveAgitationResources`.

### 3. Author and strengthen guardrails

- Add `vc.avoidTaxWhenSupportShiftIsTooCostly`.
- Strengthen `vc.protectBasesFromNvaInfiltrate` with the NVA-near-win clause from Spec 204 §4.5, preserving the existing candidate-tag scope.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- Binding `vc.avoidTaxWhenSupportShiftIsTooCostly` into `vc-baseline`; owned by ticket 007.
- New profile-quality witnesses; owned by ticket 008.
- Engine changes unless a generic preview/ref capability gap is proven during build.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` from `packages/engine` after build
3. `pnpm run check:ticket-deps`

### Invariants

1. Every preview-derived posture value has an explicit fallback contribution.
2. The ticket leaves no transitional `postureHook: vc.protectOppositionAndBases` on templates that Spec 204 assigns to new postures, unless live schema evidence requires a documented correction.
3. Guardrail severity remains one of the generic enum values already used by the profile (`demote`, `prune`, `warn`, `auditOnly`); no fictional `veto` severity is introduced.

## Test Plan

### New/Modified Tests

- None. Existing VC witnesses must remain green; new behavior witnesses are owned by ticket 008.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `cd packages/engine && node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js`
3. `pnpm run check:ticket-deps`

## Outcome

**Completed**: 2026-06-01

**What changed**:
- Added `vc.preserveUndergroundAndBases`, `vc.preserveAgitationResources`, and `vc.avoidNvaKingmaking` posture evaluators.
- Replaced the transitional `vc.protectOppositionAndBases` hooks on `vc.rallyBaseNetwork`, `vc.marchSpread`, and `vc.attackAmbush` with `vc.preserveUndergroundAndBases`.
- Replaced the transitional `vc.protectOppositionAndBases` hooks on `vc.rallyTax` and `vc.agitationPrep` with `vc.preserveAgitationResources`.
- Strengthened `vc.protectBasesFromNvaInfiltrate` with the `condition.nvaNearWin.satisfied` clause.
- Added `vc.avoidTaxWhenSupportShiftIsTooCostly` as a library guardrail; binding it to `vc-baseline` remains owned by `tickets/204FITLVCCOM-007.md`.

**Live-contract correction**:
- CandidateFeature-derived posture terms use current `feature.vcUndergroundGuerrillaCount` and `feature.projectedNvaMarginDelta` refs. The focused witness lane rejected the draft `preview.feature.*` forms for these newly authored candidateFeatures; true preview refs retained explicit `fallback: { contribution: 0 }`.

**Verification**:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` from `packages/engine` after build — passed, 2/2 tests.
- `pnpm run check:ticket-deps` — passed for 3 active tickets and 2580 archived tickets.
- `git diff --check -- data/games/fire-in-the-lake/92-agents.md archive/tickets/204FITLVCCOM-006.md` — passed before outcome edit; final whitespace check rerun after outcome edit.
- `rg -n "preview\\.feature\\.(vcUndergroundGuerrillaCount|projectedNvaMarginDelta)" data/games/fire-in-the-lake/92-agents.md` — no matches.

**Terminal closeout**:
- Ticket graph/status integrity: `pnpm run check:ticket-deps` passed before terminal status.
- Source-size decision: `data/games/fire-in-the-lake/92-agents.md` is a preexisting large GameSpecDoc authoring file, not a source-file extraction target for this YAML-only ticket. It grew from 4097 to 4157 lines (`+68/-8`) because the required posture and guardrail entries belong in the existing agent library; splitting would widen the ticket and obscure the canonical data seam. Residual extraction owner: none for this ticket.
- Untracked/touched-file hygiene: worktree contained only `data/games/fire-in-the-lake/92-agents.md` before this Outcome edit.
- Proof lane classification: required lanes green after the preview-ref correction; no red or substituted lanes remain.
- Terminal status allowed: every named posture, hook replacement, guardrail addition, and guardrail strengthening is present, buildable, and covered by the required existing-witness regression.
