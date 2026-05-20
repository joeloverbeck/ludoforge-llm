# 187WHOTURPOS-002: `preview.plan.delta.*` ref namespace + bounded per-step composition

**Status**: IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-evaluation-core.ts` (ref resolver / eval context), `contracts/policy-contract.ts` (ref-kind registry)
**Deps**: `specs/187-whole-turn-posture-and-ally-rival-metadata.md`

## Problem

Spec 187 §4.1 scores posture `prefer` terms over projected state via a `preview.plan.delta.*` ref namespace. This namespace **does not exist today** — the only delta precedent is option-scope `preview.option.delta.victory.currentMargin.self` (`policy-evaluation-core.ts:2740-2741`). Spec 185's preview is per-option grant-flow continuation, not whole-plan projection, and at proposal time the plan's role-bound steps are not yet executed.

This ticket adds the net-new `preview.plan.delta.*` ref kind and the reusable, bounded composition substrate for plan-level deltas over **supplied** per-step preview statuses. It does not materialize future role-step previews inside plan proposal; that integration remains with `187WHOTURPOS-003`, where runtime posture evaluation has the correct proposal/execution context. The substrate aggregates supplied step projected deltas under an explicit plan cap (no new preview depth or cap class; Spec 187 §2). Each step's preview status folds toward non-`ready`: any non-`ready` step makes the composed delta non-`ready`.

## Assumption Reassessment (2026-05-21)

1. Confirmed this session: no `preview.plan.*` or `plan.delta` ref exists in `packages/engine/src/` (grep returned zero). The namespace is entirely net-new.
2. `preview.option.delta.victory.currentMargin.self` is resolved in `policy-evaluation-core.ts:2740-2741`; the option-scope ref-kind registry is `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS` (`contracts/policy-contract.ts:65-74`, includes `deltaVictoryCurrentMarginSelf`). Plan-scope deltas need an analogous registration and resolver path.
3. `resolveVmRef()` in `PolicyEvaluationContext` (`policy-evaluation-core.ts:~1295`) is the runtime ref-resolution entry point the new namespace will eventually plug into, but live `proposeAdvisoryTurnPlan` currently receives only root action decisions and role bindings, not materialized per-role-step preview chains.
4. User-approved Foundation reassessment (2026-05-21): to avoid violating Foundation #10/#20 by inventing or silently coercing unavailable future-step preview data, this ticket owns the plan-delta ref kind plus reusable bounded composition/status-folding substrate over supplied step statuses. Proposal-time materialization and posture consumption stay in `187WHOTURPOS-003`.
5. Bounded computation (Foundation #10): the composition must aggregate supplied step statuses within an explicit existing plan cap; it must NOT raise `standard256`/`deep1024`/`postGrant16` or deepen preview to force a `ready`.

## Architecture Check

1. Composing supplied per-step preview statuses (rather than introducing a new preview machine or faking proposal-time future-step data) honors Spec 187 §2's "no new preview depth" — the aggregation works only over statuses an owning caller already materialized.
2. Foundation #20: per-step preview status is preserved through composition; a non-`ready` step yields a non-`ready` composed delta rather than a silently-coerced numeric. The fallback contribution is applied by the consuming posture term (`187WHOTURPOS-003`), not invented here.
3. Foundation #10: aggregation is bounded by the plan caps; no unbounded look-ahead.
4. Engine-agnostic: `preview.plan.delta.*` is a generic ref path; no game-specific knowledge.

## What to Change

### 1. Register the plan-scope delta ref kind

Add a plan-scope delta ref kind (analogous to `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS`) so `preview.plan.delta.victory.currentMargin.self` is a recognized compiled/runtime ref kind. Seat-parameterized relationship/posture forms remain with the posture/relationship integration tickets unless implemented by the same generic substrate without widening this ticket.

### 2. Compose supplied per-step deltas

Add a reusable helper in the agent policy evaluation layer that accepts the candidate plan's supplied step-level `preview.option.delta.victory.currentMargin.self` statuses and an explicit plan-step cap, then aggregates them into a plan-level delta. Fold per-step status: the composed delta's status is `ready` only if every included contributing step is `ready`; otherwise it carries the first non-`ready` reason (status taxonomy from Spec 185). If the supplied step count exceeds the cap, the composed status is non-`ready` rather than escalating the cap.

### 3. Expose status alongside value

Surface the composed status so the consumer (`187WHOTURPOS-003`) can apply the declared fallback and record `provenance`. Do not coerce a non-`ready` composed delta into a numeric. The resolver may return `undefined` until `187WHOTURPOS-003` supplies plan-step preview data; that absence must be recorded as unavailable, not `ready`.

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

1. `preview.plan.delta.victory.currentMargin.self` has a registered ref kind and a reusable composition helper that returns an aggregated delta over a constructed multi-step plan input whose supplied per-step previews are all `ready`.
2. When any contributing step's preview is non-`ready`, the composed delta carries a non-`ready` status (not a coerced number).
3. Composition stays within plan caps — no cap-class escalation observable in trace.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The composed plan delta never reports `ready` when a contributing step is non-`ready` (Foundation #20).
2. Aggregation is bounded by the existing plan caps; no new depth/cap class is introduced (Foundation #10).

## Test Plan

### New/Modified Tests

1. Plan-delta composition unit test — constructed supplied step-status input with all-`ready` steps; asserts the aggregated value and `ready` status.
2. Status-folding unit test — one non-`ready` step makes the composed status non-`ready`; architectural-invariant, ties to Foundation #20.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/<plan-delta-test>.test.js`
2. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test`

## Outcome

Completed: 2026-05-21

What changed:

- Added generic `previewPlanRef` support for `preview.plan.delta.victory.currentMargin.self`, including the plan-scope ref-kind registry, compiled ref type, schema branch, compiler ref parsing, diagnostic ref naming, and runtime resolver path.
- Added `composePreviewPlanDelta()` and `previewPlanRefKey()` in the agent policy evaluation layer. Composition accepts supplied per-step preview statuses plus an explicit step cap, returns `ready` only when every contributing step is ready, preserves the first unavailable status, and reports `depthCap` instead of escalating caps when input exceeds the cap.
- Added `packages/engine/test/unit/agents/preview-plan-delta.test.ts` to cover registration/keying, all-ready aggregation, non-ready status folding, and cap overflow. The status-folding and cap behavior are architectural-invariant coverage for Foundations #10/#20.
- Regenerated `packages/engine/schemas/GameDef.schema.json` with `pnpm -F @ludoforge/engine run schema:artifacts`. Canonical inputs: `packages/engine/src/kernel/schemas-core.ts`, `packages/engine/src/kernel/types-core.ts`, and `packages/engine/src/contracts/policy-contract.ts`; the generated change is expected because the compiled policy ref union gained `previewPlanRef`.

Deviations from original plan:

- The original draft implied proposal-time materialization of future role-step previews. Live reassessment found `proposeAdvisoryTurnPlan` has root decisions and role bindings, not materialized future per-role-step preview chains. User-approved option 1 narrowed this ticket to the generic ref kind plus reusable bounded composition/status substrate over supplied statuses; proposal-time materialization and posture consumption remain with `187WHOTURPOS-003`.
- Only `preview.plan.delta.victory.currentMargin.self` is registered here. Seat-parameterized posture/relationship variants remain owned by later Spec 187 integration tickets unless they can be added by the same generic substrate without widening scope.
- Source-size decomposition is deferred; preview integrity is not deferred. The touched oversized files were already over the repo's 800-line guidance and grew only at narrow shared contract/compiler/resolver insertion points. User approved this deferral on 2026-05-21 after a Foundations reassessment because splitting these shared hubs would widen the ticket beyond the plan-delta substrate.

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor if any |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2777 | 2832 | no; preexisting over 800 | +55 | User-approved deferral; retained change is the public evaluation-context resolver and bounded composition substrate. Extracting the context/ref seam now would widen this ticket. | none in this ticket |
| `packages/engine/src/cnl/compile-agents.ts` | 5828 | 5864 | no; preexisting over 800 | +36 | User-approved deferral; retained change is the existing compiler ref-resolution dispatch/classification site. Splitting the compiler hub is broader architecture cleanup. | none in this ticket |
| `packages/engine/src/kernel/schemas-core.ts` | 3229 | 3236 | no; preexisting over 800 | +7 | User-approved deferral; retained change is the compiled policy ref schema union adjacent to existing ref variants. | none in this ticket |
| `packages/engine/src/kernel/types-core.ts` | 2895 | 2901 | no; preexisting over 800 | +6 | User-approved deferral; retained change is the compiled policy ref union adjacent to existing ref variants. | none in this ticket |

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/agents/preview-plan-delta.test.js` — passed, 4 tests.
- `pnpm -F @ludoforge/engine run schema:artifacts` — passed; regenerated `GameDef.schema.json`.
- `pnpm -F @ludoforge/engine test` — passed, 165/165 files.
