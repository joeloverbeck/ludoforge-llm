# 93COMMOVPOLEVA-006: Add explicit preview unavailability reasons to policy traces

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — policy diagnostics, evaluator metadata, trace schema/types, and tests
**Deps**: `archive/tickets/93COMMOVPOLEVA-005.md`, `specs/94-agent-evaluation-diagnostics.md`

## Problem

The current policy trace shape records which preview refs were unresolved through `unknownPreviewRefIds` and `previewUsage.unknownRefIds`, but it does not explain why a ref was unavailable. After the 93COMMOVPOLEVA ticket set, this is the remaining architecture gap in this area:

- production traces can correctly report that `victoryCurrentMargin.currentMargin.self` is unknown
- users and tests still have to infer whether that came from RNG consumption, hidden-sampling gating, unresolved move completion, or preview application failure

That makes diagnostics weaker than they should be. The runtime is already classifying preview outcomes into generic reasons (`random`, `hidden`, `unresolved`, `failed`), but that information is collapsed before it reaches the trace contract.

## Assumption Reassessment (2026-03-29)

1. `packages/engine/src/agents/policy-preview.ts` partially classifies preview outcomes with explicit generic reasons. It emits `random`, `unresolved`, and `failed`, but hidden-sampling gating currently returns bare `undefined` instead of an explicit `hidden` reason. Corrected.
2. The reason is lost in two places: hidden-sampling gating inside `policy-preview.ts` is not currently represented as a reason at all, and `packages/engine/src/agents/policy-runtime.ts` then erases the remaining preview semantics by exposing preview resolution as `number | undefined`. Corrected.
3. `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts` define the policy trace contract. Extending diagnostics requires updating those central generic contracts, not adding ad hoc side channels. Confirmed.
4. `archive/tickets/93COMMOVPOLEVA-005.md` established that the fixed-seed FITL opening trace remains unknown because hidden sampling is still required after preview application. That is now proven behavior and provides the concrete motivating case for richer diagnostics.
5. Existing tests already assert the array-only unknown surfaces in more places than originally listed: `packages/engine/test/unit/agents/policy-agent.test.ts`, `packages/engine/test/integration/fitl-policy-agent.test.ts`, and the summary golden fixtures all consume the current contract. Corrected.
6. No active ticket already covers this exact follow-up. `specs/94-agent-evaluation-diagnostics.md` covers broader policy diagnostics, but its proposal assumes additive backward-compatible fields and broader completion statistics. That is not the right scope for this ticket under current foundations. Corrected.

## Architecture Check

1. The clean design is to make `policy-preview.ts` emit a complete structured preview-resolution result, including the hidden-sampling case, then thread that same generic result through evaluation metadata into traces. Do not infer reasons later in the evaluator or formatter. That keeps diagnostics authoritative and machine-checkable.
2. This remains aligned with `docs/FOUNDATIONS.md`: the change is game-agnostic, lives in generic agent/trace contracts, and does not add any game-specific branching to the kernel or runtime.
3. No backwards-compatibility aliasing should be introduced. If the trace contract changes, update every consumer, schema, and test in the same change. Delete the array-only unknown surfaces rather than keeping both the old and new shapes.
4. The most robust shape is structured data, not free-form strings. Use a small generic enum plus per-ref attribution so tests and tooling can rely on it.
5. The ideal architecture here is a single preview-resolution shape reused end-to-end. Avoid parallel representations such as one structure in `policy-preview.ts`, another in `policy-eval.ts`, and a third in trace types. The evaluator should forward the same semantic payload, not translate it into loosely related shapes.

## What to Change

### 1. Promote preview resolution to a structured generic contract

Change the preview runtime/provider boundary so preview resolution returns structured data instead of a bare `number | undefined`.

Recommended direction:

- define one shared generic type for preview-unavailability details, for example:
  - `{ refId: string; reason: 'random' | 'hidden' | 'unresolved' | 'failed' }`
- have `policy-preview.ts` / `policy-runtime.ts` expose either:
  - a structured preview resolution result that includes the numeric value when available, or
  - a dedicated method that returns structured unknown details for a candidate/ref pair
- use that same detail type in per-candidate trace metadata and aggregate preview usage metadata

The exact field names can be adjusted during implementation, but the contract must preserve both:
- which ref was unavailable
- why it was unavailable

### 2. Keep the preview/runtime boundary generic and single-sourced

