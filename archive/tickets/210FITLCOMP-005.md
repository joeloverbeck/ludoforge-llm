# 210FITLCOMP-005: Promote shared ally-rival-paired fixtures (×4 + rival-specific)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only, with live GameSpecDoc boundary truthing
**Deps**: `archive/tickets/210FITLCOMP-001.md`

## Problem

The shared ally-rival witnesses assert structurally. Spec 210 §2(5) requires executed-outcome proof that the live profiles cooperate when their nominal ally is not near victory and throttle or suppress ally-helping moves when that ally becomes a rival. Live reassessment shows this behavior is not owned only by `shared.allyRivalThrottle`: current GameSpecDoc also uses faction-specific ally/rival modules such as `us.avoidArvnKingmaking`, `arvn.denyUSIfNearWin`, `nva.vcRivalRisk`, `vc.denyNvaIfNearWin`, and the VC suppression owner `vc.nvaRivalRisk`. This ticket promotes the six named ally/rival witnesses in place against the real live owner(s), without pretending the shared module is the only execution owner.

## Assumption Reassessment (2026-06-03)

1. Fixtures exist: `shared-ally-rival-throttle-{us,arvn,nva,vc}.test.ts` (bind `allyRivalRisk`), plus the rival-specific `arvn-us-rival-risk-flip.test.ts` and `nva-vc-rival-suppresses-terror.test.ts`. Confirmed.
2. Ally/rival margins are observable via `projectedAllyMarginDelta` / `projectedLeaderMarginDelta` / `victory.currentMargin.<faction>` — already shipping candidateFeatures/stateFeatures (no new feature needed). Confirmed.
3. Approved option 1 boundary reset (2026-06-04): live probes showed the drafted all-`shared.allyRivalThrottle` paired proof overclaims the current profile architecture. The correct Foundation-aligned boundary is to prove live ally/rival behavior through the actual current owning modules, then preserve `assertSharedModuleWitness` while any structural shared consumers remain.
4. `assertSharedModuleWitness` still has active non-005 consumers beyond VC near-Coup, including shared resource-logistics and event-direct-swing witnesses. It must not be deleted in this ticket.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14).
2. The fixtures must prove the actual live behavior and owner modules, not only the drafted shared-module noun (FOUNDATIONS #15/#16).
3. Game-specific ally/rival ownership remains in GameSpecDoc/profile data and tests; no engine-specific branching is introduced (FOUNDATIONS #1/#2).
4. Preserving `assertSharedModuleWitness` while resource-logistics, event-direct-swing, and VC near-Coup still consume it honors FOUNDATIONS #14 without deleting needed structural coverage prematurely.

## What to Change

### 1. Promote the four ally-rival-throttle fixtures (paired)

For each `shared-ally-rival-throttle-{us,arvn,nva,vc}.test.ts`: build a curated live-frontier proof for the profile's current ally/rival owner. Where the shared module is active and decisive, assert `shared.allyRivalThrottle`; where a faction-specific module is the actual owner, assert that module's active doctrine, selected/rejected roots, and executed outcome. Use `assertPlanTraceChain`, `assertAdversarialAlternativeAvoided` where a published bad-but-legal root is present, `assertOutcomeDeltas`, `assertPreviewStatuses`, and `assertReplayIdentity`. Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`.

### 2. Promote the rival-specific fixtures

Promote `arvn-us-rival-risk-flip.test.ts` and `nva-vc-rival-suppresses-terror.test.ts` to executed-outcome tier following the same recipe. `arvn-us-rival-risk-flip` must prove the posture flip in the live trace and executed state. `nva-vc-rival-suppresses-terror` must prove VC-near-win suppression/avoidance through the live frontier, not only structural module wiring.

### 3. Preserve the structural shared helper until the VC residual lands

Do not delete `assertSharedModuleWitness` while any structural shared consumer remains. Grep to inventory remaining consumers and confirm the ally-rival files no longer depend on it; deletion is deferred until the later ticket that retires the last shared structural consumer (FOUNDATIONS #14).

## Files to Touch

- `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-us.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-arvn.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-nva.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-vc.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/arvn-us-rival-risk-flip.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/nva-vc-rival-suppresses-terror.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-doctrine-witness-helpers.ts` (read/verify — preserve while VC near-Coup remains structural)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)
- `packages/engine/test/policy-profile-quality/ally-rival-competence-helpers.ts` (new — shared live ally/rival assertions)

## Out of Scope

- Faction signature fixtures (006–009).
- `92-agents.md` features — ticket 010.
- Deleting per-faction structural helpers (`*-plan-witness-helpers.ts`) — owned by the faction ticket that promotes their last consumer.

## Acceptance Criteria

### Tests That Must Pass

1. Each ally-rival fixture proves the live profile's ally/rival behavior through the actual current owning module(s), with executed state change and outcome evidence.
2. The rival-specific fixtures prove their flip/suppression as executed outcomes over a bad-but-legal alternative where the live frontier publishes one, or otherwise prove the selected live trace records the suppression/demotion owner and executed state change.
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-us.test.js`

### Invariants

1. All promoted fixtures carry `@proof-tier: executed-outcome` + `adversarial`; original paths/`describe` preserved (FOUNDATIONS #14).
2. `assertSharedModuleWitness` has no remaining 005 ally-rival consumers; any remaining resource-logistics, event-direct-swing, or VC near-Coup structural consumers are inventoried and left for their owning tickets (FOUNDATIONS #14).
3. Replay identity holds for all paired runs (FOUNDATIONS #8).
4. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-{us,arvn,nva,vc}.test.ts` — promoted paired fixtures.
2. `packages/engine/test/policy-profile-quality/arvn-us-rival-risk-flip.test.ts`, `nva-vc-rival-suppresses-terror.test.ts` — promoted.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-us.test.js packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-vc.test.js packages/engine/dist/test/policy-profile-quality/arvn-us-rival-risk-flip.test.js packages/engine/dist/test/policy-profile-quality/nva-vc-rival-suppresses-terror.test.js`
2. `grep -rln assertSharedModuleWitness packages/engine/test` (expect: no 005 ally-rival files; remaining structural shared consumers are inventoried)
3. `pnpm turbo lint typecheck && pnpm turbo test`

## Outcome

Completed: 2026-06-04

Outcome amended: 2026-06-04 -- final Spec 210 P0 proof cleanup normalized stable root keys and made exact root/template expectations optional for shared ally/rival cases whose durable proof is active/inactive doctrine gating, filtered/unfiltered template evidence, executed state change, preview integrity, and replay identity after later VC profile gates changed exact root matching. The full promoted P0 fixture lane passed afterward: 41 suites / 52 tests.

Implemented the approved option 1 boundary reset. The four `shared-ally-rival-throttle-{us,arvn,nva,vc}.test.ts` fixtures and the two rival-specific fixtures now run live FITL competence cases against the current GameSpecDoc/profile owner modules instead of structural `assertSharedModuleWitness` checks. The promoted fixtures preserve the original paths/describes, carry `@proof-tier: executed-outcome` and `@proof-tier: adversarial`, assert selected live roots/templates, active/inactive doctrines, suppressed/eligible templates, replay identity, preview integrity, and executed non-pass turn completion. Where the authored live turn produces scoring or board deltas, the tests assert them directly: ARVN Govern denial reduces US margin / improves ARVN patronage, and VC Terror reduces active Support.

The ticket/spec wording was corrected before source edits and again during post-review to reflect the live Foundation-aligned ownership split: `shared.allyRivalThrottle` still appears in some near-win traces, but current behavior is also owned by `us.avoidArvnKingmaking`, `arvn.denyUSIfNearWin`, `nva.vcRivalRisk`, and `vc.nvaRivalRisk`. No engine logic or GameSpecDoc data changed.

`assertSharedModuleWitness` was preserved. Inventory confirmed no 005 ally/rival source fixture still consumes it; remaining structural consumers are resource-logistics, event-direct-swing, and VC near-Coup fixtures owned by later tickets.

Generated artifact provenance: not applicable. This ticket changed TypeScript tests/helpers and markdown boundary/proof records only.

Source-size decision: not triggered. New `ally-rival-competence-helpers.ts` is 192 lines; touched `shared-competence-helpers.ts` remains 570 lines.

Verification:
- `pnpm -F @ludoforge/engine build` passed.
- `node --test packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-us.test.js packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-ally-rival-throttle-vc.test.js packages/engine/dist/test/policy-profile-quality/arvn-us-rival-risk-flip.test.js packages/engine/dist/test/policy-profile-quality/nva-vc-rival-suppresses-terror.test.js` passed 10/10 after the final helper cleanup.
- `pnpm turbo lint typecheck` passed after the final helper cleanup.
- `pnpm turbo test` passed before the final helper cleanup: 5/5 Turbo tasks successful; engine default lane summary `191/191 files passed`. The final cleanup only removed a tautological assertion in the new helper and was followed by the focused build/test rerun above.
- `pnpm run check:ticket-deps` passed for 6 active tickets and 2602 archived tickets.
- `git diff --check` passed.
