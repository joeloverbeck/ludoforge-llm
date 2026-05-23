# 190PLANROOTSEL-001: Plan-primary root authority at action-selection seam + invariants

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-agent.ts`; new architectural-invariant and determinism tests
**Deps**: `specs/190-plan-primary-root-selection.md`

## Problem

Spec 190 §4.1 closes the gap that Spec 186 §4.6 specified but never realized: at the `actionSelection` microturn the **scalar `evaluatePolicyMove` path still chooses the root**, while the plan is computed, committed to `PlanExecutionState`, and discarded for selection purposes (only `.trace` is consumed at `packages/engine/src/agents/policy-agent.ts:634`). The committed plan correctly drives subsequent (tail) microturns through `chooseFrontierDecision` → `selectPlanControlledDecision`, but the *root* is keyed entirely to the scalar pick at `:640-644`. This makes the architecture behave like the v2 utility-AI with an advisory plan stapled on, regardless of whether the user's profile authored plan templates. This ticket reworks the seam so the plan/root pair becomes authoritative at the root and demotes the scalar path to the no-template fallback (Spec 186 §4.6's literal intent; Foundation 15 root-cause completion).

## Assumption Reassessment (2026-05-23)

1. `chooseActionSelectionDecision` (`packages/engine/src/agents/policy-agent.ts:603-655`) currently calls `evaluatePolicyMove` at `:616` first, then `proposeAndCommitAdvisoryTurnPlan(...)?.trace` at `:634`, then keys `selectedDecision` to the scalar `evaluation.move` / `evaluation.metadata.selectedStableMoveKey` at `:640-644`. Verified against current `main`.
2. `proposeAndCommitAdvisoryTurnPlan` (`packages/engine/src/agents/plan-proposal.ts:177-210`) already returns `{ result: PlanProposalResult; trace: PolicyPlanTrace } | undefined`. `result.status` is the union `'selected' | 'noTemplate' | 'noRootMatch' | 'noRoleBinding'` (`plan-proposal.ts:68`, `kernel/types-plan-trace.ts:70`). `result.selected.rootStableMoveKey` is directly exposed on the selected branch (`plan-proposal.ts:54`, `:131`). The function returns `undefined` when the microturn kind is not `actionSelection`, when the seat is `__chance`/`__kernel`, when no profile resolves, or when `actionDecisions` is empty. No return-shape change is required.
3. `toMoveIdentityKey` (`packages/engine/src/kernel/move-identity.ts`) is the canonical helper for stable move-key comparison — already used at `:643` for the secondary scalar lookup. Reuse it on the plan-selected branch.
4. The existing v2-equivalence harness lives at `packages/engine/test/determinism/plan-v2-equivalence.test.ts` — it asserts that plan-less profiles produce byte-identical decisions to current behaviour. After this ticket lands, that test must continue to pass unchanged (the fallback branch is the unchanged scalar path).
5. Spec 190 §4.1 was reframed in the same session as this ticket: step 2 explicitly notes "no signature change required"; step 3 threads `input.rng` back unchanged on the plan-selected branch; step 4 uses the canonical `noRootMatch`/`noRoleBinding` discriminants.

## Architecture Check

1. **Foundation 15 (root-cause completion)** — completes Spec 186 §4.6's intended decision authority rather than tuning weights or rewriting profiles. The architecture is already ready: the plan's chosen root is computed and available via `result.selected.rootStableMoveKey`; only the consumption seam is missing.
2. **Foundation 14 (no compatibility shims)** — scalar `evaluatePolicyMove` is demoted to the genuine no-template fallback (the floor Spec 186 §11 named — "considerations are demoted, not abolished"); not aliased or wrapped. No `_legacy` suffix, no feature flag, no transition mode.
3. **Foundations 5/18/19** — plan stays advisory-to-legality (proposer matches templates against published legal root actions per Spec 186 §4.4); the returned root remains a published legal action atomic at its microturn scope; no compound shape exposed.
4. **Foundations 8/16 (determinism + testing as proof)** — on the plan-selected branch `input.rng` flows back unchanged (proposer consumes no RNG; spec §4.1 step 3). Replay-identity is preserved (proven by the new determinism test). Plan-less profiles remain byte-identical (proven by the existing `plan-v2-equivalence.test.ts` continuing to pass).
5. **No engine-agnostic boundary crossed** — the seam lives entirely within `PolicyAgent` (engine module); no game-specific identifiers introduced; no compiler or kernel changes; the plan/result contract is generic across games.

## What to Change

### 1. Rework `chooseActionSelectionDecision` to make the plan the root authority

In `packages/engine/src/agents/policy-agent.ts:603-655`:

1. Build the legal `actionSelection` decisions (unchanged from `:606-613`).
2. Call `proposeAndCommitAdvisoryTurnPlan(input, this.planExecutionState, this.profileId)` once and bind the full return value (not only `.trace`).
3. **If the return is defined and `result.status === 'selected'`**: resolve `result.selected.rootStableMoveKey` against `actionDecisions` by stable move key (use `toMoveIdentityKey(input.def, decision.move)` to match — same convention as the existing scalar lookup at `:643`). The match must succeed because the proposer derives candidate roots from the input frontier (`plan-proposal.ts:99`, `:228-248`); if it does not, throw an invariant-violation error mirroring today's `:646` pattern (e.g., `"PolicyAgent: plan-selected root not present in the published action frontier."`). Return `{ decision: <resolved>, rng: input.rng, agentDecision: <trace built from plan metadata + trace> }`. Do NOT invoke `evaluatePolicyMove` on this branch.
4. **Otherwise** (return is `undefined`, or `result.status` is `'noTemplate'` / `'noRootMatch'` / `'noRoleBinding'`): fall through to the existing scalar `evaluatePolicyMove` call at `:616` and the existing `selectedDecision` resolution at `:640-644`. This branch is the no-template fallback — behaviour-preserving for plan-less profiles and for any plan-having profile whose templates don't match the current frontier.
5. Preserve `updatePlanExecutionLifecycle` at `:595` and the plan commitment side-effect inside `proposeAndCommitAdvisoryTurnPlan` (the call already commits to `PlanExecutionState` at `plan-proposal.ts:206-207` when `result.selected` is defined).
6. The `agentDecision` trace on the plan-selected branch must still surface the plan information today's diagnostic trace carries — at minimum the plan trace (`buildPolicyAgentDecisionTrace` at `:653` currently merges `evaluation.metadata` with `plan: planTrace`). On the new branch there is no `evaluation.metadata` to start from; either (a) extend `buildPolicyAgentDecisionTrace` to accept a plan-only metadata shape, or (b) synthesize the minimum `PolicyEvaluationMetadata` needed for the trace (e.g., the selected move + a plan-provenance reason) and pass it through the existing helper. Choose whichever produces the cleaner trace contract — note the choice in the PR description.

### 2. Add the §4.2 invariant assertion for the plan-selected branch

Per Spec 190 §4.2: when `result.status === 'selected'`, the resolved decision's stable move key must equal `result.selected.rootStableMoveKey` and must be a member of the published frontier. Failure throws a `PolicyAgent` invariant error (not a silent fallback). This guard is what the architectural-invariant test asserts in §3 below.

### 3. Architectural-invariant test for the seam

New test file: `packages/engine/test/architecture/spec-190-plan-selected-root-authority.test.ts`. Test class header: `// @test-class: architectural-invariant`. Properties to assert:

