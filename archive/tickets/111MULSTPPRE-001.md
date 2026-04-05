# 111MULSTPPRE-001: Extend preview trace types for granted operations

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types, Zod schemas
**Deps**: `specs/111-multi-step-preview-for-granted-operations.md`

## Problem

The preview trace types have no fields for recording whether a multi-step preview was used for a candidate. Before implementing multi-step preview logic, the trace infrastructure must exist so that the logic can populate it and diagnostics can consume it.

## Assumption Reassessment (2026-04-05)

1. `PolicyCandidateDecisionTrace` exists at `types-core.ts:1519` with fields including `previewOutcome` — confirmed via grep.
2. `PolicyPreviewOutcomeBreakdownTrace` exists at `types-core.ts:1571` — confirmed.
3. Zod schemas for these types are in `schemas-core.ts` — confirmed, must be updated in parallel.

## Architecture Check

1. Pure additive type change — no logic modification. All new fields are optional, so existing consumers are unaffected.
2. Engine-agnostic: the trace fields describe generic preview behavior (granted operation simulation), not game-specific concepts.
3. No backwards-compatibility shims — new optional fields on existing interfaces.

## What to Change

### 1. Add granted operation trace fields to `PolicyCandidateDecisionTrace` (`types-core.ts`)

Add three optional fields after the existing `previewOutcome` field:

```typescript
readonly grantedOperationSimulated?: boolean;
readonly grantedOperationMove?: { readonly actionId: string; readonly params: Readonly<Record<string, unknown>> };
readonly grantedOperationMarginDelta?: number;
```

- `grantedOperationSimulated`: true if multi-step preview was used for this candidate
- `grantedOperationMove`: the move the agent selected as the granted operation
- `grantedOperationMarginDelta`: margin improvement from the granted operation (post-event-plus-operation margin minus post-event-only margin)

### 2. Update Zod schema (`schemas-core.ts`)

Add corresponding optional fields to the `PolicyCandidateDecisionTrace` Zod schema:

```typescript
grantedOperationSimulated: z.boolean().optional(),
grantedOperationMove: z.object({
  actionId: z.string(),
  params: z.record(z.string(), z.unknown()),
}).optional(),
grantedOperationMarginDelta: z.number().optional(),
```

### 3. Run schema artifacts generation

After updating types and Zod schemas, run `pnpm -F @ludoforge/engine run schema:artifacts` to regenerate JSON schema files.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/` (regenerate via `schema:artifacts`)

## Out of Scope

- No logic changes to preview evaluation
- No changes to `policy-preview.ts` or `policy-eval.ts`
- No diagnostic wiring (ticket 005)
- No test changes beyond schema artifact check

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine run schema:artifacts:check` passes (schemas in sync)
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All new fields are optional — no existing consumer breaks
2. Zod schema matches TypeScript interface exactly

## Test Plan

### New/Modified Tests

1. No new test files — this is a pure type/schema change verified by existing schema artifact checks.

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts` (regenerate)
2. `pnpm -F @ludoforge/engine run schema:artifacts:check` (verify sync)
3. `pnpm -F @ludoforge/engine test` (full suite)

## Outcome

Completed on 2026-04-05.

What changed:
- Added optional granted-operation trace fields to [`PolicyCandidateDecisionTrace`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/types-core.ts): `grantedOperationSimulated`, `grantedOperationMove`, and `grantedOperationMarginDelta`.
- Added the matching optional Zod fields in [`schemas-core.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/schemas-core.ts).
- Regenerated engine schema artifacts, including the trace schema surface in [`Trace.schema.json`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/schemas/Trace.schema.json).

Deviations from the original plan:
- No runtime logic or diagnostic wiring changed; this remained a pure preparatory trace/schema ticket exactly as scoped.
- The shared schema generator also rewrote other engine schema artifacts, but the semantically owned generated contract for this ticket was the trace schema.

Verification:
- `pnpm -F @ludoforge/engine run schema:artifacts`
- `pnpm -F @ludoforge/engine run schema:artifacts:check`
- `pnpm -F @ludoforge/engine test`
