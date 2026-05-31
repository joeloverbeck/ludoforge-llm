# 208FITLARVPQ-002: Diagnose Witness 3 (grant-flow opponent-margin preview reachability)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — read-only audit producing a diagnostic script + report
**Deps**: `specs/208-fitl-arvn-baseline-pq-witness-failures.md`

## Problem

The `policy-profile-quality` witness `fitl-arvn-may17-equivalent-opponent-preview` (`packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts`) fails on the `main` baseline (branch-baseline `implemented-spec-206`, since merged) with `expected at least two ready opponent-preview candidates, saw 0`. NVA/VC opponent-margin refs land `unknown` rather than `ready`. Per Foundation #20, `unknown` is the **integrity-preserving** outcome of a bounded preview that does not reach the opponent margins.

This is the grant-flow continuation preview boundary (`grantFlowContinuation` config; `policy-preview-inner-deepening.ts`; cap classes `postGrant16` / `grantFlow16`) shipped by Spec 185, **not** the `chooseNStep` inner-preview cost path that Spec 207 addressed. The witness is currently `skip`ped referencing Spec 208 (skip-marker at line 64 of the test file).

This ticket classifies the failure as **regression** (a grant-flow preview change stopped it reaching opponent margins it used to reach) or **legitimate evolution** (the post-Spec-191 trajectory legitimately moved the replay windows to states the bounded grant-flow preview cannot reach within its caps — distill the witness; Foundation #20 forbids coercing `unknown`→`ready`).

The output of this ticket gates the execution path of ticket `tickets/208FITLARVPQ-003.md`.

## Assumption Reassessment (2026-05-31)

1. The witness file exists at `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` with a `skip` option referencing Spec 208 — re-verified during reassessment (skip-marker at line 64).
2. `grantFlowContinuation` config key, `policy-preview-inner-deepening.ts`, and cap-class names `postGrant16` / `grantFlow16` are all present in the codebase — re-verified during reassessment.
3. Spec 185 owns the grant-flow continuation preview infrastructure — re-verified during reassessment (`archive/specs/185-grant-flow-preview-integrity.md`, Status COMPLETED).
4. Per Foundation #20: `unknown` opponent-margin refs are integrity-preserving — they must not be coerced to `ready` to make the witness pass. This is reaffirmed in Spec 208 §4 Non-Goals and §7 Foundation alignment.
5. The witness was calibrated 2026-05-17/18 (the "May 17" name in the file). Spec 190/191's plan-root / plan-role rework (PR merged 2026-05-23) reshaped ARVN's trajectory after calibration — confirmed via reassessment dependency-contract validation.

## Architecture Check

1. **Foundation 20 (Preview Signal Integrity)**: this is the foundation the diagnosis is built around. `unknown` / `depth-capped` / `failed` are distinct semantic outcomes, not silently-coerced contributions. The diagnostic must distinguish *which* non-ready status the opponent-margin refs land in (and per-witness which cap exhausts first) — the distinction matters for the regression-vs-legitimate verdict.
2. **Foundation 15 (Architectural Completeness)**: diagnosis-first separates "the trajectory moved to states the bounded preview legitimately can't reach" from "a grant-flow code path regressed and now exhausts caps it didn't before." Both look identical at the witness-level (0 `ready` candidates); only a per-cap trace distinguishes them.
3. **Foundation 16 (Testing as Proof)** + Appendix: distillation candidates need a written architectural-invariant rationale tied to bounded-preview semantics, not just "the trajectory drifted."
4. **No engine changes in this ticket**: read-only audit producing a checked-in diagnostic `.mjs` script (campaign pattern) plus a written report. Any *fix* (engine grant-flow code change, cap-config retune in YAML, or witness distillation) belongs to ticket 003.

## What to Change

### 1. Author the grant-flow opponent-margin diagnostic script

Add `campaigns/fitl-arvn-agent-evolution/diagnose-grant-flow-opponent-margin.mjs` following the sibling pattern in `campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` and `diagnose-action-distribution.mjs`. The script must:

- Replay the same windows used by the failing witness (`fitl-arvn-may17-equivalent-opponent-preview.test.ts` — read the test for the exact fixture / replay setup).
- For each candidate opponent-margin ref (NVA margin, VC margin), capture the resolution outcome: `ready` / `unknown` / `hidden` / `stochastic` / `unresolved` / `failed` / `depth-capped` / `partial` (per Foundation #20).
- For each non-`ready` outcome, trace which cap exhausted first: `postGrant16`, `grantFlow16`, or the broader `grantFlowContinuation` budget.
- Aggregate per-candidate and across-candidates: cap-exhaustion distribution, depth-at-exhaustion, the structural feature(s) of the matched states that prevent margin reachability.
- Import from `packages/engine/dist/`.

### 2. Determine Witness 3's regression-vs-legitimate verdict

Using the diagnostic output, classify whether the 0-ready opponent-margin outcome is:

- **(R) Regression**: a grant-flow preview change between the witness calibration (2026-05-17/18) and `main` HEAD stopped the preview reaching margins it used to reach on these specific replay windows. Trace recent commits touching `packages/engine/src/agents/policy-preview-inner-deepening.ts`, the `grantFlowContinuation` config consumer, and the opponent-margin surface resolver. A regression points back to either (i) a behavioral change in the preview-cap accounting, or (ii) the trajectory-reshape from Spec 190/191 that now routes through a code path with tighter effective caps.
- **(L) Legitimate evolution**: the post-Spec-191 plan-controlled trajectory legitimately reaches replay-window states whose opponent margins are beyond the bounded preview's reach within `postGrant16` / `grantFlow16` / `grantFlowContinuation` caps. In this case, the witness's "≥2 ready" assertion is calibrated against a trajectory that no longer exists; per Foundation #20 the `unknown` outcome must not be coerced, so the resolution path is distillation: rewrite the witness to a property-form invariant (e.g., "opponent-margin ref resolution status distribution falls in the expected envelope across all profiles", or "preview-cap-exhaustion rate stays below a corpus-wide bound").

Record the verdict, the evidence supporting it (cap-exhaustion distribution, trace citations into `policy-preview-inner-deepening.ts`, comparison against pre-Spec-191 traces if reproducible), and the proposed Spec 208 §6 resolution path for ticket 003.

### 3. Author the diagnosis report

Add `reports/spec-208-witness-3-diagnosis.md` containing:

- Diagnostic methodology summary (script invocation + replay window scope).
- Verdict (R or L) with supporting evidence: cap-exhaustion distribution, per-candidate trace excerpts, citations into engine source.
- Proposed resolution path for ticket 003's execution. If distillation, propose the property-form invariant; if regression, name the suspected file and the suspected change boundary.
- Explicit Foundation #20 alignment statement: the verdict must not require coercing `unknown`→`ready`.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/diagnose-grant-flow-opponent-margin.mjs` (new)
- `reports/spec-208-witness-3-diagnosis.md` (new)

## Out of Scope

- Any *fix* (engine source edit, grant-flow cap retune, witness distillation rewrite). All resolution work belongs to `tickets/208FITLARVPQ-003.md`.
- Witnesses 1–2 (plan-controller domination / turn-shape readiness) — owned by `archive/tickets/208FITLARVPQ-001.md`.
- Un-skipping the witness — owned by `tickets/208FITLARVPQ-004.md`.
- Reducing the ARVN preview budget (cap classes / depth) to make margins reachable — per `project_spec207_root_cause.md` (Spec 207 UPDATE §) this was tried, broke the may-17 witness in the opposite direction, and was reverted. Treat the existing cap configuration as the baseline for this diagnosis.
- Coercing `unknown` opponent-margin refs to `ready` to make the witness pass (forbidden by Foundation #20 and Spec 208 §4 Non-Goals).

## Acceptance Criteria

### Tests That Must Pass

1. The new diagnostic script runs end-to-end against the witness's replay setup and produces deterministic aggregate output. Manual verification: `node campaigns/fitl-arvn-agent-evolution/diagnose-grant-flow-opponent-margin.mjs` exits 0 and emits per-candidate cap-exhaustion aggregates.
2. The `fitl-arvn-may17-equivalent-opponent-preview` witness remains `skip`ped (this ticket does not un-skip — that is ticket 004's gate).
3. Existing suite: `pnpm turbo test` and `pnpm -F @ludoforge/engine test:all` remain green at the same baseline pass count as pre-ticket.

### Invariants

1. The report's verdict must cite concrete evidence: cap-exhaustion distribution numbers from the script, file/line citations into `policy-preview-inner-deepening.ts` and the opponent-margin resolver, and (if available) pre-Spec-191 comparison traces.
2. The diagnostic script is deterministic: re-running it against the same fixture produces byte-identical aggregate output.
3. No engine source, no GameSpecDoc YAML, and no test source file is modified by this ticket — the audit is read-only.
4. Foundation #20 is preserved end-to-end: every reported non-`ready` resolution status is named explicitly (`unknown` / `depth-capped` / etc.); the report never proposes coercing any status to `ready` as a resolution path.

## Test Plan

### New/Modified Tests

1. `campaigns/fitl-arvn-agent-evolution/diagnose-grant-flow-opponent-margin.mjs` — campaign diagnostic; manual-verification only.
2. `reports/spec-208-witness-3-diagnosis.md` — checked-in artifact, no test coverage required.

### Commands

1. `node campaigns/fitl-arvn-agent-evolution/diagnose-grant-flow-opponent-margin.mjs` — primary verification; expected output: per-candidate cap-exhaustion aggregates with explicit verdict-supporting numbers.
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck` — confirm no regressions from adding the campaign script.
3. `pnpm -F @ludoforge/engine test:all` — confirm baseline pass count unchanged.