1. For a corpus of `(seed, profile, microturn)` triples where the plan proposer yields `status: 'selected'`, the returned `AgentMicroturnDecisionResult.decision`'s stable move key (via `toMoveIdentityKey`) equals the committed plan root's `rootStableMoveKey`, AND the decision is a member of the input frontier `legalActions`.
2. On the plan-selected branch the scalar `evaluatePolicyMove` is not invoked. Implementation options: observe a diagnostic counter (`policyEvalCallCount` / `policyEvalDepth` from `policy-eval.ts:608-609`) before/after the agent call and assert delta == 0, OR inject an observable spy into the agent. Pick whichever produces the most stable assertion — note the choice in the test file's header comment.
3. Use existing ARVN witness fixtures (`packages/engine/test/policy-profile-quality/arvn-plan-witness-helpers.ts`) where possible to avoid hand-rolling state.

### 4. Determinism / replay-identity test for the plan-selected branch

New test file: `packages/engine/test/determinism/spec-190-plan-selected-replay-identity.test.ts`. Test class header: `// @test-class: architectural-invariant` (replay-identity is a property over any legitimate trajectory, not seed-specific). Properties to assert:

1. Two runs of the same `(GameDef, initial state, seed, action sequence)` with a plan-having profile produce identical `decisions[]` and identical `plan` trace fragments inside each `agentDecision`.
2. Canonical serialized terminal state is byte-identical across runs (per Foundations 8/16).

