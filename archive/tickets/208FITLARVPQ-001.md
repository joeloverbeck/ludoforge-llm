# 208FITLARVPQ-001: Diagnose Witnesses 1–2 (plan-controller domination + turn-shape readiness)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — read-only audit producing a diagnostic script + report
**Deps**: `specs/208-fitl-arvn-baseline-pq-witness-failures.md`

## Problem

Two `policy-profile-quality` witnesses fail on the `main` baseline (branch-baseline `implemented-spec-206`, since merged) for behavioral reasons that share a suspected root cause in the plan-controller / doctrine layer:

1. `arvn-action-distribution-not-dominated` — `actionFamilyDistributionBelow{family:'any', threshold:0.60, windowMinDecisions:100}` reports `action family rate 1.000 was >= threshold=0.600`. The matched trace is plan-controlled (`plan.status: selected`, `selectedTemplate: arvn.patrolGovern`, `selectedIntent: arvn.patrolGovern`) with `0` preview refs requested — domination originates in the plan controller / doctrine layer, not in preview scoring.
2. `turn-shape-minimum-impact-observed` — `turnShapeMinimumImpactObservedBoth{evaluatorId:'currentTurnImpact'}` reports `turn-shape evaluator currentTurnImpact was never ready` across the same 100-decision window.

Both are quarantined in `SPEC_208_QUARANTINED_PROBE_IDS` (`packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts:53`). They were calibrated 2026-05-17/18 (Spec 181/182 era) **before** Spec 190/191's plan-root / plan-role rework (PR merged 2026-05-23) reshaped ARVN's trajectory. This ticket classifies each as **regression** (fix the plan-controller / doctrine / evaluator behavior) or **legitimate evolution** (distill the assertion per `.claude/rules/testing.md`).

The output of this ticket gates the execution path of ticket `tickets/208FITLARVPQ-003.md`.

## Assumption Reassessment (2026-05-31)

1. Witness 1's matched trace is plan-controlled with 0 preview refs — confirmed by the assertion message and the spec's §1 narrative; verify directly during diagnosis by running the probes' replay and inspecting one matched window's trace.
2. `currentTurnImpact` evaluator is authored in `data/games/fire-in-the-lake/92-agents.md` (the spec citation) — re-verified during reassessment.
3. The two failures may share a single root cause (plan-controlled decisions bypassing or never satisfying the `currentTurnImpact` readiness preconditions). Confirm or refute during diagnosis — they may classify identically or split.
4. `arvn.patrolGovern` is an authored plan template id in `data/games/fire-in-the-lake/92-agents.md` — re-verified during reassessment.
5. Replay windows fixture `packages/engine/test/fixtures/policy-profile-quality/fitl-arvn-action-distribution-windows.json` contains seeds `1000–1011` (12 unique seeds), not `1000–1014` — corrected during reassessment.

## Architecture Check

1. **Foundation 15 (Architectural Completeness)**: diagnosis-first separates the regression-vs-legitimate question from the fix decision. Skipping the diagnosis and reaching for either a threshold relaxation or an immediate "fix the controller" patch would risk solving the wrong problem.
2. **Foundation 16 (Testing as Proof)** + Appendix: the diagnosis report is the artifact that justifies whichever resolution path 003 takes. Distillation candidates need a written architectural-invariant rationale; regression fixes need named code paths.
3. **Engine agnosticism (Foundation 1)**: any plan-controller behavior that varies by *game* must remain encoded in `92-agents.md` (YAML), not in engine source. The diagnosis must distinguish "engine plan-controller code is wrong" from "ARVN doctrine YAML legitimately collapsed action diversity post-Spec-190/191."
4. **No engine changes in this ticket**: a read-only audit producing a checked-in diagnostic `.mjs` script (campaign pattern: `campaigns/fitl-arvn-agent-evolution/diagnose-*.mjs`) plus a written report (`reports/`). Any *fix* belongs to ticket 003.

## What to Change

### 1. Author the plan-controller / turn-shape diagnostic script

Add `campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs` following the sibling pattern in `campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs` and `diagnose-decision-cost-accumulation.mjs`. The script must:

