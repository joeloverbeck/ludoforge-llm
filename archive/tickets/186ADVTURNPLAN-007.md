# 186ADVTURNPLAN-007: ARVN Train+Govern proof slice (YAML + witnesses)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic advisory-plan role-binding retry for constraint satisfaction, plus FITL game data (`92-agents.md`) and engine test fixtures
**Deps**: `archive/tickets/186ADVTURNPLAN-006.md`

## Problem

Spec 186 §8 Phase 3: the smallest coherent slice that proves the architecture — an ARVN `arvn.trainGovern` plan template with `trainSpace`/`governSpace` role selectors and a `notEqual` cross-role constraint, plus witnesses asserting Train and Govern bind different spaces and that the agent falls back gracefully when the Govern frontier is unavailable. "If this slice cannot be implemented cleanly, the architecture is wrong" (source proposal §11.5).

## Assumption Reassessment (2026-05-20)

1. `data/games/fire-in-the-lake/92-agents.md` (785 lines) is the Tier-1 ARVN authoring surface; it already declares the `buildPoliticalEngine` module and an `arvn-evolved` profile (verified) — this ticket adds the v3 plan template + role selectors.
2. The runtime (controller, proposer, `PlanExecutionState`) exists after `186ADVTURNPLAN-006`; the compiler/validation after `001`/`002`. Train+Govern uses only `collection` (zone) role selectors — it does **not** need `routePairs`/`subset` (`003`).
3. Profile-quality witnesses live under `packages/engine/test/policy-profile-quality/` and are warning-class (non-blocking) per the FOUNDATIONS Appendix.
4. Boundary reset approved 2026-05-20: live generic role binding only considered the top selector candidate per role, so a `notEqual` role constraint could reject a valid plan instead of trying the next ranked candidate. This ticket now includes the minimal generic retry needed to make the authored Train+Govern proof slice truthful. The fix remains game-agnostic and introduces no FITL identifiers in `packages/engine/src/`.

## Architecture Check

