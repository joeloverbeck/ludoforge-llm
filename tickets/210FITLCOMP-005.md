# 210FITLCOMP-005: Promote shared ally-rival-paired fixtures (×4 + rival-specific)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/210FITLCOMP-001.md`

## Problem

The shared ally-rival witnesses assert structurally. Spec 210 §2(5) requires a **paired** executed-outcome fixture: the same tempting ally-helping move with the ally far-from-win vs near-win, asserting cooperation in the former and throttle in the latter. This is the last shared-intent promotion, so it also retires the now-unused structural shared helper.

## Assumption Reassessment (2026-06-03)

1. Fixtures exist: `shared-ally-rival-throttle-{us,arvn,nva,vc}.test.ts` (bind `allyRivalRisk`), plus the rival-specific `arvn-us-rival-risk-flip.test.ts` and `nva-vc-rival-suppresses-terror.test.ts`. Confirmed.
2. Ally/rival margins are observable via `projectedAllyMarginDelta` / `projectedLeaderMarginDelta` / `victory.currentMargin.<faction>` — already shipping candidateFeatures/stateFeatures (no new feature needed). Confirmed.
3. After this ticket, most shared-doctrine fixtures (block, immediate-win, near-Coup US/ARVN/NVA, Monsoon, ally-rival) are promoted. The VC near-Coup structural consumer remains until `tickets/210FITLCOMP-010.md`, so `assertSharedModuleWitness` must not be deleted in this ticket.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14).
2. Paired (far-from-win vs near-win) construction proves the throttle is conditional on ally proximity, not a blanket behavior (FOUNDATIONS #16).
3. Deleting dead structural helpers honors FOUNDATIONS #14 (no commented-out / unused code).

## What to Change

### 1. Promote the four ally-rival-throttle fixtures (paired)

For each `shared-ally-rival-throttle-{us,arvn,nva,vc}.test.ts`: build one curated board, run it twice — ally far-from-win (prove cooperation: the ally-helping move is selected and improves the shared position) and ally near-win (prove throttle: the same move is demoted and a self-serving competent move is selected instead, with the ally-helping move as the adversarial root). Use `assertPlanTraceChain`, `assertAdversarialAlternativeAvoided`, `assertOutcomeDeltas`, `assertPreviewStatuses`, `assertReplayIdentity`. Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`.

### 2. Promote the rival-specific fixtures

Promote `arvn-us-rival-risk-flip.test.ts` and `nva-vc-rival-suppresses-terror.test.ts` to executed-outcome tier following the same recipe (each proves the rival-risk flip / terror-suppression as an executed outcome with a bad-but-legal alternative).

### 3. Preserve the structural shared helper until the VC residual lands

Do not delete `assertSharedModuleWitness` while `shared-near-coup-concrete-swing-vc.test.ts` remains structural. Grep to confirm the only remaining shared consumer is the VC near-Coup fixture; deletion is deferred to `tickets/210FITLCOMP-010.md` after that fixture is promoted (FOUNDATIONS #14).

## Files to Touch

- `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-us.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-arvn.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-nva.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-vc.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/arvn-us-rival-risk-flip.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/nva-vc-rival-suppresses-terror.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-doctrine-witness-helpers.ts` (read/verify — preserve while VC near-Coup remains structural)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)

## Out of Scope

- Faction signature fixtures (006–009).
- `92-agents.md` features — ticket 010.
- Deleting per-faction structural helpers (`*-plan-witness-helpers.ts`) — owned by the faction ticket that promotes their last consumer.

## Acceptance Criteria

### Tests That Must Pass

1. Each ally-rival fixture proves cooperation when the ally is far from win and throttle when near win, both executed with outcome deltas.
2. The rival-specific fixtures prove their flip/suppression as executed outcomes over a bad-but-legal alternative.
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-us.test.js`

### Invariants

1. All promoted fixtures carry `@proof-tier: executed-outcome` + `adversarial`; original paths/`describe` preserved (FOUNDATIONS #14).
2. `assertSharedModuleWitness` has no remaining consumers except `shared-near-coup-concrete-swing-vc.test.ts`; deletion is deferred to `tickets/210FITLCOMP-010.md` (FOUNDATIONS #14).
3. Replay identity holds for all paired runs (FOUNDATIONS #8).
4. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-{us,arvn,nva,vc}.test.ts` — promoted paired fixtures.
2. `packages/engine/test/policy-profile-quality/arvn-us-rival-risk-flip.test.ts`, `nva-vc-rival-suppresses-terror.test.ts` — promoted.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-us.test.js packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-vc.test.js packages/engine/dist/test/policy-profile-quality/arvn-us-rival-risk-flip.test.js packages/engine/dist/test/policy-profile-quality/nva-vc-rival-suppresses-terror.test.js`
2. `grep -rln assertSharedModuleWitness packages/engine/test` (expect: only the helper plus `shared-near-coup-concrete-swing-vc.test.ts`)
3. `pnpm turbo lint typecheck && pnpm turbo test`
