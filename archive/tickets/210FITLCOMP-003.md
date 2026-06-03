# 210FITLCOMP-003: Promote shared near-Coup concrete-swing fixtures (US/ARVN/NVA)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test + GameSpecDoc data only
**Deps**: `archive/tickets/210FITLCOMP-001.md`

## Problem

The `shared-near-coup-concrete-swing-{us,arvn,nva,vc}.test.ts` witnesses assert structurally via `assertSharedModuleWitness(file, faction, 'concreteCoupSwing')`. Spec 210 §2(3) requires executed-outcome proof that, with a Coup imminent, the agent selects a concrete swing that changes the Coup-scored property over a tempting speculative setup.

Live Foundations reassessment found an authored data gap: `distanceToCoup` reads the actual hidden-deck `schedule.distance.toBoundary.coupEntry.cards` ref and falls back to `999`, so `condition.coupImminent` cannot activate in the production observer state. `monsoonNow` already uses the bounded lower-bound schedule signal. User approved option 1 on 2026-06-03: repair the GameSpecDoc data in this ticket, then promote the witnesses.

Late boundary reset: the approved data correction plus real FITL Coup-card lookahead produced executed witnesses for US/ARVN/NVA, but the VC witness selected `march|{}|false|operation` with no Coup-scored margin/Aid delta across base, active-support, passive-opposition, and active-opposition seed scans. User approved option 1 on 2026-06-03: close this ticket on the proven US/ARVN/NVA slice and move the VC executed-outcome gap to `tickets/210FITLCOMP-010.md` as the gated YAML/profile-feature owner.

## Assumption Reassessment (2026-06-03)

