# 187WHOTURPOS-003: Runtime posture evaluation + `PolicyPlanTrace.posture` block

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `agents/plan-proposal.ts`, `agents/plan-controller.ts`, `kernel/types-plan-trace.ts`, `kernel/schemas-core.ts`, `agents/policy-evaluation-core.ts`
**Deps**: `tickets/187WHOTURPOS-001.md`, `tickets/187WHOTURPOS-002.md`

## Problem

The `postureHook` exists today but is **inert**: `plan-proposal.ts:478-489` (`postureStatusFor`) returns `'notConfigured'` when no template declares the hook and `'unavailable'` when one does — the evaluator is never invoked. Spec 187 §4.1/§5 require posture to be evaluated once per candidate plan at proposal time (Spec 186 §4.4 step 4): `must` violations demote/veto a plan, `prefer` contributions (over `preview.plan.delta.*`) feed plan rank, and the overall `provenance` status is recorded.

This ticket wires the hook to the compiled `postureEvaluators` bucket (`-001`) reading the `preview.plan.delta.*` refs (`-002`), and extends the plan trace with a `posture` block. Per Spec 187 §4.3, that block **subsumes and replaces** the existing 3-value `postureStatus` enum (Foundation #14 — the standalone field is removed, not kept alongside).

## Assumption Reassessment (2026-05-21)

1. `postureStatusFor` (`plan-proposal.ts:478-489`) currently maps hook presence to `'notConfigured' | 'unavailable'` and is the integration point to replace with real evaluation.
2. `PolicyPlanTrace` (`kernel/types-plan-trace.ts:26-42`) carries `postureStatus: 'notConfigured' | 'ready' | 'unavailable'` (line 40) and is populated via `plan-controller.ts:~128`. Spec 187 §4.3 replaces this with `posture: { status, mustViolations[], preferContributions[] }` (the `allyWeightContext` field is added later by `187WHOTURPOS-005`).
3. `must`/`prefer` evaluation reuses `PolicyEvaluationContext` (`policy-evaluation-core.ts`); the compiled posture-evaluator shape comes from `-001` and the `preview.plan.delta.*` refs from `-002`.
4. Foundation #14: removing `postureStatus` requires migrating every reader of that field in source and tests in this same change (grep `postureStatus` at implementation time and enumerate).

## Architecture Check

1. Filling the existing hook (rather than adding a parallel scoring path) keeps a single plan-ranking pipeline (Spec 186's), with posture as one ranked contributor — no second decision surface.
2. Foundation #20: each `prefer` contribution is tagged `ready` or its fallback reason; the composed `provenance` is recorded in trace and never silently coerced. When all candidate plans have non-`ready` posture preview, ranking proceeds on current-state leaf scorers and the trace marks posture `fallback` (Spec 187 §6) — mirroring `tiebreakAfterPreviewNoSignal` discipline at plan scope.
3. Foundation #14: the 3-value `postureStatus` enum is removed and its meaning widened into `posture.status` (specific fallback reason); no compatibility alias retained.
4. Foundation #11/#8: posture evaluation is a pure function of state + preview; replay-identical contributions.

## What to Change

### 1. Evaluate the hook at proposal time

Replace `postureStatusFor`'s placeholder logic in `plan-proposal.ts`: resolve the template's `postureHook` to its compiled posture evaluator, evaluate `must` (failures demote/veto the candidate plan) and `prefer` (contributions over `preview.plan.delta.*`, applying each term's declared fallback when the ref is non-`ready`), and compute the overall `provenance` status. Feed `prefer` contributions into the plan-rank comparison.

### 2. Extend the plan trace

In `kernel/types-plan-trace.ts`, replace `postureStatus` with `posture: { status; mustViolations: readonly …[]; preferContributions: readonly …[] }`, each contribution tagged `ready` or its fallback reason. Update `kernel/schemas-core.ts` with the corresponding schema. Populate the block in `plan-controller.ts`.

### 3. Migrate all `postureStatus` readers

Grep `postureStatus` across `packages/engine/src` and `packages/engine/test`; migrate every reader to the new `posture.status` shape in this same change (Foundation #14). Enumerate the actual paths at implementation time.

## Files to Touch

- `packages/engine/src/agents/plan-proposal.ts` (modify)
- `packages/engine/src/agents/plan-controller.ts` (modify)
- `packages/engine/src/kernel/types-plan-trace.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/test/policy-profile-quality/` — posture-demotion + non-`ready`-fallback honesty tests (new)
- Migration of `postureStatus` readers (paths enumerated via grep at implementation time)

## Out of Scope

- The `relationships` bucket, relationship refs, and conditional ally weighting (`187WHOTURPOS-004`, `-005`).
- The `allyWeightContext` trace field (added by `187WHOTURPOS-005`).
- New preview depth/cap classes (forbidden by Spec 187 §2).

## Acceptance Criteria

### Tests That Must Pass

1. A `must` violation demotes/vetoes a plan in a constructed scenario.
2. A `prefer` term over `ready` preview differentiates two plans; over non-`ready` preview it contributes its declared fallback with the status visible in trace.
3. When all candidate plans have non-`ready` posture preview, ranking proceeds on current-state leaf scorers and the trace marks posture `fallback` (never silently `ready`).
4. Posture contributions are replay-identical across two runs (canonical state equality).
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No non-`ready` preview ref is coerced into a numeric posture contribution (Foundation #20).
2. The `postureStatus` enum no longer exists anywhere in source or tests (Foundation #14).
3. Posture evaluation is bounded by the existing plan caps (Foundation #10).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/<posture-demotion>.test.ts` — `must` violation demotes a plan (architectural-invariant).
2. `packages/engine/test/policy-profile-quality/<posture-fallback-honesty>.test.ts` — non-`ready` preview yields declared fallback + trace-visible status; ties to Foundation #20.
3. Replay-identity assertion for posture contributions (determinism corpus).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/<posture-demotion>.test.js`
2. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test`
