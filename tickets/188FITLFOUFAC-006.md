# 188FITLFOUFAC-006: ARVN legacy-consideration demotion + v2 primary-path deletion (Foundation #14 cut)

**Status**: PENDING
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

## Architecture Check

1. Foundation #14 atomic cut — the v2 primary path is deleted in the same change that establishes its replacement; no dual scoring path lingers.
2. Single-file, mechanically-bounded change (`92-agents.md`); the diff is reviewable because each removed consideration is paired with its re-home destination (or an explicit drop rationale).
3. Preserves agnostic boundaries — all in game data (Foundation #1).

## What to Change

### 1. Re-home surviving v2 terms

For each of the 10 `arvn-evolved` considerations, either re-express it as a leaf scorer inside the relevant role-selector `quality` component (tickets 003) or posture `prefer` term (ticket 005), or as a term in the primitive fallback policy. Record the mapping in the PR description.

### 2. Delete the v2 primary consideration path

Remove the v2 flat-consideration primary scoring binding from `arvn-evolved` (the `use.considerations` list and any v2-only library entries no longer referenced). No `_legacy` alias or fallback retained.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

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

1. No dual scoring path for ARVN — exactly one primary scoring backbone (the authored plan structure), Foundation #14.
2. Determinism preserved — byte-identical compile on repeat (Foundation #16).
3. No engine/compiler diff (Foundation #1).

## Test Plan

### New/Modified Tests

1. No new test files — behavioral coverage is authored in ticket 007 (witnesses), which exercises the post-demotion scoring backbone.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/`
2. `pnpm turbo test`