1. All FITL semantics (`train`/`govern` action tags, zone filters, doctrine labels) live in `92-agents.md`; the in-scope engine change is generic constrained role-binding behavior only (Foundations #1, #2).
2. The `notEqual` cross-role constraint is authored declaratively and enforced by the generic execution controller — no game-specific branching in the engine.
3. Witnesses are profile-quality signals, not engine determinism proofs (FOUNDATIONS Appendix) — failures emit `POLICY_PROFILE_QUALITY_REGRESSION`, not a blocking determinism failure.

## What to Change

### 1. Author the plan template (`92-agents.md`)

Add `arvn.trainGovern`: `root: { actionTags: [train], compound: { specialTags: [govern], timing: after } }`; roles `trainSpace` (selector over COIN-controllable zones) and `governSpace` (selector over supported COIN-controlled zones) with `governSpace` constraint `notEqual: role.trainSpace`; steps mapping each role to its `chooseNStep`/`chooseOne` frontier match; a doctrine carrier that proposes the template; a `fallback` (`ifGovernTargetUnavailable` → train-only / primitive policy).

### 2. Author the role selectors (`92-agents.md`)

`arvn.trainSpaceForControlOrPacification` and `arvn.governPatronageSpace` as role-binding zone selectors with quality components (per the competence report's ARVN target features — authored, not engine).

### 3. Witnesses (`policy-profile-quality/`)

Train+Govern separation witness (Train space ≠ Govern space when rules require it) and a graceful-fallback witness (Govern frontier unavailable → train-only / primitive policy, no crash, decision ∈ legalActions).

### 4. Generic constrained role binding

Update the advisory plan proposer so each role selector can try subsequent ranked selector candidates when an earlier candidate violates already-bound role constraints. This is required for `governSpace notEqual role.trainSpace` to bind a valid second space instead of rejecting the whole plan.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/src/agents/plan-proposal.ts` (modify)
- `packages/engine/test/unit/agents/plan-proposal.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/arvn-train-govern-separation.test.ts` (new)
- `packages/engine/test/policy-profile-quality/arvn-train-govern-fallback.test.ts` (new)

## Out of Scope

- US/NVA/VC personalities and the full sequencing library (Spec 188).
- Posture-over-preview and ally-rival weighting (Spec 187) — the template's `postureHook`, if present, is a ref only here.
- FITL-specific engine/compiler branches.

## Acceptance Criteria

### Tests That Must Pass

1. In a constructed scenario where Train and Govern must target different spaces, the ARVN agent binds `trainSpace` ≠ `governSpace`.
2. When the Govern frontier is unavailable, the agent falls back gracefully (train-only / primitive policy); the selected decision ∈ `legalActions`; no crash.
3. The FITL GameDef compiles byte-identically with the v3 ARVN library (determinism).
4. Generic role binding retries later selector candidates when a prior selected candidate violates a role constraint.
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL identifier leaks into `packages/engine/src/` as a result of this ticket (Foundation #1).
2. Witness failures are warning-class (`POLICY_PROFILE_QUALITY_REGRESSION`), not blocking determinism failures (FOUNDATIONS Appendix).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/arvn-train-govern-separation.test.ts` (new) — `convergence-witness` (`@profile-variant: arvn-evolved`): Train≠Govern role binding. The original draft's `@witness` marker is replaced because the repo-local marker policy requires `@profile-variant` for policy-profile-quality convergence witnesses.
2. `packages/engine/test/policy-profile-quality/arvn-train-govern-fallback.test.ts` (new) — `convergence-witness` (`@profile-variant: arvn-evolved`): graceful fallback + legality-frontier compliance.
3. `packages/engine/test/unit/agents/plan-proposal.test.ts` (modified) — generic constrained role-binding retry coverage.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/arvn-train-govern-separation.test.js dist/test/policy-profile-quality/arvn-train-govern-fallback.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-20)

Implemented the ARVN Train+Govern proof slice with a generic role-binding retry fix approved as boundary reset option 1 on 2026-05-20. The production FITL agent data now declares `arvn.trainGovern` plus `trainSpace`/`governSpace` selectors, and the generic proposer now tries later selector candidates when an earlier binding violates already-bound role constraints. No FITL-specific strings or branches were added to engine source.

Files changed:

- `data/games/fire-in-the-lake/92-agents.md`
- `packages/engine/src/agents/plan-proposal.ts`
- `packages/engine/test/unit/agents/plan-proposal.test.ts`
- `packages/engine/test/policy-profile-quality/arvn-train-govern-separation.test.ts`
- `packages/engine/test/policy-profile-quality/arvn-train-govern-fallback.test.ts`

Acceptance-to-command map:

1. AC1 Train/Govern bind different spaces: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/plan-proposal.test.js dist/test/policy-profile-quality/arvn-train-govern-separation.test.js dist/test/policy-profile-quality/arvn-train-govern-fallback.test.js` passed.
2. AC2 unavailable Govern frontier falls back to a legal decision without crashing: same focused command passed.
3. AC3 FITL GameDef compiles byte-identically with the v3 ARVN library: separation witness compiles production FITL twice and compares serialized GameDef output; focused command passed.
4. AC4 generic constrained role binding retries later selector candidates: `plan-proposal.test.js` focused coverage passed.
5. AC5 existing suite: `pnpm -F @ludoforge/engine test` passed after the final YAML compaction with `[run-tests] [default] summary 165/165 files passed`.

Additional verification:

- `pnpm -F @ludoforge/engine build` passed after the final production YAML edit.
- `pnpm -F @ludoforge/engine test` ran `schema:artifacts:check` first and passed; no generated artifact updates were required.
- Engine source leak check found no FITL identifiers introduced in `packages/engine/src/agents/plan-proposal.ts` or broader `packages/engine/src`.
- The two profile-quality witnesses are warning-class `convergence-witness` tests with `@profile-variant: arvn-evolved` markers and emit policy-profile-quality records.

Source-size ledger:

- `data/games/fire-in-the-lake/92-agents.md`: 785 -> 800 lines, active +15 after compaction; at the singleton-file cap but not over. The new YAML block was compacted instead of split because `agents` is a singleton section.
- `packages/engine/src/agents/plan-proposal.ts`: 579 lines, net +47 active lines; under the 600-line threshold.
- Test files: `plan-proposal.test.ts` 341 lines; new witnesses 79 and 105 lines.
