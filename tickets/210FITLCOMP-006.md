# 210FITLCOMP-006: Promote US faction fixtures to executed-outcome tier

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/210FITLCOMP-001.md`

## Problem

US signature fixtures assert structurally (compile/bind/score) and do not execute a turn. Spec 210 §2(6–8) requires executed-outcome proof for: Train/Pacify improving Support on a legal high-pop COIN-controlled target; Train+Advise selected over plain Train with the Advise role executed; and Safe Air Strike preferring a zero-pop/Trail target while rejecting a populated-Support target (executed Support not harmed).

## Assumption Reassessment (2026-06-03)

1. Existing US fixtures: `us-train-pacify-high-pop-support.test.ts` (convergence-witness), `us-train-advise-beats-plain-train.test.ts` (convergence-witness), `us-sweep-airstrike-prefers-zero-pop-or-trail.test.ts` (architectural-invariant), `us-avoids-airstrike-populated-support.test.ts` (architectural-invariant). Confirmed.
2. They consume `us-plan-witness-helpers.ts` (`loadUsPlanFixture`, `proposeUsPlan`, `requireAlternative`) — structural helpers to be superseded by curated executable states.
3. Support/Aid outcome refs: `metric.auto:victory:markerTotal:supportOpposition:...` and `var.global.aid` (used in `92-agents.md`). Confirmed.
4. Promotion pattern established by 001.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14). The two Air-Strike fixtures (#8) form a positive/adversarial pair across two files; both promoted together for coherence.
2. No engine changes; FITL specifics in fixtures/data (FOUNDATIONS #1).
3. `assertOutcomeDeltas` ties the proof to the named feature/token query and the US victory formula (FOUNDATIONS #16).

## What to Change

### 1. Train/Pacify (#6) — `us-train-pacify-high-pop-support.test.ts`

Build a curated state with a legal COIN-controlled high-pop target; run the live frontier; prove `us.trainPacify`/`us.pacifyTargetSpace` is selected and executed Support improves (named-feature/token query), with a lower-value target as the adversarial root.

### 2. Train+Advise (#7) — `us-train-advise-beats-plain-train.test.ts`

Prove Train+Advise is selected over plain Train on a live frontier, the Advise role executes, and the Aid/removal outcome is realized; plain Train is the bad-but-legal alternative.

### 3. Safe Air Strike (#8) — `us-sweep-airstrike-prefers-zero-pop-or-trail.test.ts` + `us-avoids-airstrike-populated-support.test.ts`

Prove the zero-pop/Trail target is selected and executed, with a populated-Support target present as the adversarial root and rejected; assert executed Support is not harmed.

### 4. Markers + dead-helper cleanup

Update each file's markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`. Remove any `us-plan-witness-helpers.ts` exports that have zero remaining consumers after promotion (FOUNDATIONS #14); if a helper still serves a not-yet-promoted US fixture, leave it.

## Files to Touch

- `packages/engine/test/policy-profile-quality/us-train-pacify-high-pop-support.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/us-train-advise-beats-plain-train.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/us-sweep-airstrike-prefers-zero-pop-or-trail.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/us-avoids-airstrike-populated-support.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/us-plan-witness-helpers.ts` (modify — extend for curated states / prune dead exports)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)

## Out of Scope

- P1 US fixtures (`us-patrol-*`, `us-airlift-*`, `us-avoid-arvn-kingmaking`) — deferred (spec §5).
- `92-agents.md` features — ticket 010.
- Shared-intent fixtures (001–005).

## Acceptance Criteria

### Tests That Must Pass

1. Train/Pacify executes and improves Support on the high-pop target over the lower-value alternative.
2. Train+Advise is selected over plain Train; Advise executes; Aid/removal outcome realized.
3. Safe Air Strike selects the zero-pop/Trail target, rejects the populated-Support target, and leaves executed Support unharmed.
4. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/us-train-pacify-high-pop-support.test.js`

### Invariants

1. Each fixture carries `@proof-tier: executed-outcome` + `adversarial`; original path/`describe` preserved (FOUNDATIONS #14).
2. US reaches executed-outcome on its primary victory engine (Support) and ≥1 signature combination (spec §4 AC#1).
3. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20); replay identity holds (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. The four US fixtures above — promoted to executed-outcome/adversarial tier.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/us-train-pacify-high-pop-support.test.js packages/engine/dist/test/policy-profile-quality/us-train-advise-beats-plain-train.test.js packages/engine/dist/test/policy-profile-quality/us-sweep-airstrike-prefers-zero-pop-or-trail.test.js packages/engine/dist/test/policy-profile-quality/us-avoids-airstrike-populated-support.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`
