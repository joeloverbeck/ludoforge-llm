# 62CONPIESOU-001: Add `prioritized` variant to the AST and generic recursive-query infrastructure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel AST types, schema, recursive query infrastructure
**Deps**: None (foundation ticket)

## Problem

The `OptionsQuery` union has no variant for ordered-tier sourcing. Downstream compiler, validation, runtime, and card-authoring tickets need this query kind to exist first in the shared AST contract and in the generic kernel infrastructure that reasons about recursive queries.

## Assumption Reassessment (2026-03-14)

1. `OptionsQuery` union is in `packages/engine/src/kernel/types-ast.ts`. Confirmed.
2. Zod schema for `OptionsQuery` is in `packages/engine/src/kernel/schemas-ast.ts` as a lazy recursive union. Confirmed.
3. `OPTIONS_QUERY_KIND_CONTRACT_MAP` in `packages/engine/src/kernel/query-kind-map.ts` drives the recursive-vs-leaf partition types. `prioritized` must be registered there as `partition: 'recursive'`. Confirmed.
4. Recursive query traversal is centralized in `packages/engine/src/kernel/query-walk.ts`. Any new recursive query kind must be added there or generic helpers such as runtime-shape inference and domain inference become incomplete. Confirmed.
5. `packages/engine/src/kernel/eval-query.ts` is also exhaustive over `OptionsQuery`. A new first-class query kind must be evaluated there at least to the extent needed to keep the AST executable. Confirmed by build failure after adding the new union member.
6. `packages/engine/src/kernel/validate-queries.ts`, `packages/engine/src/kernel/zone-selector-aliases.ts`, `packages/engine/src/kernel/ast-to-display.ts`, and `packages/engine/test/unit/types-exhaustive.test.ts` all switch exhaustively or serve as generic query infrastructure. They must be updated in the same ticket. Confirmed.
7. `packages/engine/src/cnl/compile-conditions-shared.ts` lists author-facing compiler query kinds, but adding `prioritized` there in this ticket would falsely advertise YAML support before ticket 002 lands. This ticket must not change compiler-facing lowering/registration.
8. `packages/engine/src/kernel/ast-builders.ts` does not contain `OptionsQuery` builder helpers today. No change needed there.

## Architecture Check

1. The clean boundary for this ticket is: introduce the new AST variant and make all generic recursive-query infrastructure understand it. Do not partially register it in the compiler before the lowering ticket exists.
2. `prioritized` should be treated as a first-class recursive query alongside `concat` and `nextInOrderByCondition`, not as a one-off special case buried only in one subsystem.
3. `qualifierKey` remains an optional plain string. That preserves a generic IR and keeps game-specific semantics in authored data.
4. Baseline generic runtime/validation support belongs here: `evalQuery` should concatenate tiers in order, and query validation should recurse into tiers and preserve the same runtime-shape homogeneity rule as `concat`. Qualifier-specific diagnostics still belong in later tickets.
5. No backwards-compatibility shims or aliases are needed.

## What to Change

### 1. Add `prioritized` variant to `OptionsQuery` type union

In `types-ast.ts`, add to the union:

```typescript
| {
    readonly query: 'prioritized';
    readonly tiers: readonly [OptionsQuery, ...OptionsQuery[]];
    readonly qualifierKey?: string;
  }
```

### 2. Add Zod schema variant

In `schemas-ast.ts`, add to `optionsQuerySchemaInternal` union:

```typescript
z.object({
  query: z.literal('prioritized'),
  tiers: z.array(OptionsQuerySchema).min(1),
  qualifierKey: StringSchema.optional(),
}).strict(),
```

### 3. Register in OPTIONS_QUERY_KIND_CONTRACT_MAP

In `query-kind-map.ts`, add:

```typescript
prioritized: { partition: 'recursive' },
```

### 4. Update generic recursive query walkers and exhaustive query helpers

Update the kernel utilities that must stay exhaustive over `OptionsQuery`:

- `query-walk.ts` must recurse through `tiers`
- `eval-query.ts` must evaluate `prioritized` as ordered concatenation with the same shape-homogeneity contract as `concat`
- `validate-queries.ts` must recurse into `tiers` and enforce the same shape-homogeneity rule for a single recursive query
- `zone-selector-aliases.ts` must recurse through `tiers` and preserve existing alias collection behavior
- `ast-to-display.ts` must render `prioritized(...)`
- `types-exhaustive.test.ts` and other relevant unit tests must be updated to the new recursive/leaf variant counts

