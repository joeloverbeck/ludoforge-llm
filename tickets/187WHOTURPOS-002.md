# 187WHOTURPOS-002: `preview.plan.delta.*` ref namespace + bounded per-step composition

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-evaluation-core.ts` (ref resolver / eval context), `contracts/policy-contract.ts` (ref-kind registry)
**Deps**: `specs/187-whole-turn-posture-and-ally-rival-metadata.md`

## Problem

Spec 187 §4.1 scores posture `prefer` terms over projected state via a `preview.plan.delta.*` ref namespace. This namespace **does not exist today** — the only delta precedent is option-scope `preview.option.delta.victory.currentMargin.self` (`policy-evaluation-core.ts:2740-2741`). Spec 185's preview is per-option grant-flow continuation, not whole-plan projection, and at proposal time the plan's role-bound steps are not yet executed.

This ticket adds `preview.plan.delta.*` as a net-new ref namespace computed by **bounded composition of the per-role-step option previews** Spec 185 already produces — aggregating each step's projected delta over the plan's role-bound steps, bounded by the plan caps (no new preview depth or cap class; Spec 187 §2). Each step's preview status folds toward non-`ready`: any non-`ready` step makes the composed delta non-`ready`.

## Assumption Reassessment (2026-05-21)

1. Confirmed this session: no `preview.plan.*` or `plan.delta` ref exists in `packages/engine/src/` (grep returned zero). The namespace is entirely net-new.
2. `preview.option.delta.victory.currentMargin.self` is resolved in `policy-evaluation-core.ts:2740-2741`; the option-scope ref-kind registry is `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS` (`contracts/policy-contract.ts:65-74`, includes `deltaVictoryCurrentMarginSelf`). Plan-scope deltas need an analogous registration and resolver path.
3. `resolveVmRef()` in `PolicyEvaluationContext` (`policy-evaluation-core.ts:~1295`) is the runtime ref-resolution entry point the new namespace plugs into.
4. Bounded computation (Foundation #10): the composition must aggregate over the plan's role-bound steps within the existing plan caps; it must NOT raise `standard256`/`deep1024`/`postGrant16` or deepen preview to force a `ready`.

## Architecture Check

1. Composing existing per-option previews (rather than introducing a new preview machine) honors Spec 187 §2's "no new preview depth" — the aggregation runs at the same depth Spec 185 already produces, only summed across plan steps.
2. Foundation #20: per-step preview status is preserved through composition; a non-`ready` step yields a non-`ready` composed delta rather than a silently-coerced numeric. The fallback contribution is applied by the consuming posture term (`187WHOTURPOS-003`), not invented here.
3. Foundation #10: aggregation is bounded by the plan caps; no unbounded look-ahead.
4. Engine-agnostic: `preview.plan.delta.*` is a generic ref path; no game-specific knowledge.

## What to Change

### 1. Register the plan-scope delta ref kind

Add a plan-scope delta ref kind (analogous to `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS`) so `preview.plan.delta.victory.currentMargin.<seat>` (and the seat-parameterized forms posture needs) is a recognized ref.

### 2. Compose per-step deltas

In `policy-evaluation-core.ts`, add resolution for `preview.plan.delta.*` that walks the candidate plan's role-bound steps, reads each step's option-level projected delta (the existing per-option preview), and aggregates them into a plan-level delta, bounded by the plan caps. Fold per-step status: the composed delta's status is `ready` only if every contributing step is `ready`; otherwise it carries the first non-`ready` reason (status taxonomy from Spec 185).

### 3. Expose status alongside value

Surface the composed status so the consumer (`187WHOTURPOS-003`) can apply the declared fallback and record `provenance`. Do not coerce a non-`ready` composed delta into a numeric.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/contracts/policy-contract.ts` (modify)
- `packages/engine/test/` — plan-delta composition + status-folding unit tests (new)

## Out of Scope

- The `postureEvaluators` bucket (`187WHOTURPOS-001`).
- Wiring posture `prefer` terms to consume these refs and applying fallbacks (`187WHOTURPOS-003`).
- Any new preview depth, cap class, or grant-flow change (explicitly forbidden by Spec 187 §2).

## Acceptance Criteria

### Tests That Must Pass

1. `preview.plan.delta.victory.currentMargin.<seat>` resolves to the aggregated delta over a constructed multi-step plan whose per-step previews are all `ready`.
2. When any contributing step's preview is non-`ready`, the composed delta carries a non-`ready` status (not a coerced number).
3. Composition stays within plan caps — no cap-class escalation observable in trace.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The composed plan delta never reports `ready` when a contributing step is non-`ready` (Foundation #20).
2. Aggregation is bounded by the existing plan caps; no new depth/cap class is introduced (Foundation #10).

## Test Plan

### New/Modified Tests

1. Plan-delta composition unit test — constructed plan with all-`ready` steps; asserts the aggregated value and `ready` status.
2. Status-folding unit test — one non-`ready` step makes the composed status non-`ready`; architectural-invariant, ties to Foundation #20.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/<plan-delta-test>.test.js`
2. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test`
