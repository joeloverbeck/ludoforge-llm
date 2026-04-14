# Spec 131: Recover Post-127 Policy Fallback Regression While Preserving Spec 128

**Status**: PROPOSED
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 128 (in progress; landed tickets 001–006 must remain intact)
**Source**: Direct benchmark investigation across commits from `14a33c29` through `fb2acad4` on 2026-04-14

## Overview

Recover the remaining FITL benchmark regression that appeared after the Spec 127 completion-path revert and before / during the Spec 130 hot-path series, **without undoing any of Spec 128's draft-state work**.

The investigation shows:

1. The catastrophic Spec 127 regression came from commit `40a43ceb` and was already removed by `14a33c29`.
2. Spec 128 is not the origin of the slowdown; relative to the pre-128 branch, it improved benchmark time.
3. The first remaining post-127 regression appears at `971992fc`, a small `policy-eval.ts` change that eliminated fallback canonicalization by threading fallback move data through the hot failure result.
4. Later Spec 130 commits fluctuate around that slower plateau but do not create a second regression spike comparable to `971992fc`.

The clean architectural response is to preserve the whole Spec 128 series and target the harmful **policy fallback optimization** independently.

## Benchmark Evidence

All measurements below used:

```bash
node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200
```

| Commit | Meaning | `combined_duration_ms` | Delta vs `14a33c29` |
|---|---|---:|---:|
| `14a33c29` | post-127 revert / clean reference | `14090.38` | baseline |
| `971992fc` | eliminate redundant `canonicalizeCandidates` | `15688.60` | `+11.34%` |
| `700bc128` | first Spec 130 commit | `14805.81` | `+5.08%` |
| `752d35dc` | later Spec 130 | `15248.78` | `+8.22%` |
| `08c1f2a3` | later Spec 130 | `15132.31` | `+7.39%` |
| `5713399c` | later Spec 130 | `14790.02` | `+4.97%` |
| `fb2acad4` | implemented Spec 130 | `14966.89` | `+6.22%` |

Additional investigation results:

| Commit | Meaning | `combined_duration_ms` | Note |
|---|---|---:|---|
| `1108d36b` | pre-127 merge parent | `14322.47` | near the old local campaign baseline |
| `6cb6c504` | `127FREOPECHO-001` | `14633.28` | small `+2.17%` regression |
| `40a43ceb` | implemented Spec 127 | `77708.95` | catastrophic `+442.57%`; already reverted |

The catastrophic 127 regression is already handled. The remaining actionable regression begins at `971992fc`.

## Root Cause

Commit `971992fc` changed only `packages/engine/src/agents/policy-eval.ts`.

It removed fallback canonicalization from the outer failure path and instead threaded:

- `fallbackMove`
- `fallbackStableMoveKey`
- `fallbackScore`

through the hot `PolicyEvaluationCoreResult` failure surface.

That optimization hypothesis was:

- avoid re-running `canonicalizeCandidates(...)`
- reuse the first candidate already seen in the core result

But the benchmark data and existing campaign lessons strongly suggest this is the wrong optimization shape for this codebase:

1. It widens the hot return object flowing through policy evaluation.
2. It changes / complicates return-shape behavior in a V8-sensitive agent hot path.
3. It shifts work from a colder wrapper failure path into the core path executed on every policy evaluation.

This matches existing campaign lessons:

- `campaigns/lessons-global.jsonl` notes that polymorphic return shapes and hot-path object/interface changes caused 4-7% regressions in this codebase.
- The measured slowdown shows up primarily in `agentChooseMove_ms`, not in `legalMoves_ms` or `applyMove_ms`, which matches the ownership of `policy-eval.ts`.

## Non-Goals

- Do **not** revert any Spec 128 draft-state changes.
- Do **not** restore the harmful Spec 127 completion-path behavior from `40a43ceb`.
- Do **not** introduce benchmark-only hacks or compatibility shims.
- Do **not** broaden this spec into full Spec 130 redesign work unless the targeted recovery fails to restore performance.

## Deliverables

### 1. Preserve the proven 127 / 128 state

Treat the following as fixed architectural decisions:

- keep the `14a33c29` completion-path revert behavior
- keep the full Spec 128 draft-state implementation
- keep the external immutability / determinism proofs landed by tickets `128FULSCODRA-001` through `128FULSCODRA-006`
- note: in-flight tickets `128FULSCODRA-007` and `128FULSCODRA-008` are expected to land independently; this spec's changes must not conflict with them

### 2. Remove the harmful fallback-threading optimization

Refactor `packages/engine/src/agents/policy-eval.ts` so the hot `evaluatePolicyMoveCore(...)` path no longer carries fallback move metadata through its core result object.

Preferred direction:

- restore fallback candidate resolution to the outer failure wrapper, as in the pre-`971992fc` design
- keep any later correctness fixes that are independent of this fallback transport
- avoid widening hot-path return objects or introducing alternate return shapes

### 3. Re-benchmark on top of current HEAD with Spec 128 intact

After the fallback-path recovery, rerun the FITL performance harness on current `HEAD` with all Spec 128 changes still present.

Success criterion:

- materially improve over the current post-128 measurement lane
- target parity with the clean post-127 revert baseline (`14a33c29`) within normal noise before deciding whether deeper Spec 130 fallout remains

### 4. Only if needed, run bounded follow-up narrowing inside Spec 130

If reverting the policy fallback optimization does **not** substantially recover the regression, continue with a bounded second-stage audit of the later Spec 130 commits. That follow-up must be driven by benchmark evidence, not guesswork.

## Constraints

1. **Foundation 11 (Immutability)**: Spec 128's scoped draft-state optimization remains fully intact.
2. **Foundation 8 (Determinism)**: benchmark runs must keep identical deterministic fingerprints / state hashes for identical seeds.
3. **Foundation 15 (Architectural Completeness)**: do not paper over the regression with ad hoc caching or benchmark-only special cases.
4. **Foundation 14 (No Backwards Compatibility)**: no alias path, compatibility wrapper, or `_legacy` fallback implementation.
5. **Foundation 16 (Testing as Proof)**: recovery is accepted only with benchmark evidence on the live harness.

## Implementation Plan

1. Diff current `packages/engine/src/agents/policy-eval.ts` against the pre-`971992fc` behavior and isolate only the fallback-threading regression surface.
2. Restore the colder fallback-resolution ownership at the outer wrapper while preserving unrelated later correctness fixes.
3. Run focused policy-agent correctness / shape tests affected by the refactor.
4. Run the FITL benchmark harness and compare against:
   - current `HEAD`
   - `14a33c29`
5. If needed, create a narrow follow-up spec for residual post-130 slowdown after this recovery lands.

## Validation

Minimum validation:

```bash
pnpm -F @ludoforge/engine test
bash campaigns/fitl-perf-optimization/harness.sh
bash campaigns/fitl-perf-optimization/checks.sh
node --prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200
node --prof-process isolate-*.log
```

## Expected Outcome

- preserve all Spec 128 correctness and architectural benefits
- keep the already-correct Spec 127 revert in place
- remove the main remaining post-127 regression source
- re-establish a clean benchmark baseline before any further performance work