### 5. Verify the v2-equivalence harness still passes unchanged

The existing `packages/engine/test/determinism/plan-v2-equivalence.test.ts` (Spec 186 Phase 2(e)) asserts that plan-less profiles produce byte-identical decisions to pre-Spec-186 behaviour. After this ticket lands, that test must continue to pass without modification — the new branch logic must route plan-less profiles to the unchanged scalar fallback. Treat continued passing as an acceptance gate; do not edit the harness.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify — rework `chooseActionSelectionDecision` per §1-2 above)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify only if option (a) in §1.6 is chosen for plan-only trace input to `buildPolicyAgentDecisionTrace`; skip if option (b) is chosen)
- `packages/engine/test/architecture/spec-190-plan-selected-root-authority.test.ts` (new — architectural-invariant test, §3)
- `packages/engine/test/determinism/spec-190-plan-selected-replay-identity.test.ts` (new — replay-identity test, §4)

## Out of Scope

- **ARVN root-override behavioural witness** — owned by `tickets/190PLANROOTSEL-002.md` (Spec 190 §8 P2). This ticket lands the seam and the *property* assertions; the behavioural witness that proves the plan's root wins over a divergent scalar pick lands separately.
- **Profile-quality witness re-validation sweep** (ARVN Train+Govern + FITL four-faction) — owned by `tickets/190PLANROOTSEL-002.md`.
- **Profile rewrites** — Spec 190 Non-Goal #1 ("No profile rewrite"). The four-faction authoring (Spec 188) and demoted leaf scorers stay as authored.
- **Cookbook rewrite** — deferred per Spec 190 §12; run `reassess-agent-dsl-cookbook` after this and 002 land.
- **Posture / relationship scoring changes** — Spec 190 Non-Goal #2 (Specs 186/187 own those).
- **Kernel / legality / constructibility changes** — Spec 190 Non-Goal #3.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/architecture/spec-190-plan-selected-root-authority.test.ts` (new): asserts `selected ⇒ returned root == committed plan root ∈ legalActions` and scalar `evaluatePolicyMove` not invoked on the selected branch.
2. `packages/engine/test/determinism/spec-190-plan-selected-replay-identity.test.ts` (new): asserts plan traces and decisions replay-identical for plan-having profiles.
3. `packages/engine/test/determinism/plan-v2-equivalence.test.ts` (existing): must continue to pass without modification — proves plan-less profiles remain byte-identical.
4. Existing `packages/engine/test/policy-profile-quality/arvn-*.test.ts` continues to pass (no profile rewrite, no behavioural change for non-overriding scenarios; legitimate trajectory shifts are owned by `190PLANROOTSEL-002`, not this ticket).
5. Existing suite: `pnpm turbo test`.

### Invariants

