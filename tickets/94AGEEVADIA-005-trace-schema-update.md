# 94AGEEVADIA-005: Update Trace JSON schema with diagnostic fields

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — schemas/Trace.schema.json
**Deps**: 94AGEEVADIA-001, 94AGEEVADIA-004

## Problem

The `Trace.schema.json` defines the JSON schema for serialized traces. The new diagnostic fields (`outcomeBreakdown`, `completionStatistics`, per-candidate `previewOutcome`) added in previous tickets are not reflected in the schema, which means schema validation would reject traces containing these fields (due to `additionalProperties: false`).

## Assumption Reassessment (2026-03-29)

1. `Trace.schema.json` contains `previewUsage` with `evaluatedCandidateCount`, `refIds`, `unknownRefs` — all required — **confirmed** (line ~2749, `additionalProperties: false`).
2. The policy `candidates` array item schema has `actionId`, `stableMoveKey`, `score`, `prunedBy` as required, `scoreContributions`, `previewRefIds`, `unknownPreviewRefs` as optional — **confirmed** (line ~2831, `additionalProperties: false`).
3. The policy agent decision object uses `additionalProperties: false` — **confirmed** (line ~2939). New fields MUST be added to the schema to pass validation.
4. Schema artifacts are generated/checked via `pnpm -F @ludoforge/engine schema:artifacts` — **confirmed**.

## Architecture Check

1. All new fields are optional in the schema (not in `required` arrays) — backward compatible.
2. Schema changes mirror the type changes in 94AGEEVADIA-001 exactly — no drift between types and schema.
3. No game-specific content in the schema additions.
4. Schema generation/check scripts will validate consistency.

## What to Change

### 1. Add `outcomeBreakdown` to `previewUsage` schema

Inside the `previewUsage` object properties (after `unknownRefs`), add:

```json
"outcomeBreakdown": {
  "type": "object",
  "properties": {
    "ready": { "type": "number" },
    "unknownRandom": { "type": "number" },
    "unknownHidden": { "type": "number" },
    "unknownUnresolved": { "type": "number" },
    "unknownFailed": { "type": "number" }
  },
  "required": ["ready", "unknownRandom", "unknownHidden", "unknownUnresolved", "unknownFailed"],
  "additionalProperties": false
}
```

Do NOT add to the `required` array of `previewUsage` — it is optional.

### 2. Add `completionStatistics` to the policy agent decision schema

Inside the policy agent decision object properties (after `failure` or `candidates`), add:

```json
"completionStatistics": {
  "type": "object",
  "properties": {
    "totalClassifiedMoves": { "type": "number" },
    "completedCount": { "type": "number" },
    "stochasticCount": { "type": "number" },
    "rejectedNotViable": { "type": "number" },
    "templateCompletionAttempts": { "type": "number" },
    "templateCompletionSuccesses": { "type": "number" },
    "templateCompletionUnsatisfiable": { "type": "number" }
  },
  "required": [
    "totalClassifiedMoves", "completedCount", "stochasticCount",
    "rejectedNotViable", "templateCompletionAttempts",
    "templateCompletionSuccesses", "templateCompletionUnsatisfiable"
  ],
  "additionalProperties": false
}
```

Do NOT add to the `required` array of the policy agent decision — it is optional.

### 3. Add `previewOutcome` to the candidate item schema

Inside the candidate object properties (after `unknownPreviewRefs`), add:

```json
"previewOutcome": {
  "anyOf": [
    { "type": "string", "const": "ready" },
    { "type": "string", "const": "random" },
    { "type": "string", "const": "hidden" },
    { "type": "string", "const": "unresolved" },
    { "type": "string", "const": "failed" }
  ]
}
```

Do NOT add to the `required` array of the candidate — it is optional.

### 4. Regenerate schema artifacts

Run `pnpm -F @ludoforge/engine schema:artifacts` to ensure artifacts are in sync after the manual edit.

## Files to Touch

- `packages/engine/schemas/Trace.schema.json` (modify)

## Out of Scope

- Modifying `GameDef.schema.json` or `EvalReport.schema.json`
- Changing any source code files (types, agents, diagnostics)
- Altering existing required fields or removing any schema properties
- Schema generation scripts themselves

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine schema:artifacts:check` — schema check passes (artifacts in sync).
2. A trace JSON with `outcomeBreakdown` present in `previewUsage` validates against the schema.
3. A trace JSON without `outcomeBreakdown` in `previewUsage` still validates (optional field).
4. A trace JSON with `completionStatistics` on the policy decision validates.
5. A trace JSON without `completionStatistics` still validates (optional field).
6. A trace JSON with `previewOutcome` on a candidate validates.
7. A trace JSON without `previewOutcome` on a candidate still validates (optional field).
8. Existing suite: `pnpm turbo test` — all existing tests pass unchanged.

### Invariants

1. No existing `required` arrays are modified.
2. All new schema objects use `additionalProperties: false`.
3. Field names in the schema exactly match the TypeScript interface field names from 94AGEEVADIA-001.
4. The `previewOutcome` enum values exactly match: `ready`, `random`, `hidden`, `unresolved`, `failed`.
5. `outcomeBreakdown` required fields (when present) are: all 5 count fields.
6. `completionStatistics` required fields (when present) are: all 7 count fields.

## Test Plan

### New/Modified Tests

1. Schema validation tests are implicitly covered by `schema:artifacts:check` and any existing trace golden tests.
2. If the project has explicit schema validation tests in `test/`, they will cover the new optional fields via backward compatibility (traces without new fields pass, traces with new fields also pass).

### Commands

1. `pnpm -F @ludoforge/engine schema:artifacts`
2. `pnpm -F @ludoforge/engine schema:artifacts:check`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
