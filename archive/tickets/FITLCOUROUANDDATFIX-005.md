# FITLCOUROUANDDATFIX-005: Coup Support Phase — Pacification and Agitation (Rule 6.3)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None expected (data-first), unless a generic legality/runtime gap is discovered
**Deps**: FITLCOUROUANDDATFIX-002 (completed), FITLCOUROUANDDATFIX-004 (resources completed)

## Problem

Rule 6.3 Coup Support is still missing in production FITL data.

Current state is partially wired:
- `coupSupport` phase exists in `turnStructure` / `coupPlan`.
- Only pass skeleton actions (`coupPacifyPass`, `coupAgitatePass`) exist.
- No production `coupPacifyUS`, `coupPacifyARVN`, or `coupAgitateVC` behavior exists.

This leaves a core Coup round step effectively non-functional despite phase routing being in place.

## Assumption Reassessment (2026-02-23)

1. Coup phase routing is engine-level generic (`coupPlan`), not FITL-specific `isCoupRound` trigger choreography (confirmed by FITLCOUROUANDDATFIX-002 outcome).
2. `coupSupport` phase exists and is reachable in production (`data/games/fire-in-the-lake/30-rules-actions.md`).
3. `coupSupportSpacesUsed`, `coupAgitationSpacesUsed`, and other support trackers are **not** present in `10-vocabulary.md`; ticket must not assume they exist.
4. `supportOpposition`, `terror`, and `sabotage` marker lattices are present in the map data asset (`40-content-data-assets.md`).
5. `rvn-leader-pacification-cost` macro exists and is the correct shared cost primitive for US/ARVN pacification.
6. Existing spend-gate macro `us-joint-op-arvn-spend-eligible` currently enforces strict `>` (`resource > totalEcon + cost`), which is stricter than Rule 1.8.1 floor semantics (“not below total Econ”).
7. Existing coup-support integration test (`packages/engine/test/integration/fitl-coup-support-phase.test.ts`) is a synthetic fixture test; it does not validate production FITL data wiring.

## Architecture Decision

Implement Coup Support as explicit production actions with data-driven per-space trackers, not hardcoded engine logic.

Chosen structure:
1. Add dedicated support actions in `30-rules-actions.md`:
- `coupPacifyUS`
- `coupPacifyARVN`
- `coupAgitateVC`
2. Keep pass actions for end-of-activity control.
3. Track per-phase per-space usage/shift caps via temporary map marker lattices (reset on `coupSupport` phase entry), not per-space hardcoded globals.
4. Reuse shared macros where appropriate (`rvn-leader-pacification-cost`) and keep any new helper macros generic.

Why this is better than current skeleton:
- Preserves generic engine/runtime boundaries.
- Keeps game behavior in GameSpec YAML.
- Scales cleanly (no per-space global var explosion, no engine FITL branching).

## Scope

### 1. Add production Coup Support actions (Rule 6.3)

In `data/games/fire-in-the-lake/30-rules-actions.md`:
- `coupPacifyUS` (seat `0`):
  - Requires COIN Control + Police + US Troops.
  - Uses ARVN Resources.
  - Enforces US floor at `totalEcon`.
  - Removes Terror or shifts support toward Active Support.
- `coupPacifyARVN` (seat `1`):
  - Requires COIN Control + Police + ARVN Troops.
  - Uses ARVN Resources (floor 0).
  - Removes Terror or shifts support toward Active Support.
- `coupAgitateVC` (seat `3`):
  - Requires VC pieces and no COIN Control.
  - Costs 1 VC Resource.
  - Removes Terror or shifts opposition toward Active Opposition.

### 2. Enforce Rule-6.3 space/shift limits data-first

- Combined US+ARVN pacification limit: max 4 spaces.
- VC agitation limit: max 4 spaces.
- Per-space shift limit during support phase: max 2 levels.
- Implement with map marker trackers reset at support phase entry (no engine changes).

### 3. Keep pass actions phase-valid

- Ensure pass actions are actor-gated so they align with support participants (US/ARVN for pacify, VC for agitate).

### 4. Rule-accuracy fix for spend-floor macro (if touched)

If `us-joint-op-arvn-spend-eligible` is reused for Rule-6.3 US spend gating, align it to floor semantics (`>= totalEcon + cost`) and update affected tests.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md`
- `data/games/fire-in-the-lake/20-macros.md`
- `data/games/fire-in-the-lake/40-content-data-assets.md` (if temporary support trackers are represented as map marker lattices)
- `packages/engine/test/integration/fitl-coup-support-phase.test.ts` (replace synthetic assertions or keep as fixture and add production test)
- `packages/engine/test/integration/*` (any tests impacted by spend-floor semantics)

## Out of Scope

- Redeploy/Commitment/Reset implementation (tickets 006-008)
- Engine-level coup routing changes (`coupPlan` runtime already implemented)
- Non-FITL gameplay behavior changes beyond direct spend-floor semantic alignment required by Rule 1.8.1

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compiles without errors.
2. US pacification production test: legal only with COIN Control + Police + US Troops; cost reflects leader modifier.
3. ARVN pacification production test: legal only with COIN Control + Police + ARVN Troops.
4. Combined pacification-space limit test: US+ARVN cannot exceed 4 unique spaces.
5. US spending-floor test: US pacification cannot drop ARVN Resources below `totalEcon`.
6. VC agitation production test: legal only with VC pieces and no COIN Control; costs 1 VC Resource.
7. VC agitation 4-space limit test.
8. Per-space 2-level cap test for support/opposition shifts within support phase.
9. Terror-removal alternative test (remove terror instead of shifting).
10. `pnpm -F @ludoforge/engine test` passes.
11. `pnpm turbo typecheck` passes.
12. `pnpm turbo lint` passes.

### Invariants

1. Support logic remains data-authored in FITL assets.
2. No FITL-specific branch logic is added to engine runtime.
3. Combined US+ARVN support spaces are capped at 4.
4. VC agitation spaces are capped at 4.
5. Per-space shifts in support phase are capped at 2.
6. US spend floor semantics match Rule 1.8.1.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-support-phase.test.ts` (production-backed support behavior coverage; replace synthetic fixture or split into production + fixture files)
2. Any existing spend-floor/joint-op tests impacted by Rule-accuracy fix

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup support|coup-support|joint operation|resource spend"`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-23
- What was actually changed:
  - Added production `coupPacifyUS`, `coupPacifyARVN`, and `coupAgitateVC` actions in `30-rules-actions.md`.
  - Added `on-coup-support-enter` trigger to reset support-phase tracker markers each support phase.
  - Added temporary map marker lattices in `40-content-data-assets.md`:
    - `coupPacifySpaceUsage`
    - `coupAgitateSpaceUsage`
    - `coupSupportShiftCount`
  - Updated Rule-1.8.1 shared spend-floor macro (`us-joint-op-arvn-spend-eligible`) from strict `>` to `>=` in `20-macros.md`.
  - Added production-backed integration coverage in `packages/engine/test/integration/fitl-coup-support-production.test.ts`.
  - Updated boundary expectation in `packages/engine/test/integration/fitl-joint-operations.test.ts`.
  - Updated lattice assertions in `packages/engine/test/unit/fitl-production-lattice.test.ts`.
- Deviations from original plan:
  - Used map marker lattices for per-space support tracking instead of introducing support-tracker globals.
  - Kept support interactions as explicit per-action resolution rather than phase-enter auto-resolution.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed (`260/260`).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