1. `chooseActionSelectionDecision` never returns a decision whose stable move key disagrees with the committed plan root when `result.status === 'selected'`; violation throws a `PolicyAgent` invariant error rather than silently falling back to scalar.
2. On the plan-selected branch, `evaluatePolicyMove` is not invoked (proven by counter observation or spy per §3.2).
3. Plan-less profiles route deterministically through the scalar fallback; `plan-v2-equivalence.test.ts` is the byte-identity oracle.
4. Returned `rng` on the plan-selected branch is `input.rng` unchanged (no scalar-style RNG advancement on this branch).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/spec-190-plan-selected-root-authority.test.ts` (new) — architectural-invariant proving the seam contract.
2. `packages/engine/test/determinism/spec-190-plan-selected-replay-identity.test.ts` (new) — replay-identity proving plan-selected behaviour is deterministic.
3. `packages/engine/test/determinism/plan-v2-equivalence.test.ts` (no edit; must continue passing) — protects the v2-equivalence guarantee.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/spec-190-plan-selected-root-authority.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/spec-190-plan-selected-replay-identity.test.js`
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/plan-v2-equivalence.test.js`
4. `pnpm turbo test`
5. `pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed on 2026-05-23.

The action-selection seam now proposes and commits the plan before scalar evaluation. When the proposal is `selected`, `PolicyAgent` resolves the selected plan root by stable move key against the published action frontier and returns that action with `input.rng` unchanged. The scalar `evaluatePolicyMove` path is now only the fallback for no proposal, no template, no root match, or no role binding.

Implementation notes:

- Extracted the plan-selected root authority branch into `packages/engine/src/agents/policy-agent-plan-root.ts` to keep `packages/engine/src/agents/policy-agent.ts` from growing.
- Chose the synthetic metadata option for plan-selected diagnostics: the branch feeds a minimal `PolicyEvaluationMetadata` with plan provenance into the existing `buildPolicyAgentDecisionTrace` path instead of changing `policy-diagnostics.ts`.
- Exported `getPolicyEvalCallCount()` from `packages/engine/src/agents/policy-eval.ts` so the architectural test can prove `evaluatePolicyMove` is not invoked on the selected branch.
- Added a small synthetic plan-root fixture under `packages/engine/test/helpers/spec-190-plan-root-fixture.ts`; it terminates by score so replay tests exercise a bounded trajectory.

Scope deviations:

- Added `packages/engine/src/agents/policy-agent-plan-root.ts` and `packages/engine/test/helpers/spec-190-plan-root-fixture.ts`; neither was named in the original "Files to Touch", but both are local support files for the requested seam and kept the oversized agent file at no net line growth.
- The replay-identity proof uses a synthetic bounded trajectory that exercises the same plan-selected microturn contract. The production ARVN root-override behavioural witness remains owned by `tickets/190PLANROOTSEL-002.md`.
- A full `test:policy-profile-quality` run reached all visible `arvn-*` witnesses green, then failed in the non-001 `candidate-params-fitl-witness/fitl-candidate-param-witness.test.js` seed-1000 frontier assertion. That red is recorded on `tickets/190PLANROOTSEL-002.md`, which owns the profile-quality sweep/revalidation decisions.

Verification:

- `pnpm -F @ludoforge/engine build` — pass.
- `node --test packages/engine/dist/test/architecture/spec-190-plan-selected-root-authority.test.js` — pass.
- `node --test packages/engine/dist/test/determinism/spec-190-plan-selected-replay-identity.test.js` — pass.
- `node --test packages/engine/dist/test/determinism/plan-v2-equivalence.test.js` — pass.
- `node --test packages/engine/dist/test/policy-profile-quality/arvn-*.test.js` — pass, 9/9 files.
- `pnpm turbo test` — pass, 5/5 tasks.
- `pnpm turbo lint` — pass.
- `pnpm turbo typecheck` — pass.
- `pnpm -F @ludoforge/engine run test:policy-profile-quality` — partial/non-blocking for this ticket: all visible `arvn-*` witnesses passed, then the non-001 candidate-params witness failed as described above.

Source-size ledger:

- `packages/engine/src/agents/policy-agent.ts`: before 981 lines, after 981 lines, active growth 0; preexisting over-cap file did not grow.
- `packages/engine/src/agents/policy-eval.ts`: before 1734 lines, after 1733 lines, active growth -1; preexisting over-cap file did not grow.
- `packages/engine/src/agents/policy-agent-plan-root.ts`: new 89-line helper, under cap.
