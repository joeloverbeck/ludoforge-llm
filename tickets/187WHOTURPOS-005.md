# 187WHOTURPOS-005: Conditional ally weighting + `allyWeightContext` trace

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-evaluation-core.ts`, `agents/plan-proposal.ts`, `agents/plan-controller.ts`, `kernel/types-plan-trace.ts`, `kernel/schemas-core.ts`, `cnl/compile-agents.ts`
**Deps**: `archive/tickets/187WHOTURPOS-003.md`, `tickets/187WHOTURPOS-004.md`

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
