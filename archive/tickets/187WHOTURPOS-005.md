# 187WHOTURPOS-005: Conditional ally weighting + `allyWeightContext` trace

**Status**: IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-evaluation-core.ts`, `agents/plan-proposal.ts`, `agents/plan-controller.ts`, `kernel/types-plan-trace.ts`, `kernel/schemas-core.ts`, `cnl/compile-agents.ts`
**Deps**: `archive/tickets/187WHOTURPOS-003.md`, `archive/tickets/187WHOTURPOS-004.md`

## Problem

Spec 187 §4.2 realizes the competence report's `rival_ally_gain_if_ally_near_win` term generically: a posture `prefer` term whose `when` gates on relationship refs flips an ally's gain from positive to negative when the nominal ally seat is also bound to the `nearWin` role (`relationship.nearWin.seat == relationship.nominalAlly.seat`). This is the integration of the posture runtime (`187WHOTURPOS-003`) with the `relationships` bucket (`187WHOTURPOS-004`).

This ticket makes relationship refs available in the posture evaluation scope, implements the conditional flip, extends the plan-trace `posture` block with `allyWeightContext`, and adds the static authoring-error check for a posture term referencing an undeclared `relationship.<role>` (Spec 187 §8, the reassessment Addition).

## Assumption Reassessment (2026-05-21)

1. Posture runtime evaluation and the `posture` trace block (`{ status, mustViolations[], preferContributions[] }`) land in `187WHOTURPOS-003`; this ticket adds the `allyWeightContext` field to that block.
2. The `relationships` bucket and `relationship.<role>.seat`/`.gainValue` refs land in `187WHOTURPOS-004`; the declared ref set is `seat` and `gainValue` only — the flip is expressed using those (`relationship.nearWin.seat == relationship.nominalAlly.seat`), not a non-existent `relationship.<role>.nearWin` sub-ref.
3. Posture `prefer`/`when` expressions are evaluated in `PolicyEvaluationContext` (`policy-evaluation-core.ts`); relationship refs must be resolvable in that same scope.
4. The §8 authoring-error case — a posture term referencing an undeclared `relationship.<role>` — is a compile-time cross-check between the `postureEvaluators` and `relationships` buckets (Foundation #12).

## Architecture Check

1. The flip is authored entirely as a posture `prefer` term gating on declared relationship refs — no game-specific "ally/rival" logic in engine code (Foundation #1). The engine evaluates a generic `when` over `relationship.*` refs.
2. Foundation #15: denial + conditional ally-rival scoring becomes first-class structure (a `when`-gated posture term + traced `allyWeightContext`), not a weight hack buried in a scalar.
3. Foundation #12: a posture term referencing an undeclared relationship role fails compilation — the cross-bucket reference is validated statically.
4. Foundation #8/#11: the flip is a pure function of state + relationship bindings; replay-stable and traced.

## What to Change

### 1. Relationship refs in posture scope

In `agents/policy-evaluation-core.ts`, make `relationship.<role>.seat`/`.gainValue` resolvable within posture `prefer`/`when` evaluation (the same eval context that scores `preview.plan.delta.*`).

### 2. Conditional flip

Support a posture `prefer` term whose `when` compares relationship seats (e.g. `relationship.nearWin.seat == relationship.nominalAlly.seat`) and, when true, treats the ally's margin gain as enemy gain (sign flip). Wire the resulting contribution into plan rank (via `plan-proposal.ts`).

### 3. Trace `allyWeightContext`

Extend the `posture` block in `kernel/types-plan-trace.ts` with `allyWeightContext` (which ally/rival roles were active, and whether the flip fired), update `kernel/schemas-core.ts`, and populate in `plan-controller.ts`. Handle the §6 edge case: when ally and rival roles bind the same seat under different conditions, resolve by deterministic authored priority and record it in trace.

### 4. Static cross-validation

In `cnl/compile-agents.ts` (posture lowering path from `-001`), reject a posture `prefer`/`when` term that references a `relationship.<role>` not declared in the `relationships` bucket.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/plan-proposal.ts` (modify)
- `packages/engine/src/agents/plan-controller.ts` (modify)
- `packages/engine/src/kernel/types-plan-trace.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/policy-profile-quality/` — conditional ally-weight flip witness (new)
- `packages/engine/test/` — authoring-error test (posture term referencing undeclared relationship role) (new)

## Out of Scope

- The `relationships` bucket infrastructure itself (`187WHOTURPOS-004`).
- Posture `must`/`prefer` core evaluation and the base `posture` trace block (`187WHOTURPOS-003`).
- FITL faction wiring (US/ARVN/NVA/VC) — Spec 188.

## Acceptance Criteria

### Tests That Must Pass

