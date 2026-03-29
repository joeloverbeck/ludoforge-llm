# 94AGEEVADIA-005: Update Trace JSON schema with diagnostic fields

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — schemas/Trace.schema.json
**Deps**: 94AGEEVADIA-001, 94AGEEVADIA-004

## Problem

This ticket originally assumed the new policy diagnostic fields were missing from the trace schema and needed a manual `Trace.schema.json` edit. That assumption is no longer true in the current codebase.

The real remaining risk is weaker than the ticket described: the diagnostic fields already exist in the source types, zod schema definitions, generated `Trace.schema.json`, and policy trace tests, but trace-schema regression coverage should explicitly prove that serialized traces carrying these fields validate through AJV.

## Assumption Reassessment (2026-03-29)

1. `packages/engine/src/kernel/types-core.ts` already defines `previewUsage.outcomeBreakdown`, `completionStatistics`, and per-candidate `previewOutcome` on the trace types — **confirmed**.
2. `packages/engine/src/kernel/schemas-core.ts` already defines those same fields in the zod-backed schema source of truth — **confirmed**.
3. `packages/engine/schemas/Trace.schema.json` already contains the generated JSON Schema entries for those fields under strict objects with `additionalProperties: false` — **confirmed**.
4. Existing unit/integration/golden tests already cover diagnostic behavior and serialized policy trace fixtures containing `outcomeBreakdown` and verbose trace fields — **confirmed**.
5. `pnpm -F @ludoforge/engine schema:artifacts` remains the correct artifact regeneration command, but manual edits to `Trace.schema.json` would now be the wrong architectural approach — **confirmed**.

## Architecture Check

1. The current architecture is better than the ticket’s original plan: `schemas-core.ts` is the source of truth and generated artifacts mirror it. Manual artifact editing would introduce drift risk and is not acceptable under Foundations 9 and 10.
2. The diagnostic fields are intentionally additive and optional at the serialized trace boundary. That keeps the trace contract extensible without aliasing or compatibility shims.
3. The summary versus verbose split is implemented at the agent diagnostics layer, not in schema generation, which is the correct separation of concerns.
4. The remaining architectural gap is test proof, not production structure: schema validation should explicitly exercise serialized policy traces with and without the optional diagnostic fields.

## What to Change

### 1. Correct the ticket scope

Document that the schema and implementation work are already present, and that this ticket is now a verification-and-proof ticket rather than a production-schema implementation ticket.

### 2. Strengthen explicit trace schema regression coverage

Add or update tests so AJV validation directly covers:

- a serialized trace whose policy decision trace includes `previewUsage.outcomeBreakdown`
- a serialized trace whose policy decision trace includes `completionStatistics`
- a serialized trace whose verbose policy candidates include `previewOutcome`
- a serialized trace that omits those optional fields and still validates

### 3. Re-run artifact and engine verification

Run the schema artifact check plus the relevant engine tests so this ticket closes with explicit proof rather than inferred confidence.

## Files to Touch

- `tickets/94AGEEVADIA-005-trace-schema-update.md` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/schemas/Trace.schema.json` only if regeneration proves the committed artifact is stale

## Out of Scope

- Re-implementing diagnostics that are already present in source
- Manual edits to generated schema artifacts when the source schema is already correct
- Modifying `GameDef.schema.json` or `EvalReport.schema.json`
- Changing policy evaluation behavior unless validation uncovers a real contract bug
- Schema generation scripts themselves

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine schema:artifacts:check` passes with no artifact drift.
2. AJV validation explicitly passes for serialized policy traces that include `previewUsage.outcomeBreakdown`.
3. AJV validation explicitly passes for serialized policy traces that include `completionStatistics`.
4. AJV validation explicitly passes for serialized policy traces whose verbose candidates include `previewOutcome`.
5. AJV validation explicitly passes when those fields are omitted.
6. Relevant existing engine tests continue to pass unchanged.

### Invariants

1. `schemas-core.ts` remains the only schema source of truth; generated artifacts are not hand-maintained.
2. No existing required fields are relaxed or removed.
3. The serialized field names remain exactly: `outcomeBreakdown`, `completionStatistics`, `previewOutcome`.
4. The `previewOutcome` enum values remain exactly: `ready`, `random`, `hidden`, `unresolved`, `failed`.
5. `outcomeBreakdown` and `completionStatistics` remain strict objects when present.

## Test Plan

### New/Modified Tests

1. Add explicit AJV schema validation coverage in `packages/engine/test/unit/json-schema.test.ts` for policy traces with the diagnostic fields present.
2. Add explicit AJV schema validation coverage in `packages/engine/test/unit/json-schema.test.ts` for policy traces with the optional diagnostic fields omitted.

### Commands

1. `pnpm -F @ludoforge/engine schema:artifacts`
2. `pnpm -F @ludoforge/engine schema:artifacts:check`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`
5. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Reassessed the ticket against the current codebase and corrected its assumptions.
  - Confirmed the diagnostic fields were already implemented in `types-core.ts`, `schemas-core.ts`, generated `Trace.schema.json`, and existing policy diagnostics tests.
  - Added explicit AJV schema regression coverage in `packages/engine/test/unit/json-schema.test.ts` for policy traces that include `outcomeBreakdown`, `completionStatistics`, and candidate `previewOutcome`, plus a regression case proving those fields remain optional.
- Deviations from original plan:
  - No production schema or agent implementation changes were needed.
  - The original plan to hand-edit `packages/engine/schemas/Trace.schema.json` was incorrect for the current architecture because generated artifacts are derived from `schemas-core.ts`.
- Verification results:
  - `pnpm -F @ludoforge/engine schema:artifacts:check` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo test` passed.
