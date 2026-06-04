# 210FITLCOMP-009: Promote VC faction fixtures to executed-outcome tier

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/210FITLCOMP-001.md`, `tickets/210FITLCOMP-010.md`

## Problem

VC signature fixtures assert structurally. Spec 210 §2(15–17) requires executed-outcome proof for: Terror executing and improving Opposition (or Support-denial) on a legal high-pop non-COIN target (low-pop Terror as adversarial); LoC-Tax selected over populated-Support Tax (populated-Support Tax demoted absent a resource crisis); and Attack+Ambush over conventional Attack plus near-Coup Agitation prep selected over a flashy irrelevant move.

## Assumption Reassessment (2026-06-03)

1. Existing VC fixtures: `vc-terror-high-pop-non-coin-controlled.test.ts`, `vc-tax-on-populated-support-vetoed.test.ts`, `vc-tax-funds-future-terror-rally.test.ts`, `vc-attack-only-with-ambush.test.ts`, `vc-avoids-conventional-attack-without-ambush.test.ts`, `vc-agitation-prep-before-coup.test.ts`. Confirmed.
2. They consume `vc-plan-witness-helpers.ts` — structural helpers to be superseded.
3. Opposition outcome ref: `metric.auto:victory:markerTotal:supportOpposition:activeOpposition:passiveOpposition`; VC margin via `victory.currentMargin.vc` (used in `92-agents.md`). Confirmed.
4. `nva-attack-ambush-beats-conventional-attack.test.ts` (listed under §2 #17) is allocated to NVA ticket 008, not here.

## Approved Retarget (2026-06-04)

Option 1 was approved after live 009 reassessment found that the current full VC profile cannot honestly satisfy the ticket's LoC-Tax selection acceptance without the YAML/profile owner first fixing the distinction. A curated LoC-guerrilla probe exposed Tax as executable when forced, but the live proposal selected `vc.rallySubvert` ahead of Rally/LoC Tax; the same probe family showed Attack+Ambush and Terror execution are viable fixture targets. Because `92-agents.md` feature/profile work is explicitly out of scope here and owned by `210FITLCOMP-010`, this ticket remains pending and now depends on 010 before returning to the six VC fixture promotions.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14). Six files grouped for faction-state cohesion; spec §2 permits merging #16/#17 where curated states overlap.
2. No engine changes (FOUNDATIONS #1).
3. The LoC-Tax proof executes the tax and asserts the resource/Opposition outcome, demoting populated-Support Tax — behavioral proof beyond the structural veto-shape check (FOUNDATIONS #16).

## What to Change

### 1. Terror high-pop non-COIN (#15) — `vc-terror-high-pop-non-coin-controlled.test.ts`

Build a curated state with a legal high-pop non-COIN target; prove Terror executes and Opposition (or Support-denial) improves, with a low-pop Terror as the adversarial root.

### 2. LoC-Tax over populated-Support Tax (#16) — `vc-tax-on-populated-support-vetoed.test.ts`, `vc-tax-funds-future-terror-rally.test.ts`

Prove LoC tax is selected and executes its resource gain; a populated-Support tax is present as the adversarial root and demoted/avoided absent a resource crisis.

### 3. Ambush-first / Agitation prep (#17-VC) — `vc-attack-only-with-ambush.test.ts`, `vc-avoids-conventional-attack-without-ambush.test.ts`, `vc-agitation-prep-before-coup.test.ts`

Prove Attack+Ambush selected over conventional Attack (conventional Attack as the adversarial root); and near-Coup Agitation prep selected over a flashy irrelevant move (the irrelevant move as adversarial root), executing an Opposition/Agitation outcome.

### 4. Markers + dead-helper cleanup

Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`. Prune `vc-plan-witness-helpers.ts` exports with zero remaining consumers (FOUNDATIONS #14).

## Files to Touch

- `packages/engine/test/policy-profile-quality/vc-terror-high-pop-non-coin-controlled.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/vc-tax-on-populated-support-vetoed.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/vc-tax-funds-future-terror-rally.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/vc-attack-only-with-ambush.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/vc-agitation-prep-before-coup.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/vc-plan-witness-helpers.ts` (modify — extend / prune dead exports)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)

## Out of Scope

- P1 VC fixtures (`vc-protects-bases-from-nva-infiltrate`, `vc-march-spreads-underground`, `vc-subvert-drops-arvn-patronage`) — deferred / not §2 P0 intents.
- `92-agents.md` features — ticket 010.
- Reweighting or adding VC Tax/profile distinctions required for LoC-Tax selection — ticket 010 prerequisite.
- `nva-attack-ambush-beats-conventional-attack.test.ts` — owned by ticket 008.

## Acceptance Criteria

### Tests That Must Pass

1. Terror executes on the high-pop non-COIN target and improves Opposition/Support-denial, over a low-pop Terror alternative.
2. LoC tax is selected and executes; populated-Support tax is present and demoted absent a resource crisis.
3. Attack+Ambush selected over conventional Attack; near-Coup Agitation prep selected over a flashy irrelevant move, with an executed Opposition/Agitation outcome.
4. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/vc-terror-high-pop-non-coin-controlled.test.js`

### Invariants

1. Each promoted fixture carries `@proof-tier: executed-outcome` + `adversarial`; original path/`describe` preserved (FOUNDATIONS #14).
2. VC reaches executed-outcome on its primary victory engine (Opposition) and ≥1 signature combination (spec §4 AC#1).
3. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20); replay identity holds (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. The six VC fixtures above — promoted to executed-outcome/adversarial tier.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/vc-terror-high-pop-non-coin-controlled.test.js packages/engine/dist/test/policy-profile-quality/vc-tax-on-populated-support-vetoed.test.js packages/engine/dist/test/policy-profile-quality/vc-tax-funds-future-terror-rally.test.js packages/engine/dist/test/policy-profile-quality/vc-attack-only-with-ambush.test.js packages/engine/dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js packages/engine/dist/test/policy-profile-quality/vc-agitation-prep-before-coup.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`
