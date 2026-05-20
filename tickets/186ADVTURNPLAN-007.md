# 186ADVTURNPLAN-007: ARVN Train+Govern proof slice (YAML + witnesses)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — FITL game data (`92-agents.md`) + engine test fixtures only
**Deps**: `archive/tickets/186ADVTURNPLAN-006.md`

## Problem

Spec 186 §8 Phase 3: the smallest coherent slice that proves the architecture — an ARVN `arvn.trainGovern` plan template with `trainSpace`/`governSpace` role selectors and a `notEqual` cross-role constraint, plus witnesses asserting Train and Govern bind different spaces and that the agent falls back gracefully when the Govern frontier is unavailable. "If this slice cannot be implemented cleanly, the architecture is wrong" (source proposal §11.5).

## Assumption Reassessment (2026-05-20)

1. `data/games/fire-in-the-lake/92-agents.md` (785 lines) is the Tier-1 ARVN authoring surface; it already declares the `buildPoliticalEngine` module and an `arvn-evolved` profile (verified) — this ticket adds the v3 plan template + role selectors.
2. The runtime (controller, proposer, `PlanExecutionState`) exists after `186ADVTURNPLAN-006`; the compiler/validation after `001`/`002`. Train+Govern uses only `collection` (zone) role selectors — it does **not** need `routePairs`/`subset` (`003`).
3. Profile-quality witnesses live under `packages/engine/test/policy-profile-quality/` and are warning-class (non-blocking) per the FOUNDATIONS Appendix.

## Architecture Check

1. All FITL semantics (`train`/`govern` action tags, zone filters, doctrine labels) live in `92-agents.md`; no engine code changes (Foundations #1, #2).
2. The `notEqual` cross-role constraint is authored declaratively and enforced by the generic execution controller — no game-specific branching in the engine.
3. Witnesses are profile-quality signals, not engine determinism proofs (FOUNDATIONS Appendix) — failures emit `POLICY_PROFILE_QUALITY_REGRESSION`, not a blocking determinism failure.

## What to Change

### 1. Author the plan template (`92-agents.md`)

Add `arvn.trainGovern`: `root: { actionTags: [train], compound: { specialTags: [govern], timing: after } }`; roles `trainSpace` (selector over COIN-controllable zones) and `governSpace` (selector over supported COIN-controlled zones) with `governSpace` constraint `notEqual: role.trainSpace`; steps mapping each role to its `chooseNStep`/`chooseOne` frontier match; a doctrine carrier that proposes the template; a `fallback` (`ifGovernTargetUnavailable` → train-only / primitive policy).

### 2. Author the role selectors (`92-agents.md`)

`arvn.trainSpaceForControlOrPacification` and `arvn.governPatronageSpace` as role-binding zone selectors with quality components (per the competence report's ARVN target features — authored, not engine).

### 3. Witnesses (`policy-profile-quality/`)

Train+Govern separation witness (Train space ≠ Govern space when rules require it) and a graceful-fallback witness (Govern frontier unavailable → train-only / primitive policy, no crash, decision ∈ legalActions).

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/policy-profile-quality/arvn-train-govern-separation.test.ts` (new)
- `packages/engine/test/policy-profile-quality/arvn-train-govern-fallback.test.ts` (new)

## Out of Scope

- US/NVA/VC personalities and the full sequencing library (Spec 188).
- Posture-over-preview and ally-rival weighting (Spec 187) — the template's `postureHook`, if present, is a ref only here.
- Any engine/compiler change.

## Acceptance Criteria

### Tests That Must Pass

1. In a constructed scenario where Train and Govern must target different spaces, the ARVN agent binds `trainSpace` ≠ `governSpace`.
2. When the Govern frontier is unavailable, the agent falls back gracefully (train-only / primitive policy); the selected decision ∈ `legalActions`; no crash.
3. The FITL GameDef compiles byte-identically with the v3 ARVN library (determinism).
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL identifier leaks into `packages/engine/src/` as a result of this ticket (Foundation #1).
2. Witness failures are warning-class (`POLICY_PROFILE_QUALITY_REGRESSION`), not blocking determinism failures (FOUNDATIONS Appendix).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/arvn-train-govern-separation.test.ts` (new) — `convergence-witness` (`@witness: spec-186-arvn-train-govern`): Train≠Govern role binding.
2. `packages/engine/test/policy-profile-quality/arvn-train-govern-fallback.test.ts` (new) — `convergence-witness` (`@witness: spec-186-arvn-train-govern`): graceful fallback + legality-frontier compliance.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/arvn-train-govern-separation.test.js dist/test/policy-profile-quality/arvn-train-govern-fallback.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
