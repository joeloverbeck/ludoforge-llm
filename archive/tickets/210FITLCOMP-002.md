# 210FITLCOMP-002: Promote shared immediate-win fixtures (×4)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/210FITLCOMP-001.md`

## Problem

The `shared-immediate-win-{us,arvn,nva,vc}.test.ts` witnesses currently assert structurally via `assertSharedModuleWitness(file, faction, 'immediateWin')` — they never execute a turn proving the agent selects a non-pass legal root while the shared immediate-win doctrine is active. Spec 210 §2(2) originally asked for executed threshold-crossing for the US exemplar, then this ticket generalized that wording to all four factions. Live reassessment against `docs/FOUNDATIONS.md` shows the generalization overstates the current shared-module contract: `shared.immediateWin` activates from `feature.projectedSelfMargin`, whose authored fallback can be the current public victory margin when bounded option preview cannot prove a full compound-turn threshold crossing. The promotion therefore proves the truthful contract: active doctrine, selected non-pass root, pass trap avoided, exact self-margin outcome evidence, executed state change, and replay identity. Where candidate-local preview trace exists, assert ready self-margin status; where the live fixture genuinely crosses threshold (VC), assert the crossing.

## Assumption Reassessment (2026-06-03)

1. The four fixtures exist, tagged `architectural-invariant`, binding the `immediateWin` doctrine (scoreGroupId `immediateWin`). Confirmed.
2. The promotion pattern + shared primitives are established by `210FITLCOMP-001` (`shared-competence-helpers.ts`). This ticket consumes them.
3. Victory threshold status is asserted via the faction victory-formula query (`victory.currentMargin.<faction>` / `victory.currentRank.<faction>`) from `91-victory-standings.md`. Threshold crossing is asserted only where bounded live evidence actually crosses (VC); already-winning current-margin fixtures assert the exact before/after self-margin.

## Architecture Check

1. Follows the canonical in-place promotion pattern from 001 (single source of truth per intent, FOUNDATIONS #14).
2. No engine changes; FITL specifics stay in fixtures/data (FOUNDATIONS #1).
3. `assertOutcomeDeltas` proves the selected live turn preserves or improves a non-losing self-margin, with exact before/after values, and proves the VC executed threshold crossing where the bounded preview contract supports that claim (FOUNDATIONS #16, #20).

## What to Change

### 1. Promote the four immediate-win fixtures

For each `shared-immediate-win-{us,arvn,nva,vc}.test.ts`: build a curated state with `shared.immediateWin` active and a pass trap; run the live frontier; assert the policy trace's active doctrine and selected non-pass root; `assertAdversarialAlternativeAvoided` (pass is the trap); `assertOutcomeDeltas` proving exact self-margin before/after and any real threshold crossing; `assertPreviewStatuses` for candidate-local self-margin evidence where candidate trace is present; `assertReplayIdentity`. Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`.

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

1. Each fixture executes a turn, selects a non-pass root while `shared.immediateWin` is active, and proves exact self-margin before/after; crossing is asserted where the live fixture crosses threshold.
2. Each fixture proves the pass trap is present and rejected.
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-immediate-win-us.test.js`

### Invariants

1. `@proof-tier: executed-outcome` + `adversarial` present; original path/`describe` preserved (FOUNDATIONS #14).
2. Candidate-local decisive self-margin refs are `ready` or explicitly traced where the selected root retains a candidate trace (FOUNDATIONS #20); otherwise the exact executed self-margin is asserted by outcome delta.
3. Replay identity holds (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/shared-immediate-win-{us,arvn,nva,vc}.test.ts` — promoted to executed-outcome/adversarial tier.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-immediate-win-us.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-vc.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`

## Outcome (2026-06-03)

Outcome amended: 2026-06-04 -- final Spec 210 P0 proof cleanup normalized stable root keys to the `noCompound` form and corrected the ARVN live immediate-win fixture to the current selected Govern root and exact self-margin improvement (+1). The full promoted P0 fixture lane passed afterward: 41 suites / 52 tests.

Promoted the four `shared.immediateWin` witnesses in place to executed-outcome/adversarial proof while keeping FITL-specific fixture state in tests and generic runner logic in `shared-competence-helpers.ts`.

Proofs run:

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/policy-profile-quality/shared-immediate-win-us.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-immediate-win-vc.test.js`
3. `node --test packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-us.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-vc.test.js`
4. `pnpm run check:ticket-deps`
5. `git diff --check`
