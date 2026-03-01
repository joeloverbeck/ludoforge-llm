# CROGAMPRIELE-009: JSON Schema updates for PhaseDef.actionDefaults and ZoneDef.behavior

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — JSON Schema artifacts
**Deps**: CROGAMPRIELE-006, CROGAMPRIELE-007

## Problem

The GameDef JSON Schema (`packages/engine/schemas/GameDef.schema.json`) must reflect the new optional fields added by CROGAMPRIELE-006 (`PhaseDef.actionDefaults`) and CROGAMPRIELE-007 (`ZoneDef.behavior`). Schema artifacts must be regenerated and validated.

## Assumption Reassessment (2026-03-01)

1. JSON Schema artifacts are in `packages/engine/schemas/`.
2. Schema generation/validation scripts are in `packages/engine/scripts/`.
3. The `schema:artifacts` turborepo task regenerates schemas.
4. Schema validation tests exist and run as part of `pnpm turbo test`.
5. Both `actionDefaults` and `behavior` are optional fields — existing GameDefs without them must continue to validate.

## Architecture Check

1. Schema changes are purely additive — new optional fields with `additionalProperties` patterns.
2. Existing GameDefs without these fields must validate unchanged.
3. Schema definitions mirror the TypeScript types exactly.

## What to Change

### 1. Update `GameDef.schema.json` for `PhaseDef.actionDefaults`

Add to the phase definition object:
```json
"actionDefaults": {
  "type": "object",
  "properties": {
    "pre": { "$ref": "#/definitions/ConditionAST" },
    "afterEffects": {
      "type": "array",
      "items": { "$ref": "#/definitions/EffectAST" }
    }
  },
  "additionalProperties": false
}
```

### 2. Update `GameDef.schema.json` for `ZoneDef.behavior`

Add to the zone definition object:
```json
"behavior": {
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "type": { "const": "deck" },
        "drawFrom": { "enum": ["top", "bottom", "random"] },
        "reshuffleFrom": { "type": "string" }
      },
      "required": ["type", "drawFrom"],
      "additionalProperties": false
    }
  ]
}
```

### 3. Regenerate schema artifacts

Run `pnpm turbo schema:artifacts` to regenerate all schema-derived files.

### 4. Verify existing schema tests pass

Existing schema validation tests must pass with the updated schema (existing GameDefs without new fields should still validate).

## Files to Touch

- `packages/engine/schemas/GameDef.schema.json` (modify)
- Any generated schema artifacts (regenerated via `schema:artifacts`)

## Out of Scope

- GameSpecDoc schema (GameSpecDoc is not validated against a JSON Schema — it's validated by TypeScript types and the compiler pipeline)
- Kernel type changes (already done in 006, 007)
- Game spec migrations (010, 011)
- Adding new schema validation tests beyond verifying existing ones pass

## Acceptance Criteria

### Tests That Must Pass

1. GameDef with `PhaseDef.actionDefaults` (both `pre` and `afterEffects`) validates against updated schema.
2. GameDef with `ZoneDef.behavior` (deck type with all fields) validates against updated schema.
3. GameDef without `actionDefaults` and `behavior` validates (backwards compatible).
4. GameDef with invalid `behavior.type` fails validation.
5. GameDef with invalid `behavior.drawFrom` fails validation.
6. Schema artifact generation completes without errors.
7. Existing suite: `pnpm turbo test`

### Invariants

1. Schema changes are additive — no existing valid GameDefs become invalid.
2. Schema definitions match TypeScript types in `types-core.ts` exactly.
3. Schema artifact generation scripts produce deterministic output.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schema-validation.test.ts` (modify if needed) — verify new fields are accepted/rejected correctly.

### Commands

1. `pnpm turbo schema:artifacts`
2. `pnpm turbo build`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