### 5. Add or update tests for the new recursive query variant

Build-only coverage is not sufficient here. This ticket should add focused tests that prove:

- the schema accepts and rejects `prioritized` appropriately
- recursive query walking includes `prioritized` tiers in the same left-to-right order as other recursive queries
- zone-selector alias collection still sees aliases nested under `prioritized` tiers
- recursive/leaf partition counts and exhaustiveness checks remain aligned

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/query-kind-map.ts` (modify)
- `packages/engine/src/kernel/query-walk.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/validate-queries.ts` (modify)
- `packages/engine/src/kernel/zone-selector-aliases.ts` (modify)
- `packages/engine/src/kernel/ast-to-display.ts` (modify — if display case needed)
- `packages/engine/schemas/GameDef.schema.json` (regenerate)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-walk.test.ts` (modify)
- `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-kind-contract.test.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime evaluation logic (ticket 004)
- Compiler lowering from YAML (ticket 002)
- Validation diagnostics (ticket 003)
- Tier-aware legality (ticket 005)
- Compiler-facing `SUPPORTED_QUERY_KINDS` registration before lowering exists
- Card 87 YAML changes (ticket 008)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds — no type errors from the new union member
2. `pnpm turbo typecheck` succeeds
3. Targeted engine tests covering schema/query-walk/query-kind exhaustiveness pass
4. Targeted `eval-query` coverage for ordered tier concatenation and shape mismatches passes
5. Existing engine suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. The `OptionsQuery` union remains a discriminated union on `query` field
2. Zod schema and TypeScript type stay in sync — every TS variant has a matching Zod member
3. Generic recursive query helpers (`query-walk`, `eval-query`, validation, partition types, display/exhaustiveness helpers) remain aligned with the union
4. This ticket does not claim author-facing compiler support before ticket 002 implements lowering
5. No FITL-specific identifiers appear in any touched file

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — add `prioritized` schema success/failure coverage
2. `packages/engine/test/unit/eval-query.test.ts` — add ordered concatenation and shape-mismatch coverage for `prioritized`
3. `packages/engine/test/unit/kernel/query-walk.test.ts` — add traversal coverage for `prioritized`
4. `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` — add alias-collection coverage through `prioritized` tiers
5. `packages/engine/test/unit/kernel/query-kind-contract.test.ts` — update recursive query compile-time coverage
6. `packages/engine/test/unit/types-exhaustive.test.ts` — update variant/kind counts and exhaustiveness expectations
7. `packages/engine/test/unit/validate-gamedef.test.ts` — add baseline validation coverage for empty-tier and mixed-shape `prioritized` queries

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Added `prioritized` to the shared `OptionsQuery` AST and Zod schema.
  - Registered it as a recursive query kind in the query-kind contract map.
  - Extended generic recursive-query infrastructure to understand it: query walking, alias collection, display rendering, baseline validation, and baseline evaluation.
  - Regenerated engine JSON schema artifacts so the checked-in contracts match the new AST/schema surface.
  - Added focused test coverage for schema parsing, recursive traversal, alias collection, query-kind partitioning, baseline evaluation, and baseline `GameDef` validation.
- Deviations from original plan:
  - Did not add compiler-facing `SUPPORTED_QUERY_KINDS` registration in this ticket, because that would have advertised YAML lowering support before ticket 002.
  - Did not touch `ast-builders.ts`; the file does not own `OptionsQuery` helpers.
  - Pulled `eval-query.ts`, `validate-queries.ts`, regenerated schema artifacts, and validation/eval tests into scope because the codebase treats `OptionsQuery` as an executable/validated contract, not a type-only union.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/schemas-ast.test.js packages/engine/dist/test/unit/eval-query.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/query-walk.test.js packages/engine/dist/test/unit/kernel/zone-selector-aliases.test.js packages/engine/dist/test/unit/kernel/query-kind-contract.test.js packages/engine/dist/test/unit/types-exhaustive.test.js packages/engine/dist/test/unit/validate-gamedef.test.js`
  - `pnpm turbo typecheck --filter=@ludoforge/engine`
  - `pnpm turbo lint --filter=@ludoforge/engine`
  - `pnpm -F @ludoforge/engine test`