Do not duplicate reason inference inside `policy-eval.ts` or diagnostics formatters. `policy-preview.ts` already owns preview resolution semantics and should remain the single source of truth for outcome classification, with `policy-runtime.ts` forwarding that structure instead of erasing it.

The evaluator should consume a structured preview result and forward that information without recomputing it.

### 3. Update trace/schema contracts comprehensively

Update all affected generic contracts together:

- preview runtime/provider contracts in `packages/engine/src/agents/policy-runtime.ts`
- runtime types in `packages/engine/src/kernel/types-core.ts`
- runtime validation schemas in `packages/engine/src/kernel/schemas-core.ts`
- policy diagnostics builders/formatters
- any golden fixtures or tests that assert the policy trace payload

Delete the current array-only unknown fields once the structured contract is in place. Summary and verbose traces should both use the new authoritative shape.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)
- `packages/engine/test/unit/trace/policy-trace-events.test.ts` (modify)
- `packages/engine/test/unit/policy-production-golden.test.ts` (verify; fixture-backed)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (modify)
- `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json` (modify if the summary contract shape changes even when arrays stay empty)

## Out of Scope

- Changing authored visibility policy or allowing hidden-sampling-based preview where it is currently disallowed
- Multi-ply search, rollouts, candidate scoring redesign, or broader preview-outcome counting
- FITL-specific heuristics or any game-specific diagnostic branches
- Completion statistics, preparation-pipeline counters, or other broader diagnostics proposed in `specs/94-agent-evaluation-diagnostics.md`
- UI/runner presentation work beyond whatever breaks from the trace contract update

## Acceptance Criteria

### Tests That Must Pass

1. A FITL production integration test proves the fixed-seed opening trace attributes `victoryCurrentMargin.currentMargin.self` to the `hidden` reason, not a generic unknown bucket.
2. A unit test of the policy agent production path proves a completed template preview candidate records no unknown preview details when preview resolution succeeds.
3. A unit trace/diagnostics test proves policy trace payloads include structured preview-unavailability details and no legacy array-only unknown fields.
4. Summary golden tests pass with the updated generic contract.
5. Existing suite: `pnpm turbo test`
6. Existing suite: `pnpm turbo typecheck`
7. Existing suite: `pnpm turbo lint`

### Invariants

1. Preview reason attribution remains generic (`random`, `hidden`, `unresolved`, `failed`) and does not mention game-specific concepts.
2. `policy-preview.ts` remains the single source of truth for preview outcome classification.
3. `policy-runtime.ts` no longer erases preview-unavailability semantics at the provider boundary.
4. No backward-compatibility alias fields or duplicate trace surfaces remain after the contract update.
5. The fixed-seed FITL production behavior itself is unchanged; only diagnostics become more explicit.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — assert the fixed-seed opening trace attributes the unresolved FITL preview ref to the `hidden` reason; rationale: proves the motivating production case directly.
2. `packages/engine/test/unit/agents/policy-agent.test.ts` — update the completed-template preview assertions to the structured contract; rationale: preserves production-path coverage for successful preview resolution and ensures the old array-only field is gone.
3. `packages/engine/test/unit/trace/policy-trace-events.test.ts` — assert structured preview-unavailability details survive into emitted policy traces; rationale: locks the generic diagnostics contract.
4. `packages/engine/test/unit/policy-production-golden.test.ts`, `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json`, and `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json` — update as needed for the summary contract change; rationale: keep fixed-seed golden traces aligned with the new generic shape.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js packages/engine/dist/test/unit/policy-production-golden.test.js`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - preview resolution now returns structured generic results instead of a bare `number | undefined`
  - hidden-sampling gating now emits the explicit `hidden` reason instead of silently collapsing to `undefined`
  - policy evaluation and policy trace metadata now use structured unknown-preview detail objects instead of array-only unknown ref ids
  - the central trace schema artifact and summary golden fixtures were updated to the new contract
- Deviations from original plan:
  - the ticket was corrected before implementation because the original assumptions overstated current hidden-reason support and missed `policy-runtime.ts` plus existing consumer tests
  - two additional engine unit tests required contract migration: `packages/engine/test/unit/agents/policy-preview.test.ts` and `packages/engine/test/unit/agents/policy-eval.test.ts`
- Verification results:
  - focused engine tests passed:
    - `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js packages/engine/dist/test/unit/policy-production-golden.test.js`
  - repo gates passed:
    - `pnpm turbo test`
    - `pnpm turbo typecheck`
    - `pnpm turbo lint`