- Replay the same 12-seed window set (`packages/engine/test/fixtures/policy-profile-quality/fitl-arvn-action-distribution-windows.json`) used by the failing probes (re-using `runProbe` from `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` is preferable to re-implementing the replay loop).
- For each matched main-phase ARVN decision, capture: `plan.status`, `selectedTemplate`, `selectedIntent`, the action family chosen, the count of preview refs requested, and the `currentTurnImpact` readiness status (ready / unknown / hidden / depth-capped / failed — per Foundation #20 status semantics).
- Aggregate per-seed and across-the-corpus distributions: action-family share, plan-template share, `currentTurnImpact` ready/non-ready ratio, and any join between plan-template selection and evaluator readiness.
- Import from `packages/engine/dist/` (the project memory's `project_spec207_root_cause.md` pattern — keeps the diagnostic loop fast).

### 2. Determine Witness 1's regression-vs-legitimate verdict

Using the diagnostic output, classify whether the `arvn.patrolGovern` 100%-share is:

- **(R) Regression**: Spec 190 (plan-primary root authority) or Spec 191 (plan-role semantic integrity) inadvertently suppressed eligibility of competing ARVN plan templates that were viable pre-rework. Trace the suspected files named in spec §3: `packages/engine/src/agents/policy-agent-plan-root.ts`, `packages/engine/src/agents/plan-controller.ts`, `packages/engine/src/agents/plan-proposal.ts`, the `arvn.patrolGovern` template and any guarding doctrines in `data/games/fire-in-the-lake/92-agents.md`.
- **(L) Legitimate evolution**: the post-Spec-191 trajectory legitimately constrains ARVN to patrol/govern on these specific seed-pinned states. In this case, the 0.60 family-share probe was calibrated on a trajectory that no longer exists, and the assertion must be distilled to a property-form invariant (e.g., a corpus-wide diversity bound across multiple profiles or windows, per `.claude/rules/testing.md` "Distillation over re-bless").

Record the verdict, the evidence supporting it, and the proposed Spec 208 §6 resolution path (regression-fix vs distillation rewrite) in the diagnosis report.

### 3. Determine Witness 2's regression-vs-legitimate verdict

Using the same diagnostic output, classify whether `currentTurnImpact` never readying on plan-controlled decisions is:

- **(R) Regression**: the evaluator's readiness preconditions are reachable on plan-controlled decisions but a Spec 190/191 change broke the wiring (e.g., the evaluator's input observations no longer satisfy after the plan-root override). Trace the evaluator's authored body in `data/games/fire-in-the-lake/92-agents.md` and any engine resolution path that feeds it.
- **(L) Legitimate evolution**: plan-controlled decisions structurally bypass the `currentTurnImpact` readiness preconditions because the evaluator's design assumes scalar-evaluator-driven decisions. In this case, distill `turnShapeMinimumImpactObservedBoth` to a property-form invariant that holds for both decision sources (or distill to assert readiness only on the subset of decisions where the evaluator's preconditions can be reached).

Record the verdict and proposed resolution path.

### 4. Author the diagnosis report

Add `reports/spec-208-witnesses-1-2-diagnosis.md` containing:

