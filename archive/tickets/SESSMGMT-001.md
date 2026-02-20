# SESSMGMT-001: Engine Metadata Enrichment (Spec 43 D0)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — adds optional `name`/`description` to `GameSpecMetadata`, metadata validator contracts, and `GameDef.metadata`
**Deps**: None

## Problem

The session game-selection flow needs human-readable game names and descriptions. Today the engine metadata contract only carries `id`/`players` (+ optional `maxTriggerDepth`) and drops display metadata.

There is also a validator gap in current assumptions: CNL metadata keys are explicitly whitelisted via `METADATA_KEYS`, so adding fields only in type/schema/compiler is insufficient. Without validator updates, `metadata.name` and `metadata.description` are emitted as unknown-key warnings and are not first-class metadata fields.

## Architecture Decision

Proposed direction is better than current architecture because it keeps game display metadata in the single canonical metadata contract (`GameSpecDoc.metadata -> GameDef.metadata`) instead of creating runner-only aliases.

Decision for this ticket:
- Make `name`/`description` first-class optional metadata fields in engine types, validator, compiler, and schema artifacts.
- Keep this ticket engine-only; production YAML/bootstrap fixture population is handled by `SESSMGMT-002`.
- No compatibility aliases. Existing specs without these fields remain valid because fields are optional.

## What to Change

### 1. `packages/engine/src/cnl/game-spec-doc.ts`

Add optional `name` and `description` to `GameSpecMetadata`:

```typescript
export interface GameSpecMetadata {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly maxTriggerDepth?: number;
  readonly defaultScenarioAssetId?: string;
  readonly namedSets?: Readonly<Record<string, readonly string[]>>;
}
```

### 2. `packages/engine/src/cnl/validate-spec-shared.ts`

Update `METADATA_KEYS` to include the new keys so valid metadata no longer emits unknown-key diagnostics:

```typescript
export const METADATA_KEYS = ['id', 'name', 'description', 'players', 'maxTriggerDepth', 'defaultScenarioAssetId', 'namedSets'] as const;
```

### 3. `packages/engine/src/cnl/validate-metadata.ts`

Add explicit optional-string validation for `metadata.name` and `metadata.description` (non-empty trimmed strings when provided), with dedicated diagnostics.

### 4. `packages/engine/src/kernel/types-core.ts`

Add optional `name` and `description` to `GameDef.metadata`:

```typescript
readonly metadata: {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly maxTriggerDepth?: number;
};
```

### 5. `packages/engine/src/kernel/schemas-core.ts`

Add to the metadata schema object:

```typescript
metadata: z
  .object({
    id: StringSchema,
    name: StringSchema.optional(),
    description: StringSchema.optional(),
    players: z.object({ min: NumberSchema, max: NumberSchema }).strict(),
    maxTriggerDepth: NumberSchema.optional(),
  })
  .strict(),
```

### 6. `packages/engine/src/cnl/compiler-core.ts`

Update `runtimeMetadata` construction to pass through the new fields only when present:

```typescript
const runtimeMetadata =
  metadata === null
    ? null
    : {
        id: metadata.id,
        players: metadata.players,
        ...(metadata.maxTriggerDepth === undefined ? {} : { maxTriggerDepth: metadata.maxTriggerDepth }),
        ...(metadata.name === undefined ? {} : { name: metadata.name }),
        ...(metadata.description === undefined ? {} : { description: metadata.description }),
      };
```

### 7. Tests

Add/adjust tests to cover:
- validator acceptance/rejection for `metadata.name` and `metadata.description`
- compile pass-through for both fields
- absence behavior (fields omitted stays omitted)
- schema acceptance of GameDef containing both fields

### 8. Regenerate JSON schema artifacts

Run `pnpm turbo schema:artifacts` and commit updated schema artifacts.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts`
- `packages/engine/src/cnl/validate-spec-shared.ts`
- `packages/engine/src/cnl/validate-metadata.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/src/cnl/compiler-core.ts`
- `packages/engine/test/unit/validate-spec.test.ts`
- `packages/engine/test/integration/compile-pipeline.test.ts`
- `packages/engine/test/unit/schemas-top-level.test.ts` (or equivalent schema test file)
- `packages/engine/schemas/*.json` (regenerated artifacts)

## Out of Scope

- Production game data asset metadata population (`SESSMGMT-002`)
- Runner bootstrap fixture metadata population (`SESSMGMT-002`)
- Runner game-selection UI and session router work (`SESSMGMT-003+`)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` passes with no regressions.
2. `pnpm turbo schema:artifacts` regenerates and updated artifacts are committed.
3. `validateGameSpec` accepts `metadata.name`/`metadata.description` when valid strings and rejects invalid types/blank strings.
4. Compiling a spec with `metadata.name`/`metadata.description` includes both fields in `GameDef.metadata`.
5. Compiling a spec without these fields omits them from `GameDef.metadata` (no alias keys added).

### Invariants

1. `GameSpecMetadata.name` and `.description` are optional strings.
2. `GameDef.metadata.name` and `.description` are optional strings.
3. Metadata validator treats the fields as first-class keys (no unknown-key warnings for valid usage).
4. Zod schema validates both new fields as optional strings and rejects non-string values.
5. Compiler passes new fields through only when present.

## Outcome

- Completion date: 2026-02-20
- What changed:
  - Added optional `name`/`description` to `GameSpecMetadata` and `GameDef.metadata`.
  - Updated metadata validator key whitelist and added explicit validation for invalid `metadata.name`/`metadata.description` values.
  - Passed metadata fields through compiler runtime metadata output only when present.
  - Updated `GameDef` Zod schema and regenerated schema artifacts.
  - Added tests for validator behavior, compiler pass-through/omission behavior, and schema rejection of non-string metadata display fields.
- Deviations from original plan:
  - No material scope expansion; ticket was first corrected to include missing metadata-validator work before implementation.
- Verification:
  - `pnpm turbo schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
