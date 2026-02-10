# CORTYPSCHVAL-003 - Build Base Zod Schemas (Selectors, AST Nodes, Primitives)

**Status**: ✅ COMPLETED

## Goal
Create recursive Zod schemas for selectors and AST unions, including a documented strictness policy used consistently in later schemas.

## Assumptions Reassessed (2026-02-10)
- `src/kernel/schemas.ts` does not exist yet and must be created.
- `src/kernel/index.ts` currently does not export any schema API and must be updated.
- `test/unit/schemas-ast.test.ts` does not exist yet and must be created.
- `src/kernel/types.ts` already defines selector/AST types; this ticket should align schema variants to those exact runtime types.
- `EffectAST` currently has 14 concrete variants in `src/kernel/types.ts` and in Spec 02 enumerations; acceptance must cover all 14.
- Existing test baseline is `smoke.test.ts`, `types-foundation.test.ts`, and `types-exhaustive.test.ts`; this ticket must keep them passing.

## Updated Scope
- Create `src/kernel/schemas.ts` with base selector/AST/primitives schemas only.
- Export new schema symbols via `src/kernel/index.ts`.
- Add `test/unit/schemas-ast.test.ts` covering selector variants, effect variants, invalid discriminants, and strictness behavior.
- Explicitly choose and document strictness behavior for object-based selector/AST schemas.
- Keep this ticket limited to base schemas reused by later top-level schema tickets.

## File List Expected To Touch
- `src/kernel/schemas.ts`
- `src/kernel/index.ts`
- `test/unit/schemas-ast.test.ts`

## Implementation Notes
- Add base scalar schemas and enum/literal schemas.
- Implement recursive schemas for `ConditionAST`, `ValueExpr`, `Reference`, `EffectAST`, `OptionsQuery`.
- Implement selector schemas for `PlayerSel`, `ZoneSel`, `TokenSel`.
- Decide and document strictness policy (`.strict()` vs passthrough), then apply consistently.
- Export these schemas for reuse by `GameDefSchema` and other top-level schemas.

## Out Of Scope
- Full `GameDefSchema`, `GameStateSchema`, `GameTraceSchema`, `EvalReportSchema`.
- JSON schema files.
- Semantic validation (`validateGameDef`).
- Serialization codecs.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/schemas-ast.test.ts`:
  - valid example for each `EffectAST` variant parses successfully (14 variants).
  - invalid effect object with unknown discriminant fails with accurate error path.
  - valid `PlayerSel` examples for all 7 variants parse successfully.
  - invalid `PlayerSel` payload fails (e.g., malformed `{ id: ... }`).
  - strictness behavior test demonstrates unknown-key behavior as documented.

### Invariants That Must Remain True
- Recursive AST schemas parse nested trees without stack/definition errors.
- Enum/literal constraints are enforced for discriminants.
- Strictness policy is explicit and consistently applied across base schemas.

## Outcome
- Completion date: 2026-02-10
- What actually changed:
  - Added `src/kernel/schemas.ts` with scalar primitives and recursive selector/AST schemas: `PlayerSelSchema`, `ZoneSelSchema`, `TokenSelSchema`, `ReferenceSchema`, `ValueExprSchema`, `ConditionASTSchema`, `OptionsQuerySchema`, and `EffectASTSchema`.
  - Chose and documented strictness policy as `OBJECT_STRICTNESS_POLICY = 'strict'` and applied `.strict()` to object-based selector/AST nodes.
  - Updated `src/kernel/index.ts` to export schema symbols.
  - Added `test/unit/schemas-ast.test.ts` covering all `PlayerSel` variants, all 14 `EffectAST` variants, invalid discriminant-path behavior, and strict unknown-key rejection.
- Deviations from original plan:
  - `EffectAST` count was corrected from 13 to 14 to match `src/kernel/types.ts` and Spec 02 enumerations.
  - Schema constants are exported with inferred Zod types instead of explicit `ZodType<...>` annotations to satisfy current strict TypeScript settings with `exactOptionalPropertyTypes`.
- Verification:
  - `npm test` passed (build + unit/integration test run), including the new `dist/test/unit/schemas-ast.test.js`.
