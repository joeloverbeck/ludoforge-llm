# 210FITLCOMP-002: Promote shared immediate-win fixtures (×4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `tickets/210FITLCOMP-001.md`

## Problem

The `shared-immediate-win-{us,arvn,nva,vc}.test.ts` witnesses currently assert structurally via `assertSharedModuleWitness(file, faction, 'immediateWin')` — they never execute a turn proving the agent selects a legal winning move over a tempting non-winning setup. Spec 210 §2(2) requires `executed-outcome`/`adversarial` proof that the winning root is selected and the executed margin crosses threshold (US is the named shared exemplar; all four are promoted).

## Assumption Reassessment (2026-06-03)

1. The four fixtures exist, tagged `architectural-invariant`, binding the `immediateWin` doctrine (scoreGroupId `immediateWin`). Confirmed.
2. The promotion pattern + shared primitives are established by `210FITLCOMP-001` (`shared-competence-helpers.ts`). This ticket consumes them.
3. Victory threshold crossing is asserted via the faction victory-formula query (`victory.currentMargin.<faction>` / `victory.currentRank.<faction>`) from `91-victory-standings.md`. Confirmed.

## Architecture Check

1. Follows the canonical in-place promotion pattern from 001 (single source of truth per intent, FOUNDATIONS #14).
2. No engine changes; FITL specifics stay in fixtures/data (FOUNDATIONS #1).
3. `assertOutcomeDeltas` proves the executed margin crosses the win threshold — behavioral proof the structural witness could not give (FOUNDATIONS #16).

## What to Change

### 1. Promote the four immediate-win fixtures

For each `shared-immediate-win-{us,arvn,nva,vc}.test.ts`: build a curated state with a legal winning move plus a tempting non-winning setup; run the live frontier; `assertPlanTraceChain` (binds `<faction>.immediateWin`); `assertAdversarialAlternativeAvoided` (the non-winning setup is the trap); `assertOutcomeDeltas` proving the executed margin crosses the win threshold; `assertPreviewStatuses`; `assertReplayIdentity`. Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`.

## Files to Touch

- `packages/engine/test/policy-profile-quality/shared-immediate-win-us.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-immediate-win-arvn.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-immediate-win-nva.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-immediate-win-vc.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)

## Out of Scope

- Other shared intents (003–005) and faction fixtures (006–009).
- `92-agents.md` features — ticket 010.
- Adding shared primitives to `shared-competence-helpers.ts`: keep curated states inline in fixtures to avoid co-edit collision with 003–005. If a new shared primitive is unavoidable, coordinate by serializing after 001 and note it for 003–005.

## Acceptance Criteria

### Tests That Must Pass

1. Each fixture executes a turn, selects the winning root, and proves the executed margin crosses threshold.
2. Each fixture proves the tempting non-winning setup is present and rejected.
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-immediate-win-us.test.js`

### Invariants

1. `@proof-tier: executed-outcome` + `adversarial` present; original path/`describe` preserved (FOUNDATIONS #14).
2. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20).
3. Replay identity holds (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/shared-immediate-win-{us,arvn,nva,vc}.test.ts` — promoted to executed-outcome/adversarial tier.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-immediate-win-us.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-vc.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`
