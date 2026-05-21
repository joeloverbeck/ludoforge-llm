# 188FITLFOUFAC-006: ARVN legacy-consideration demotion + v2 primary-path deletion (Foundation #14 cut)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `archive/tickets/188FITLFOUFAC-003.md`, `archive/tickets/188FITLFOUFAC-004.md`, `archive/tickets/188FITLFOUFAC-005.md`

## Problem

Spec 188 §1 and §4.3 require retiring the `arvn-evolved` flat-consideration primary scoring once the authored plan structure (003), guardrails (004), and posture/relationships (005) replace it. The surviving v2 terms (projected-margin, leader-denial, etc.) are re-expressed as leaf scorers inside role-selector quality / posture `prefer` terms or the primitive fallback policy, and the v2 primary consideration path for ARVN is deleted in the same change (Foundation #14 — no backwards-compatibility dual path).

## Assumption Reassessment (2026-05-21)

1. The `arvn-evolved` profile currently binds 10 considerations (`preferProjectedSelfMargin`, `preferProjectedRank`, `preferStrongNormalizedMargin`, `penalizeOpponentMargin`, `hurtCurrentLeader`, `reduceNearestThreat`, `preferGovernWeighted`, `trainWhenControlLow`, `applyBuildPoliticalEngineModule`, `preferOptionProjectedMargin`) — confirmed during Spec 188 reassessment (`92-agents.md` lines ~742-752).
2. After tickets 003–005, the authored plan structure + posture + guardrails form the new ARVN scoring backbone, so the v2 primary consideration path can be removed.
3. Some surviving terms map to leaf scorers inside the new role-selector quality / posture `prefer` terms; the demotion is a re-home, not a wholesale delete — verify each of the 10 considerations is either re-homed or intentionally dropped before deletion.
4. Boundary reset approved 2026-05-21: the profile-quality proof showed that `preferOptionProjectedMargin` is not part of ARVN's legacy move-scoped primary scoring path. It is the microturn-scoped scorer that policy-guided inner completion uses to recover preview signal under Foundation #20. Keep that one consideration bound to `arvn-evolved`; delete the move-scoped v2 scoring considerations and any unreferenced v2-only library entries.

## Architecture Check

1. Foundation #14 atomic cut — the v2 move-scoped primary path is deleted in the same change that establishes its replacement; no dual move-scoring path lingers. The retained `preferOptionProjectedMargin` binding is microturn-scoped policy-guided completion support, not a second ARVN primary scoring backbone.
2. Single-file, mechanically-bounded change (`92-agents.md`); the diff is reviewable because each removed consideration is paired with its re-home destination (or an explicit drop rationale).
3. Preserves agnostic boundaries — all in game data (Foundation #1).

## What to Change

### 1. Re-home surviving v2 terms

For each of the 10 `arvn-evolved` considerations, either re-express it as a leaf scorer inside the relevant role-selector `quality` component (tickets 003) or posture `prefer` term (ticket 005), or as a term in the primitive fallback policy. Record the mapping in the PR description.

### 2. Delete the v2 primary consideration path

Remove the v2 flat-consideration primary scoring binding from `arvn-evolved` (the move-scoped entries in `use.considerations` and any v2-only library entries no longer referenced). Keep the microturn-scoped `preferOptionProjectedMargin` binding because policy-guided inner completion requires an authored microturn scorer. No `_legacy` alias or fallback retained.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- Proof fallout after the approved boundary reset: update existing tests/fixtures only when they pin the retired v2 move-scoring terms or the intentionally changed production GameDef hash/trajectory.

## Out of Scope

- Witnesses (007) — they verify the post-demotion ARVN behavior.
- US/NVA/VC factions (008–010).
- Do not remove library considerations still referenced by other (non-ARVN) profiles — only the ARVN v2 primary path.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles after the demotion; no dangling references to deleted considerations from the ARVN profile.
2. Other faction profiles (`us-baseline`, `nva-baseline`, `vc-baseline`) still compile — shared library considerations they reference are not removed.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. No dual move-scoring path for ARVN — exactly one primary move-scoring backbone (the authored plan structure), Foundation #14; the retained microturn scorer is inner-completion support only.
2. Determinism preserved — byte-identical compile on repeat (Foundation #16).
3. No engine/compiler diff (Foundation #1).

## Test Plan

### New/Modified Tests

1. No new test files — behavioral coverage is authored in ticket 007 (witnesses), which exercises the post-demotion scoring backbone.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/`
2. `pnpm turbo test`

## Outcome

Completed 2026-05-21.

Implemented the approved Option 1 boundary reset: deleted ARVN's move-scoped v2 flat-scoring path while retaining `preferOptionProjectedMargin` as the microturn-scoped policy-guided inner-completion scorer required by Foundation #20. The retained binding is not a second primary move-scoring backbone; it is the authored microturn signal used by policy-guided completion.

Updated `data/games/fire-in-the-lake/92-agents.md` by removing `arvn-evolved` move-scoped consideration bindings and deleting the now-unreferenced v2-only library entries: `preferProjectedRank`, `trainWhenControlLow`, `preferStrongNormalizedMargin`, `penalizeOpponentMargin`, `hurtCurrentLeader`, `reduceNearestThreat`, and `applyBuildPoliticalEngineModule`. No engine/compiler source changed.

Proof fallout was limited to existing tests/fixtures that pinned retired move-scoped terms or the intentionally changed production GameDef hash/trajectory:
- `schedule-ref-consideration-trace.test.ts` now requires only the retained microturn scorer for `arvn-evolved`.
- `arvn-seed-1000-deep-recovery.test.ts` keeps the deterministic deep-recovery witness but accepts additional recovered decisions after demotion.
- `migration-equivalence-prefer-patronage.test.ts` reflects the regenerated seed-1001 trajectory.
- Regenerated outcome-parity fixtures for seeds 1005, 1008, 1009, 1011, and 1013 with `/tmp/regenerate-188fitlfoufac-006-fixtures.mjs`.
- Regenerated the seed-1001 probe-recovery fixture with `node packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/regenerate.mjs`.
- Regenerated the chooseNStep canary golden for seed 2 / maxTurns 80 / decisionIndex 296 with `/tmp/regenerate-188fitlfoufac-006-choosenstep-canary.mjs`.

The literal drafted command `node --test packages/engine/dist/test/policy-profile-quality/` is stale under the current Node runner because the directory is treated as a module path. The corrected proof lane was `node --test packages/engine/dist/test/policy-profile-quality/*.js`.

Verification:
- `pnpm -F @ludoforge/engine build` — pass.
- `node --test packages/engine/dist/test/policy-profile-quality/*.js` — pass, 19/19 tests.
- Focused preview/compilation regression set — pass, 25/25 tests.
- `cd packages/engine && node --test dist/test/unit/agents/migration-equivalence-prefer-patronage.test.js` — pass, 2/2 tests.
- `pnpm -F @ludoforge/engine test:all` — pass, 957/957 tests.
- `pnpm turbo test` — pass, 5/5 tasks; engine default lane 165/165 files.