1. The four fixtures exist, tagged `architectural-invariant`, binding `concreteCoupSwing` (scoreGroupId `concreteCoupSwing`). US/ARVN/NVA can be promoted here; VC remains structural until `tickets/210FITLCOMP-010.md`.
2. Coup proximity must use the bounded lower-bound schedule signal for profile-quality decisions under hidden-deck visibility. The current `distanceToCoup` actual-distance fallback to `999` is too conservative for this doctrine and prevents the executed proof. Correct in `92-agents.md`.
3. Promotion pattern + primitives established by 001.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14).
2. No engine changes; the rule-authoritative policy correction stays in GameSpecDoc data (FOUNDATIONS #1/#2).
3. Using the bounded lower-bound schedule signal preserves hidden-deck visibility and avoids treating unavailable preview/schedule data as a ready scalar (FOUNDATIONS #4/#20).
4. `assertOutcomeDeltas` proves the Coup-scored property changed — behavioral proof beyond the structural witness (FOUNDATIONS #16).

## What to Change

### 1. Promote the US/ARVN/NVA near-Coup fixtures

First update `data/games/fire-in-the-lake/92-agents.md` so `distanceToCoup` / `coupImminent` uses the same bounded lower-bound schedule evidence pattern as Monsoon rather than the hidden actual-distance ref. `coupImminent` gates at `<= 1`, so a current or next visible Coup activates the doctrine while the no-visible-Coup lower-bound row (`2`) remains non-imminent. Then, for `shared-near-coup-concrete-swing-{us,arvn,nva}.test.ts`: build a Coup-imminent curated state with a concrete swing available and a tempting speculative setup; run the live frontier; assert `shared.nearCoupConcreteSwing` is active and the selected root is in the frontier; `assertAdversarialAlternativeAvoided` (speculative setup is the trap); `assertOutcomeDeltas` proving the selected plan changes the Coup-scored property; `assertPreviewStatuses` where candidate-local decisive refs are retained; `assertReplayIdentity`. Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`.

### 2. Defer the VC executed witness to gated YAML/profile work

Keep `shared-near-coup-concrete-swing-vc.test.ts` structural in this ticket. `tickets/210FITLCOMP-010.md` owns the fixture-justified YAML/profile change needed for VC to select and execute a near-Coup concrete swing rather than a no-delta March.

## Files to Touch

- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-us.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-arvn.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-nva.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-vc.test.ts` (verified structural, deferred to `tickets/210FITLCOMP-010.md`)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)
- `data/games/fire-in-the-lake/92-agents.md` (modify — bounded lower-bound schedule data correction)

## Out of Scope

- Other shared intents and faction fixtures.
- Speculative `92-agents.md` feature additions — ticket 010. The bounded lower-bound schedule correction is in scope because it directly blocks `coupImminent`.
- VC near-Coup executed-outcome promotion — deferred to `tickets/210FITLCOMP-010.md` after live proof showed the current VC profile selects a no-delta March under the real visible-Coup setup.
- Adding shared primitives to `shared-competence-helpers.ts` (keep curated states inline to avoid collision with 002/004/005).

## Acceptance Criteria

### Tests That Must Pass

1. US/ARVN/NVA each execute a turn near Coup with `shared.nearCoupConcreteSwing` active and prove the selected concrete swing changes the Coup-scored property.
2. US/ARVN/NVA each prove the speculative setup is present and rejected.
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-us.test.js`

### Invariants

1. `@proof-tier: executed-outcome` + `adversarial`; original path/`describe` preserved (FOUNDATIONS #14).
2. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20).
3. Replay identity holds (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-{us,arvn,nva}.test.ts` — promoted.
2. `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-vc.test.ts` — verified structural; executed promotion deferred to `tickets/210FITLCOMP-010.md`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-us.test.js packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-vc.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`

## Outcome

Completed: 2026-06-03

What landed:
- Corrected `data/games/fire-in-the-lake/92-agents.md` so `distanceToCoup` uses explicit `scheduleLowerBound` on `schedule.distance.toBoundary.coupEntry.cards`, preserving hidden-deck visibility while allowing current/next visible Coup evidence.
- Kept `coupImminent` at `<= 1`: current or next visible Coup activates near-Coup, while the no-visible-Coup partial lower-bound row (`2`) remains non-imminent.
- Added `assertFitlNearCoupCase` and real FITL Coup-card lookahead support to `shared-competence-helpers.ts`.
- Promoted `shared-near-coup-concrete-swing-{us,arvn,nva}.test.ts` to executed-outcome + adversarial witnesses. Each proves `shared.nearCoupConcreteSwing` is active, the selected root is published, pass is rejected, replay identity holds, and the executed state changes a Coup-scored margin.
- Left `shared-near-coup-concrete-swing-vc.test.ts` structural. Live evidence showed the current VC profile selects `march|{}|false|operation` with no Coup-scored margin/Aid delta under the real visible-Coup setup. `tickets/210FITLCOMP-010.md` now owns the gated YAML/profile follow-up and eventual VC promotion.
- Updated the parent spec and `tickets/210FITLCOMP-005.md` so helper deletion waits for the VC residual.

Deviations from original plan:
- Original draft said ×4 promotion. User-approved option 1 narrowed this ticket to US/ARVN/NVA plus the GameSpecDoc schedule correction, with VC deferred to `tickets/210FITLCOMP-010.md`.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-us.test.js packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-vc.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-vc.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-vc.test.js` — passed, 6 tests / 6 suites.
- `node --test packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-us.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-vc.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-us.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-vc.test.js` — passed, 8 tests / 8 suites.
- `pnpm run check:ticket-deps` — passed before terminal closeout.
- `git diff --check` — passed before terminal closeout.

Source-size ledger:
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts | before 339 | after 422 | crossed cap? no | active growth +85 | extraction/defer rationale: under 800-line cap; shared near-Coup helper belongs with existing shared competence fixtures | successor: none`

Late-edit proof validity:
- Terminal status and proof transcription only. Later spec/ticket graph text changed ownership wording for the already user-approved VC deferral; rerun `pnpm run check:ticket-deps` and `git diff --check` after closeout/archive edits.
