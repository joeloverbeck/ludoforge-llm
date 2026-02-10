# CORTYPSCHVAL-003 - Build Base Zod Schemas (Selectors, AST Nodes, Primitives)

## Goal
Create recursive Zod schemas for selectors and AST unions, including a documented strictness policy used consistently in later schemas.

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
  - valid example for each `EffectAST` variant parses successfully.
  - invalid effect object with unknown discriminant fails with accurate error path.
  - valid `PlayerSel` examples for all 7 variants parse successfully.
  - invalid `PlayerSel` payload fails (e.g., malformed `{ id: ... }`).
  - strictness behavior test demonstrates unknown-key behavior as documented.

### Invariants That Must Remain True
- Recursive AST schemas parse nested trees without stack/definition errors.
- Enum/literal constraints are enforced for discriminants.
- Strictness policy is explicit and consistently applied across base schemas.
