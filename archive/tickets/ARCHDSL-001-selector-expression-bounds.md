# ARCHDSL-001 - Expression Bounds for Selectors (`chooseN.min/max`)

**Status**: ✅ COMPLETED  
**Priority**: High  
**Depends on**: None

## Reassessed assumptions (2026-02-14)

The original ticket assumptions do not fully match the current codebase.

Discrepancies found:

- The runtime selector path is `src/kernel/legal-choices.ts`, not `src/kernel/eval-selectors.ts`.
- Enforcement also exists in `src/kernel/effects-choice.ts` and `src/kernel/validate-gamedef-behavior.ts`; these were missing from scope.
- GameDef schema path is `schemas/GameDef.schema.json` (capital `G`/`D`), not `schemas/gamedef.schema.json`.
- The listed unit tests are stale:
  - `test/unit/compile-selectors.test.ts` currently tests selector normalization, not chooseN cardinality lowering.
  - chooseN lowering tests currently live in `test/unit/compile-effects.test.ts`.
  - runtime cardinality behavior is primarily covered by `test/unit/kernel/legal-choices.test.ts` and `test/unit/effects-choice.test.ts`.
- Production FITL already uses expression-capable bounds in some places (`max: { param: maxSpaces }`), so this ticket is specifically about closing the gap for `chooseN` effect cardinality in AST/compiler/runtime validation and removing duplicated branches that only differ by literal bounds.

## 1) What needs to change / be added

Add first-class expression support for selector cardinality bounds so GameSpecDoc authors can set dynamic limits without branch duplication.

### Required implementation changes

- Extend AST/types so `chooseN.min` and `chooseN.max` accept `ValueExpr` (not only numeric literals). Keep `n` as literal integer exact-cardinality mode.
- Update schema validators for AST + GameDef JSON schema to allow expression-valued selector bounds.
- Update compiler lowering to preserve/validate expression bounds and keep deterministic diagnostics for invalid declarations.
- Update runtime selector resolution (`legal-choices`) and effect execution (`effects-choice`) to evaluate expression bounds at decision/application time.
- Update behavioral validation (`validate-gamedef-behavior`) to validate ValueExpr bounds structurally and retain static guardrails when literals are provided.
- Enforce runtime safety:
  - evaluated bounds must be finite integers
  - `min >= 0`
  - `max >= min`
  - fail with deterministic diagnostic/error metadata when violated
- Remove temporary branch duplication patterns in production specs where only selector bound differs by condition (initial target: FITL Air Strike `select-spaces` Wild Weasels branch in `data/games/fire-in-the-lake.md`).

### Architectural intent check

Why this is better than current architecture:

- Removes branch duplication where selector filters are identical and only bounds differ.
- Keeps engine generic and data-driven by expressing cardinality logic in `ValueExpr` rather than control-flow duplication.
- Centralizes cardinality semantics in one canonical `chooseN` contract across lowering, validation, legal choice discovery, and effect application.
- Improves extensibility for future constraints (for example computed cap per action class/capability) without adding game-specific branches.

### Expected files to touch (minimum)

- `src/kernel/types-ast.ts`
- `src/kernel/schemas-ast.ts`
- `src/cnl/compile-effects.ts`
- `src/kernel/legal-choices.ts`
- `src/kernel/effects-choice.ts`
- `src/kernel/validate-gamedef-behavior.ts`
- `schemas/GameDef.schema.json`
- `data/games/fire-in-the-lake.md` (cleanup duplicated `chooseN` branches where applicable)

## 2) Invariants that should pass

- Engine/runtime remain game-agnostic; no FITL-specific conditionals in kernel/compiler.
- Existing literal numeric bounds continue to behave identically.
- Dynamic bounds are deterministic for a fixed seed/state.
- Invalid evaluated bounds fail fast with explicit diagnostics (no silent coercion).
- No backward-compat aliases/path shims; canonical bound contract is expression-capable.

## 3) Tests that should pass

### New/updated unit tests

- `test/unit/compile-effects.test.ts`
  - lowers `chooseN` range bounds for literals and expressions.
  - rejects invalid `n` + range mixes and malformed bound expressions.
- `test/unit/schemas-ast.test.ts`
  - accepts expression-valued `chooseN.min/max` bounds.
- `test/unit/kernel/legal-choices.test.ts`
  - legal choice discovery evaluates dynamic min/max and enforces guardrails.
- `test/unit/effects-choice.test.ts`
  - effect application evaluates dynamic min/max and enforces guardrails.
- `test/unit/validate-gamedef.test.ts`
  - behavior diagnostics for malformed/contradictory `chooseN` declarations remain deterministic.

### New/updated integration tests

- `test/integration/fitl-momentum-formula-mods.test.ts`
  - Air Strike Wild Weasels selector uses expression bounds (not duplicated `if` branches) and behavior is unchanged.
- Optional golden/regression snapshot update if selector AST shape changes.

### Full-suite gates

- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- **Completion date**: 2026-02-14
- **What actually changed**:
  - Implemented expression-capable `chooseN.min/max` in AST/types and AST schema.
  - Updated compiler lowering to accept and lower `ValueExpr` bounds while preserving deterministic diagnostics for invalid literal declarations.
  - Updated runtime decision discovery and effect execution to evaluate `chooseN` bounds at runtime with strict guardrails (`safe integer`, `min >= 0`, `max >= min`).
  - Updated behavioral GameDef validation to validate expression bounds structurally and keep literal-only static checks.
  - Updated `schemas/GameDef.schema.json` for expression-valued `chooseN.min/max`.
  - Refactored FITL `air-strike-profile` `select-spaces` stage to a single `chooseN` with expression-valued `max`, removing duplicated branch blocks that only differed by bound.
  - Added/updated unit and integration tests for expression bounds and guardrails.
- **Deviations from original plan**:
  - Runtime enforcement updates required touching both `legal-choices` and `effects-choice` (broader than the original ticket wording).
  - Existing test ownership in the repo differed from initial assumptions (`compile-effects` / `kernel/legal-choices` / `effects-choice` were the correct loci).
- **Verification results**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed (all unit + integration tests).
