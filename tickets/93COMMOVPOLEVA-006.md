# 93COMMOVPOLEVA-006: Add explicit preview unavailability reasons to policy traces

**Status**: PENDING
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

1. `packages/engine/src/agents/policy-preview.ts` already classifies preview outcomes with explicit generic reasons (`random`, `hidden`, `unresolved`, `failed`). Confirmed.
2. `packages/engine/src/agents/policy-eval.ts` currently exposes only `previewRefIds` and `unknownPreviewRefIds` per candidate plus aggregate `previewUsage.unknownRefIds`; it does not preserve the underlying reason. Confirmed.
3. `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts` define the policy trace contract. Extending diagnostics requires updating those central generic contracts, not adding ad hoc side channels. Confirmed.
4. `archive/tickets/93COMMOVPOLEVA-005.md` established that the fixed-seed FITL opening trace remains unknown because hidden sampling is still required after preview application. That is now proven behavior and provides the concrete motivating case for richer diagnostics.
5. No active ticket already covers this exact follow-up. `specs/94-agent-evaluation-diagnostics.md` covers broader policy diagnostics, but there is no current active ticket specifying explicit preview-unavailability reason plumbing. Confirmed.

## Architecture Check

1. The clean design is to preserve preview outcome reasons in the generic policy-evaluation metadata itself, not to bolt on FITL-specific assertions or log parsing. That keeps diagnostics authoritative and machine-checkable.
2. This remains aligned with `docs/FOUNDATIONS.md`: the change is game-agnostic, lives in generic agent/trace contracts, and does not add any game-specific branching to the kernel or runtime.
3. No backwards-compatibility aliasing should be introduced. If the trace contract changes, update every consumer, schema, and test in the same change. Do not keep both “old unknown array only” and “new reasoned payload” surfaces.
4. The most robust shape is structured data, not free-form strings. Prefer a small generic enum plus per-ref attribution over human text blobs so tests and tooling can rely on it.

## What to Change

### 1. Extend preview diagnostics to carry explicit generic reasons

Plumb preview unavailability reasons from `policy-preview.ts` through `policy-eval.ts` into the emitted policy trace metadata.

Recommended shape:

- per candidate, replace or supersede `unknownPreviewRefIds: readonly string[]` with a structured collection such as:
  - `unknownPreviewRefs: readonly { refId: string; reason: 'random' | 'hidden' | 'unresolved' | 'failed' }[]`
- for aggregate preview usage, add a grouped surface such as:
  - `unknownRefDetails: readonly { refId: string; reason: ... }[]`

The exact field names can be adjusted during implementation, but the contract must preserve both:
- which ref was unavailable
- why it was unavailable

### 2. Keep the preview/runtime boundary generic and single-sourced

Do not duplicate reason inference inside `policy-eval.ts` or diagnostics formatters. `policy-preview.ts` already owns preview resolution semantics and should remain the single source of truth for outcome classification.

The evaluator should consume a structured preview result and forward that information without recomputing it.

### 3. Update trace/schema contracts comprehensively

Update all affected generic contracts together:

- runtime types in `packages/engine/src/kernel/types-core.ts`
- runtime validation schemas in `packages/engine/src/kernel/schemas-core.ts`
- policy diagnostics builders/formatters
- any golden fixtures or tests that assert the policy trace payload

If the current array-only fields become redundant after the redesign, delete them rather than keeping compatibility shims.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)
- `packages/engine/test/unit/trace/policy-trace-events.test.ts` (modify)
- `packages/engine/test/unit/policy-production-golden.test.ts` (modify if the summary trace contract changes)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (modify if the summary trace contract changes)

## Out of Scope

- Changing authored visibility policy or allowing hidden-sampling-based preview where it is currently disallowed
- Multi-ply search, rollouts, or candidate scoring redesign
- FITL-specific heuristics or any game-specific diagnostic branches
- UI/runner presentation work beyond whatever breaks from the trace contract update

## Acceptance Criteria

### Tests That Must Pass

1. A FITL production integration test proves the fixed-seed opening trace attributes `victoryCurrentMargin.currentMargin.self` to the `hidden` reason, not a generic unknown bucket
2. A unit trace/diagnostics test proves policy trace payloads include structured preview-unavailability reasons
3. If the summary trace fixture changes, `packages/engine/test/unit/policy-production-golden.test.ts` passes with the updated generic contract
4. Existing suite: `pnpm turbo test`
5. Existing suite: `pnpm turbo typecheck`
6. Existing suite: `pnpm turbo lint`

### Invariants

1. Preview reason attribution remains generic (`random`, `hidden`, `unresolved`, `failed`) and does not mention game-specific concepts
2. `policy-preview.ts` remains the single source of truth for preview outcome classification
3. No backward-compatibility alias fields or duplicate trace surfaces remain after the contract update
4. The fixed-seed FITL production behavior itself is unchanged; only diagnostics become more explicit

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — assert the fixed-seed opening trace attributes the unresolved FITL preview ref to the `hidden` reason; rationale: proves the motivating production case directly
2. `packages/engine/test/unit/trace/policy-trace-events.test.ts` — assert structured preview-unavailability reasons survive into emitted policy traces; rationale: locks the generic diagnostics contract
3. `packages/engine/test/unit/policy-production-golden.test.ts` and `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` — update only if the summary trace contract changes; rationale: keep the fixed-seed golden aligned with the new generic trace shape

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js packages/engine/dist/test/unit/policy-production-golden.test.js`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
