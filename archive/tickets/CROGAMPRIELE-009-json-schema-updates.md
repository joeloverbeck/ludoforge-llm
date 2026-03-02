# CROGAMPRIELE-009: JSON Schema updates for PhaseDef.actionDefaults

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — Zod schema source + JSON Schema artifacts
**Deps**: CROGAMPRIELE-006, CROGAMPRIELE-007

## Problem

The `PhaseDefSchema` Zod schema in `schemas-core.ts` does not include `actionDefaults`, even though the TypeScript `PhaseDef` type (added by CROGAMPRIELE-006) already has it. The generated `GameDef.schema.json` must be regenerated to reflect this addition.

## Assumption Reassessment (2026-03-02)

1. JSON Schema artifacts in `packages/engine/schemas/` are **auto-generated** from Zod schemas in `packages/engine/src/kernel/schemas-core.ts` via `z.toJSONSchema()` in `schema-artifacts.ts`. They must NOT be manually edited.
2. Schema generation/validation scripts are in `packages/engine/scripts/schema-artifacts.mjs`.
3. The `schema:artifacts` turborepo task regenerates schemas from the Zod source of truth.
4. Schema validation tests exist in `packages/engine/test/unit/schemas-top-level.test.ts` and `schema-artifacts-sync.test.ts`.
5. `actionDefaults` is an optional field — existing GameDefs without it must continue to validate.
6. **CROGAMPRIELE-007 already delivered the `ZoneDef.behavior` schema update**: `DeckBehaviorSchema`, `ZoneBehaviorSchema`, and the `behavior` field on `ZoneDefSchema` are all present in `schemas-core.ts`. The JSON schema already reflects this. Only `PhaseDef.actionDefaults` remains.

## Architecture Check

1. The Zod schema change is purely additive — one new optional field on `PhaseDefSchema`.
2. Existing GameDefs without `actionDefaults` must validate unchanged.
3. The Zod `PhaseDefSchema` must mirror the TypeScript `PhaseDef` type in `types-core.ts` exactly.

## What to Change

### 1. Update `PhaseDefSchema` in `schemas-core.ts`

Add `actionDefaults` as an optional strict sub-object matching the TypeScript type:
```typescript
actionDefaults: z.object({
  pre: ConditionASTSchema.optional(),
  afterEffects: z.array(EffectASTSchema).optional(),
}).strict().optional(),
```

### 2. Regenerate schema artifacts

Run `pnpm turbo schema:artifacts` to regenerate `GameDef.schema.json` from the updated Zod schema.

### 3. Add schema validation tests

Add tests in `schemas-top-level.test.ts`:
- GameDef with valid `actionDefaults` (both `pre` and `afterEffects`) validates.
- GameDef without `actionDefaults` validates (backwards compatible — already covered by existing minimal test).
- GameDef with invalid `actionDefaults` shape (e.g., unknown key) fails validation.

### 4. Verify existing schema tests pass

Existing schema validation tests must pass with the updated schema.

## Files to Touch

- `packages/engine/src/kernel/schemas-core.ts` (modify — add `actionDefaults` to `PhaseDefSchema`)
- `packages/engine/schemas/GameDef.schema.json` (regenerated via `schema:artifacts`)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify — add `actionDefaults` tests)

## Out of Scope

- `ZoneDef.behavior` schema (already done in CROGAMPRIELE-007)
- GameSpecDoc schema (validated by TypeScript types and the compiler pipeline, not JSON Schema)
- Kernel type changes (already done in CROGAMPRIELE-006)
- Game spec migrations (010, 011)

## Acceptance Criteria

### Tests That Must Pass

1. GameDef with `PhaseDef.actionDefaults` (both `pre` and `afterEffects`) validates against `GameDefSchema`.
2. GameDef without `actionDefaults` validates (backwards compatible).
3. GameDef with invalid `actionDefaults` shape fails validation.
4. Schema artifact generation completes without errors (`pnpm turbo schema:artifacts`).
5. Schema artifact sync test passes (`schema-artifacts-sync.test.ts`).
6. Existing suite: `pnpm turbo test`

### Invariants

1. Schema changes are additive — no existing valid GameDefs become invalid.
2. `PhaseDefSchema` matches `PhaseDef` TypeScript type in `types-core.ts` exactly.
3. Schema artifact generation scripts produce deterministic output.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-top-level.test.ts` (modify) — add `actionDefaults` acceptance/rejection tests.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

**Completion date**: 2026-03-02

### What actually changed

1. **`packages/engine/src/kernel/schemas-core.ts`**: Added `ActionDefaultsSchema` (strict object with optional `pre: ConditionASTSchema` and optional `afterEffects: z.array(EffectASTSchema)`). Added `actionDefaults: ActionDefaultsSchema.optional()` to `PhaseDefSchema`.
2. **`packages/engine/schemas/GameDef.schema.json`**: Regenerated via `pnpm -F @ludoforge/engine run schema:artifacts`. Now includes `actionDefaults` on the phase definition object in `turnStructure.phases` and `turnStructure.interrupts`.
3. **`packages/engine/test/unit/schemas-top-level.test.ts`**: Added 8 new tests in a `GameDefSchema with PhaseDef.actionDefaults` describe block covering valid inputs (both fields, pre-only, afterEffects-only, empty object), backward compatibility (no actionDefaults), and rejection cases (unknown properties, non-ConditionAST pre, non-array afterEffects).

### Deviations from original plan

- **Original ticket proposed manually editing `GameDef.schema.json`** — corrected to edit the Zod source of truth (`schemas-core.ts`) since the JSON schema is auto-generated.
- **Original ticket included `ZoneDef.behavior` as work item** — removed since CROGAMPRIELE-007 already delivered this.
- **Original ticket referenced non-existent `schema-validation.test.ts`** — corrected to `schemas-top-level.test.ts`.
- **Ticket title simplified** — removed `ZoneDef.behavior` since that half was already done.

### Verification results

- `pnpm turbo build`: passes
- `pnpm -F @ludoforge/engine run schema:artifacts -- --check`: passes (artifacts in sync)
- `pnpm turbo typecheck`: passes
- `pnpm turbo lint`: passes
- Engine tests: 53/53 pass in `schemas-top-level.test.ts` (8 new)
- Full suite: all engine tests pass. One pre-existing runner timeout (`resolve-bootstrap-config.test.ts`) unrelated to changes.