- Brief summary of the diagnostic methodology (script invocation + sample-size note).
- Verdict per witness (R or L) with the supporting evidence (per-seed aggregates, traced file paths, citations into `92-agents.md` / engine source).
- Proposed resolution path per witness for ticket 003's execution.
- Foundation alignment confirmation (esp. Foundation #15: root cause identified, not papered over).

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs` (new)
- `reports/spec-208-witnesses-1-2-diagnosis.md` (new)

## Out of Scope

- Any *fix* (engine source edit, YAML doctrine edit, or witness distillation). All resolution work belongs to `tickets/208FITLARVPQ-003.md`.
- Witness 3 (grant-flow opponent-margin preview) — owned by `tickets/208FITLARVPQ-002.md`.
- Un-skipping the witnesses — owned by `tickets/208FITLARVPQ-004.md`.
- Modifying the replay-windows fixture or adding seeds 1012–1014; if the fixture's seed coverage is itself the root cause for one of the verdicts, flag it in the report but do not change the fixture in this ticket.
- Relaxing the 0.60 threshold or coercing `unknown`→`ready` for the turn-shape evaluator (forbidden by Foundation #20 and Spec 208 §4 Non-Goals).

## Acceptance Criteria

### Tests That Must Pass

1. The new diagnostic script runs end-to-end against the existing fixture and produces deterministic aggregate output. Manual verification: `node campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs` exits 0 and emits the per-seed + corpus-wide aggregates.
2. The two quarantined witnesses remain `skip`ped (this ticket does not un-skip — that is ticket 004's gate).
3. Existing suite: `pnpm turbo test` and `pnpm -F @ludoforge/engine test:all` remain green at the same baseline pass count as pre-ticket (no regressions from adding a campaign script + report).

### Invariants

1. The report's verdict for each witness must cite concrete evidence (file paths, aggregate numbers from the diagnostic script, traced code lines) — no speculation.
2. The diagnostic script is deterministic: re-running it against the same fixture produces byte-identical aggregate output (`diff` is empty).
3. No engine source, no GameSpecDoc YAML, and no test source file is modified by this ticket — the audit is read-only.
4. Foundation #20 is preserved in the diagnosis framing: `unknown` / `depth-capped` / `failed` readiness statuses are reported faithfully and never recoded as `ready`.

## Test Plan

### New/Modified Tests

1. `campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs` — campaign diagnostic; manual-verification only (no formal test harness, per project convention for `diagnose-*.mjs` siblings).
2. `reports/spec-208-witnesses-1-2-diagnosis.md` — checked-in artifact, no test coverage required.

### Commands

1. `node campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs` — primary verification; expected output: per-seed + corpus-wide aggregates with explicit verdict-supporting numbers.
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck` — confirm no regressions from adding the campaign script.
3. `pnpm -F @ludoforge/engine test:all` — confirm baseline pass count unchanged.

## Outcome

Completed: 2026-05-31

What changed:

- Added `campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs`, a deterministic diagnostic that runs the existing ARVN action-distribution and turn-shape probes through the compiled `dist` probe runner with debug traces.
- Added `reports/spec-208-witnesses-1-2-diagnosis.md`, recording the Witness 1 and Witness 2 verdicts as legitimate post-Spec-191 trajectory drift requiring distillation in `tickets/208FITLARVPQ-003.md`.
- Kept engine source, FITL YAML, probe source, replay-window fixtures, and quarantine state unchanged.

Diagnostic results:

- Both probes reproduced their expected current failures against 100 matched ARVN main-phase decisions.
- Witness 1: all 100 decisions selected action-family `coin-operation|movement|patrol`; all 100 were plan-selected as `arvn.patrolGovern`; all 100 requested 0 preview refs.
- Witness 2: `currentTurnImpact` was missing from all 100 plan-root traces, not ready/non-ready, because plan-root selection returns before fallback scalar evaluation.
- Plan traces still exposed viable alternative template mentions (`arvn.patrolGovern`, `arvn.trainGovern`, `arvn.assaultRaid`, `arvn.assaultTransportAssault`), so the diagnosis does not support a missing-template wiring regression.

Deviations from original plan:

- The ticket asked to capture readiness statuses such as ready / unknown / hidden / depth-capped / failed. The live trace evidence showed `currentTurnImpact` is absent on these plan-root decisions, so the report records `missing` as the truthful state instead of forcing it into a preview-status bucket.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs` — passed and emitted verdict-supporting aggregates.
- `node campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs > /tmp/spec208-witnesses-1-2-a.txt` — passed.
- `node campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs > /tmp/spec208-witnesses-1-2-b.txt` — passed.
- `diff -u /tmp/spec208-witnesses-1-2-a.txt /tmp/spec208-witnesses-1-2-b.txt` — passed with empty diff.
- `pnpm turbo build` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm -F @ludoforge/engine test:all` — passed: 999 tests, 999 pass, 0 fail.