1. A conditional ally-weight term flips an ally's gain from positive to negative when `relationship.nearWin.seat == relationship.nominalAlly.seat` holds, in a constructed scenario.
2. When no ally is near win, the `when` is false and the base ally weight applies.
3. The flip is replay-stable and recorded in the trace `allyWeightContext`.
4. A posture term referencing an undeclared `relationship.<role>` fails compilation.
5. Ally and rival roles binding the same seat resolve by deterministic authored priority, recorded in trace.
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No game-specific ally/rival logic in engine code; the flip is an authored `when` over generic `relationship.*` refs (Foundation #1).
2. Cross-bucket reference (posture → relationship role) is validated at compile time (Foundation #12).
3. The flip is a deterministic, replay-stable function of state + relationship bindings (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/<conditional-ally-weight-flip>.test.ts` — flip witness (profile-quality witness, ties Spec 187 §8 to the competence report §6.5).
2. Authoring-error corpus test — posture `prefer`/`when` term referencing an undeclared `relationship.<role>` rejected at compile time.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/<conditional-ally-weight-flip>.test.js`
2. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test`

## Outcome

Completed: 2026-05-21

What changed:

- Added `PolicyPlanTrace.posture.allyWeightContext` with active relationship-role rows and conditional ally-flip rows, and regenerated `packages/engine/schemas/Trace.schema.json`.
- Added `packages/engine/src/agents/policy-relationship-eval.ts` to centralize active relationship role resolution for both posture tracing and existing relationship refs. This preserves authored priority ordering and standing-role seat decoding without growing the already-oversize policy evaluation core.
- Wired posture evaluation to record a flip when an authored `when` compares `relationship.nearWin.seat` and `relationship.nominalAlly.seat` and both active roles bind the same seat. The authored prefer term supplies the negative weight; the engine remains generic and records the context that made the flip fire.
- Added runtime witnesses in `packages/engine/test/unit/agents/plan-proposal.test.ts` for ally gain flipping negative when the nominal ally is also near win, base ally weighting when the seats differ, and replay-stable posture trace output.
- Added a posture compiler authoring-error witness in `packages/engine/test/unit/cnl/agent-posture-evaluator-compile.test.ts` for undeclared `relationship.<role>` refs inside posture terms.
- Updated `packages/engine/src/cnl/compile-agents.ts` so undeclared relationship refs in posture evaluator terms report through the posture-specific diagnostic path. The existing static cross-validation already rejected the bad ref; this change aligns the rejection with the posture surface.

Deviations from original plan:

- The flip witness lives in the existing architectural `plan-proposal` test file rather than `policy-profile-quality/`. The ticket acceptance is an engine-level posture/trace invariant, and the focused unit witness directly proves plan ranking, no-near-win base weighting, trace shape, and replay stability without introducing a profile-quality advisory lane.
- `plan-controller.ts` did not require a source edit. Follow-on microturn traces without a fresh proposal still emit the existing no-preview posture block; `allyWeightContext` is populated where posture terms are evaluated at proposal time.
- `compile-agents.ts` required only a diagnostic routing adjustment because the posture lowering path already cross-validated undeclared relationship roles before this ticket.

Generated-artifact provenance:

| Artifact path | Size / line count | Generation command | Canonical inputs | Why checked in | Hygiene proof |
| --- | ---: | --- | --- | --- | --- |
| `packages/engine/schemas/Trace.schema.json` | 370898 bytes / 12071 lines | `pnpm -F @ludoforge/engine run schema:artifacts` | `packages/engine/src/kernel/schemas-core.ts` / `PolicyPlanTraceSchema` | Public schema artifact must match the trace contract checked by `schema:artifacts:check`. | `pnpm -F @ludoforge/engine test` reran `schema:artifacts:check`; `git diff --check -- <touched files>` passed. |

Source-size ledger:

| Path | Before lines | After lines | Active growth | Crossed cap? | Resolution |
| --- | ---: | ---: | ---: | --- | --- |
| `packages/engine/src/agents/policy-relationship-eval.ts` | 0 | 107 | +107 | no | New focused helper keeps relationship tracing/resolution out of oversized core files. |
| `packages/engine/src/agents/policy-posture-eval.ts` | 105 | 185 | +80 | no | Below cap; owns the new posture trace context assembly. |
| `packages/engine/src/agents/plan-proposal.ts` | 658 | 659 | +1 | no | Below cap; one-line propagation of evaluated posture context. |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2862 | 2861 | -1 | preexisting oversize, no active growth | Relationship runtime logic extracted; core delegates without growing. |
| `packages/engine/src/cnl/compile-agents.ts` | 5952 | 5949 | -3 | preexisting oversize, no active growth | Posture-specific relationship-ref diagnostic routing added while compacting nearby signature lines. |
| `packages/engine/src/kernel/schemas-core.ts` | 3266 | 3266 | 0 | preexisting oversize, no active growth | Trace schema extension kept line-neutral. |
| `packages/engine/src/kernel/types-plan-trace.ts` | 63 | 85 | +22 | no | Below cap; adds typed trace context contract. |

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/agents/plan-proposal.test.js packages/engine/dist/test/unit/cnl/agent-posture-evaluator-compile.test.js` — passed, 13 tests.
- `pnpm -F @ludoforge/engine run schema:artifacts` — regenerated `Trace.schema.json` after the trace schema extension.
- `pnpm -F @ludoforge/engine test` — passed after final edits, 165/165 files.
- `pnpm turbo lint` — passed, 2/2 tasks.
- `pnpm turbo typecheck` — passed, 3/3 tasks.

Post-review: completed in the implement-spec-tickets harness. The ticket is archived at `archive/tickets/187WHOTURPOS-005.md`; no follow-up ticket was created.
