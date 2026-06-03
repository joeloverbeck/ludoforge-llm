# 210FITLCOMP-008: Promote NVA faction fixtures to executed-outcome tier

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/210FITLCOMP-001.md`

## Problem

NVA signature fixtures assert structurally. Spec 210 §2(12–14, 17-NVA) requires executed-outcome proof for: Rally improving Trail before Coup when Trail is low (adversarial March-violence present); March+Infiltrate creating Infiltrate conditions that improve NVA control/margin (not random VC harm); Infiltrate VC only when rational (paired VC-near-win vs VC-not-near-win); and Attack+Ambush selected over conventional Attack.

## Assumption Reassessment (2026-06-03)

1. Existing NVA fixtures: `nva-protects-trail-before-coup.test.ts`, `nva-rally-improves-trail.test.ts`, `nva-march-infiltrate-builds-nva-not-steal-vc.test.ts`, `nva-march-infiltrate-steal-vc-base.test.ts` (adversarial counterpart), `nva-avoid-low-yield-vc-steal.test.ts`, `nva-blocks-vc-near-win.test.ts`, `nva-attack-ambush-beats-conventional-attack.test.ts`. Confirmed.
2. They consume `nva-plan-witness-helpers.ts` — structural helpers to be superseded.
3. Trail outcome ref: `var.global.trail`; NVA control/margin via `victory.currentMargin.nva` / `nvaBaseCount` / `nvaTroopCount` (used in `92-agents.md`). Confirmed.
4. `nva-attack-ambush-beats-conventional-attack.test.ts` is allocated here (NVA file) for faction cohesion, though spec §2 lists it under intent #17.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14). Seven files grouped for faction-state cohesion.
2. The March+Infiltrate proof asserts NVA control/margin improves (not VC harm) — directly counters the "false-confidence" structural pattern the trigger report §8.3 flagged (FOUNDATIONS #16).
3. No engine changes (FOUNDATIONS #1).

## What to Change

### 1. Trail repair before Coup (#12) — `nva-protects-trail-before-coup.test.ts`, `nva-rally-improves-trail.test.ts`

Build a near-Coup curated state with Trail low; prove Rally is selected and executes a Trail improvement, with a March-violence move present as the adversarial root.

### 2. March+Infiltrate (#13) — `nva-march-infiltrate-builds-nva-not-steal-vc.test.ts`, `nva-march-infiltrate-steal-vc-base.test.ts`

Prove March creates Infiltrate conditions and the executed outcome improves NVA control/margin (not random VC harm). The `steal-vc-base` file serves as the adversarial counterpart (the low-yield VC-steal is the bad-but-legal alternative that is rejected when NVA-building is available).

### 3. Infiltrate VC only when rational (#14) — `nva-avoid-low-yield-vc-steal.test.ts`, `nva-blocks-vc-near-win.test.ts`

Paired: VC-near-win (Infiltrate/block selected and executed) vs VC-not-near-win (Infiltrate demoted; the low-yield VC-steal is the rejected adversarial root).

### 4. Attack+Ambush (#17-NVA) — `nva-attack-ambush-beats-conventional-attack.test.ts`

Prove Attack+Ambush is selected over conventional Attack and executes with a superior outcome; conventional Attack is the bad-but-legal alternative.

### 5. Markers + dead-helper cleanup

Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`. Prune `nva-plan-witness-helpers.ts` exports with zero remaining consumers (FOUNDATIONS #14).

## Files to Touch

- `packages/engine/test/policy-profile-quality/nva-protects-trail-before-coup.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/nva-rally-improves-trail.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/nva-march-infiltrate-builds-nva-not-steal-vc.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/nva-march-infiltrate-steal-vc-base.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/nva-avoid-low-yield-vc-steal.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/nva-blocks-vc-near-win.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/nva-attack-ambush-beats-conventional-attack.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/nva-plan-witness-helpers.ts` (modify — extend / prune dead exports)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)

## Out of Scope

- P1 NVA fixtures (`nva-bombard-concentrated-coin`, `nva-march-into-populated-control`, `nva-templates-bind-shared-modules`) — deferred / not §2 P0 intents.
- `92-agents.md` features — ticket 010.

## Acceptance Criteria

### Tests That Must Pass

1. Rally executes a Trail improvement before Coup when Trail is low, over a March-violence alternative.
2. March+Infiltrate improves NVA control/margin (not VC harm); the low-yield VC-steal is rejected.
3. Infiltrate is selected only in the VC-near-win variant; demoted in the not-near-win variant.
4. Attack+Ambush is selected over conventional Attack and executes a superior outcome.
5. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/nva-rally-improves-trail.test.js`

### Invariants

1. Each promoted fixture carries `@proof-tier: executed-outcome` + `adversarial`; original path/`describe` preserved (FOUNDATIONS #14).
2. NVA reaches executed-outcome on its primary victory engine (control/Trail) and ≥1 signature combination (spec §4 AC#1).
3. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20); replay identity holds (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. The seven NVA fixtures above — promoted to executed-outcome/adversarial tier.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/nva-protects-trail-before-coup.test.js packages/engine/dist/test/policy-profile-quality/nva-rally-improves-trail.test.js packages/engine/dist/test/policy-profile-quality/nva-march-infiltrate-builds-nva-not-steal-vc.test.js packages/engine/dist/test/policy-profile-quality/nva-march-infiltrate-steal-vc-base.test.js packages/engine/dist/test/policy-profile-quality/nva-avoid-low-yield-vc-steal.test.js packages/engine/dist/test/policy-profile-quality/nva-blocks-vc-near-win.test.js packages/engine/dist/test/policy-profile-quality/nva-attack-ambush-beats-conventional-attack.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`
