# FITLMECHINF-003 - Stacking Constraint Type and Compile-Time Validation

**Status**: Pending
**Spec**: `specs/25-fitl-game-mechanics-infrastructure.md` (Task 25.2, compile-time half)
**References**: `specs/00-fitl-implementation-order.md` (Milestone B), Decision #5
**Depends on**: None (builds on existing `MapPayload` and `validate-gamedef.ts`)

## Goal

Define the `StackingConstraint` type, add it to `MapPayload`, add Zod schema validation, and implement compile-time stacking validation that checks scenario initial placements against declared constraints during `validateGameSpec`.

## Rationale

Decision #5 requires both compile-time and runtime stacking enforcement. This ticket handles the compile-time half: type definition, schema, and scenario placement validation. Runtime enforcement is FITLMECHINF-004.

## Scope

### Changes

1. **New type `StackingConstraint`** (`src/kernel/types.ts`):
   ```typescript
   interface StackingConstraint {
     readonly id: string;
     readonly description: string;
     readonly spaceFilter: {
       readonly spaceIds?: readonly string[];
       readonly spaceTypes?: readonly string[];
       readonly country?: readonly string[];
       readonly populationEquals?: number;
     };
     readonly pieceFilter: {
       readonly pieceTypeIds?: readonly string[];
       readonly factions?: readonly string[];
     };
     readonly rule: 'maxCount' | 'prohibit';
     readonly maxCount?: number;
   }
   ```

2. **Extend `MapPayload`** (`src/kernel/types.ts`): Add optional `stackingConstraints?: readonly StackingConstraint[]`.

3. **Extend `GameDef`** (`src/kernel/types.ts`): Add optional `stackingConstraints?: readonly StackingConstraint[]` (populated from map payload during compilation).

4. **Add Zod schema** (`src/kernel/schemas.ts`): Validate `StackingConstraint` shape, ensuring `maxCount` is present when `rule === 'maxCount'`.

5. **Compile-time validation** (`src/kernel/validate-gamedef.ts` or `src/cnl/validate-spec.ts`): When stacking constraints are defined and scenario initial placements are available, check each placement against constraints. Emit `error` diagnostics for violations.

6. **Unit tests**: Validate the schema, validate that constraint violations in initial placements produce diagnostics, validate that clean placements pass.

## File List

- `src/kernel/types.ts` — New `StackingConstraint` interface, extend `MapPayload` and `GameDef`
- `src/kernel/schemas.ts` — Zod schema for `StackingConstraint`
- `src/kernel/validate-gamedef.ts` — Compile-time stacking check on initial placements
- `test/unit/validate-gamedef.test.ts` — Stacking constraint validation tests
- `test/unit/schemas-ast.test.ts` or `test/unit/schemas-top-level.test.ts` — Schema validation tests

## Out of Scope

- Runtime stacking enforcement during effect execution (FITLMECHINF-004)
- Derived value computation (FITLMECHINF-002)
- FITL-specific stacking constraint data encoding (that belongs in `data/games/fire-in-the-lake.md`)
- Any changes to `effects.ts`, `apply-move.ts`, or `EffectAST`
- Compiler lowering of stacking constraints from Game Spec YAML

## Acceptance Criteria

### Specific Tests That Must Pass

- `test/unit/schemas-ast.test.ts` (or `schemas-top-level.test.ts`):
  - Valid `StackingConstraint` with `rule: 'maxCount', maxCount: 2` passes schema
  - Valid `StackingConstraint` with `rule: 'prohibit'` passes schema
  - `StackingConstraint` with `rule: 'maxCount'` but missing `maxCount` fails schema
  - Empty `spaceFilter` + empty `pieceFilter` passes (matches all)
- `test/unit/validate-gamedef.test.ts`:
  - Initial placement with 3 bases in a province (maxCount 2) → error diagnostic
  - Initial placement with base on LoC (prohibit) → error diagnostic
  - Initial placement with US piece in North Vietnam (prohibit by faction+country) → error diagnostic
  - Valid initial placement within all constraints → no stacking diagnostics
  - GameDef with no `stackingConstraints` → no stacking diagnostics (backward-compatible)
- `npm run build` passes
- `npm test` passes

### Invariants That Must Remain True

- Existing `GameDef` without `stackingConstraints` validates identically to before (backward-compatible)
- No changes to runtime effect execution paths
- `StackingConstraint` type is game-agnostic — no FITL-specific IDs hardcoded in kernel code
- `MapPayload` remains backward-compatible (new field is optional)
