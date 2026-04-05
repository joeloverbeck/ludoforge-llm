# 109AGEPREAUD-004: Enrich preview failure diagnostics in trace output

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — policy-preview.ts, policy-diagnostics.ts, types-core.ts (trace types)
**Deps**: `archive/tickets/109AGEPREAUD-002.md`

## Problem

Ticket 001 already added verbose per-candidate `previewOutcome` and per-move `movePreparations` diagnostics. The remaining gap is narrower: when preview still fails for a candidate, the trace shows `unknown` with reason `unresolved` or `failed`, but it still does not explain WHY at the preview-failure boundary. Was it `notDecisionComplete`, `notViable`, `completionUnsatisfiable`, source-hash mismatch, or an exception during move application?

## Assumption Reassessment (2026-04-05)

1. `classifyPreviewOutcome` at `policy-preview.ts` still returns `unknown/unresolved` for non-complete classifications without surfacing the underlying rejection code.
2. `tryApplyPreview` still returns `unknown/failed` on caught exceptions without exposing failure detail.
3. Ticket 001 added per-candidate `previewOutcome` and verbose `movePreparations`, but there is still no explicit preview-failure detail field on the candidate trace itself.
4. The remaining observability gap is specifically the preview-failure reason, not basic candidate visibility in the verbose trace.

## Architecture Check

1. Diagnostic enrichment is observability (Foundation 9 — telemetry and auditability). Adding failure detail to traces improves debugging without changing behavior.
2. The trace type change is additive (new optional field) — no backwards compatibility concern (Foundation 14).
3. No game-specific logic — generic failure reasons apply to all move types.

## What to Change

### 1. Add failure detail to `PreviewOutcome` in `policy-preview.ts`

When returning `unknown` outcomes, include the specific reason:
- `'unresolved'` → also include the `PlayableCandidateClassification` kind (e.g., `'notDecisionComplete'`, `'notViable'`, `'completionUnsatisfiable'`)
- `'failed'` → include the exception message (truncated to a reasonable length)
- `'random'` → already clear (exact-world mode rejected stochastic outcome)

### 2. Surface per-candidate preview failure detail in trace

The verbose trace already carries per-candidate `previewOutcome`. Extend that surface so:

- candidates with `previewOutcome='ready' | 'stochastic'` remain unchanged
- candidates with preview failure add `previewFailureReason`
- the failure detail reflects the actual preview boundary cause rather than forcing readers to infer it from unrelated preparation diagnostics

### 3. Update trace schema

Add the new optional fields to `PolicyCandidateDecisionTrace` in `types-core.ts` and regenerate the Trace schema via `pnpm -F @ludoforge/engine run schema:artifacts`.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify) — add failure detail to PreviewOutcome
- `packages/engine/src/agents/policy-diagnostics.ts` (modify) — surface per-candidate preview failure detail
- `packages/engine/src/kernel/types-core.ts` (modify) — add previewFailureReason to trace types
- `packages/engine/src/kernel/schemas-core.ts` (modify) — add to Zod schema
- `packages/engine/schemas/Trace.schema.json` (regenerated)
- Golden fixtures (regenerated via sync-fixtures.sh)

## Out of Scope

- Fixing preview failures (ticket 002) — this ticket only improves observability
- Enumeration-time filter (ticket 003)
- Integration tests (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. Trace output for a candidate with preview failure includes `previewFailureReason` detail
2. Trace output for a candidate with successful preview does NOT include failure fields
3. Schema validation passes with the new fields
4. Existing suite: `pnpm turbo test`

### Invariants

1. No behavioral changes — preview outcomes identical, only trace output enriched
2. Trace schema is backwards-compatible (new fields are optional)
3. Performance: no measurable overhead (failure detail is constructed only for the trace, not during evaluation)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/preview-diagnostics.test.ts` (new or modify existing) — verify failure reason appears in trace for candidates with preview failures
2. Golden fixtures — regenerate after schema change

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`

## Outcome

Completed: 2026-04-05

The trace observability gap was real. `previewOutcome` remained too coarse to explain why unresolved or failed preview candidates stopped at the preview boundary, so this ticket added an additive detail field without changing preview behavior.

What changed:
- added optional `previewFailureReason` to verbose policy candidate traces
- threaded preview-boundary failure detail through `policy-preview`, `policy-runtime`, `policy-evaluation-core`, and `policy-eval`
- updated `types-core.ts`, `schemas-core.ts`, and regenerated `packages/engine/schemas/Trace.schema.json`
- added focused coverage in `policy-preview.test.ts`, `policy-diagnostics.test.ts`, and `json-schema.test.ts`

Deviations from original plan:
- no golden fixture regeneration was needed because the touched test/schema surface was fully covered by focused assertions and schema validation
- `policy-diagnostics.ts` itself did not require code changes; the trace builder already forwarded candidate metadata once the new field existed

Verification:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine run schema:artifacts`
- `node --test dist/test/unit/agents/policy-preview.test.js dist/test/unit/agents/policy-diagnostics.test.js dist/test/unit/json-schema.test.js` (run from `packages/engine`)
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo test`
