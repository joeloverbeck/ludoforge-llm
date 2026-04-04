# Action Tooltip Plan — Iteration 3

**Date**: 2026-04-04
**Based on**: EVALUATION #2 (average score: 3.4)
**Problems targeted**: CRITICAL #1 (filter predicates as raw text), CRITICAL #2 (raw $variable references and arithmetic)

## Context

Evaluation #2 improved from 3.0 to 3.4 after fixing magic numbers, step headers, and kebab-case IDs. The two remaining CRITICALs — filter predicates and $variable references — are the last major engine-layer data quality blockers, both recurring for 2 consecutive evaluations. These jointly affect Language Naturalness (currently 3/10) and Terminology Consistency (3/10). Fixing both should push the average toward 4.5-5.0, moving out of the "unusable" range. Both CRITICALs are addressed this iteration because they share a common fix pattern (post-realization text cleanup) and can be implemented independently.

## Deferred Items

| Item | First recommended | Deferred since | Target iteration |
|------|-------------------|---------------|-----------------|
| Humanized capability IDs still semantically meaningless (HIGH #3) | Eval #2 | Iteration 3 | Iteration 4 |
| Step headers still repetitive within same target type (HIGH #4) | Eval #2 | Iteration 3 | Iteration 4 |
| Visual hierarchy via CSS (MEDIUM #5) | Eval #1 | Iteration 2 | no target yet |
| Progressive disclosure for long tooltips (MEDIUM #6) | Eval #1 | Iteration 2 | no target yet |
| Cost transparency improvements (MEDIUM #7) | Eval #1 | Iteration 2 | no target yet |
| Optional/mandatory distinction (LOW #9) | Eval #1 | Iteration 2 | no target yet |

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Always relevant | All fixes are game-agnostic — pattern-based text humanization uses no game-specific constants. Label resolution via VerbalizationDef handles game-specific terms. |
| #3 Visual Separation | Always relevant | No runner/presentation changes this iteration — all fixes are in the engine tooltip pipeline |
| #5 One Rules Protocol | Not relevant | RuleCard interface unchanged — only the text content of existing string fields changes |
| #10 Architectural Completeness | Always relevant | Each fix addresses root cause: normalizer pre-stringifies values without label context, token filter stringifier uses raw operator syntax |
| #14 No Backwards Compat | Not relevant | No interface changes — behavioral changes in text generation only |

## Layer Triage

| Problem | Layer | Reasoning |
|---------|-------|-----------|
| Filter predicates ("Faction eq us and type in troops, police") | Engine | Data quality: `stringifyTokenFilter()` in `tooltip-value-stringifier.ts` produces raw operator syntax ("eq", "in") instead of natural language. Token query normalization in `tooltip-normalizer-compound.ts` stores only the pre-stringified filter, unlike space queries which store `conditionAST` for humanization. |
| $variable references ("$cube", "$transferAmount * -1") | Engine | Data quality: normalizer pre-stringifies values via `stringifyValueExpr()` / `stringifyNumericExpr()` into `msg.value`, `msg.amountExpr`, `msg.deltaExpr`. These contain raw binding names ($-prefixed) and arithmetic expressions. The humanized alternative `humanizeValueExpr()` exists but requires `LabelContext` which is only available in the realizer. |

## Current Code Architecture (reference for implementer)

### Filter predicate flow

1. **Normalizer** (`tooltip-normalizer-compound.ts` ~line 68-95): Token queries call `stringifyTokenFilter(filter)` which produces `"Faction eq us and type in troops, police"`
2. **Stringifier** (`tooltip-value-stringifier.ts` ~line 157-167): `stringifyTokenFilter()` concatenates `field`, `op`, and `value` as raw strings. Operators are raw: "eq", "in", "not", "and", "or"
3. **Realizer** (`tooltip-template-realizer.ts` ~line 61-67): `resolveSelectFilter()` checks `msg.conditionAST` first (returns humanized), falls back to `resolveLabel(msg.filter)` which does label resolution but doesn't fix operator syntax
4. Space queries provide `conditionAST` → humanizer produces "is" instead of "eq". Token queries don't provide `conditionAST` → raw "eq" syntax leaks through.

### $variable reference flow

1. **Normalizer** (`tooltip-normalizer.ts` ~line 108-134): Calls `stringifyValueExpr(value)` or `stringifyNumericExpr(delta)` to pre-stringify values into strings. Binding refs become "$varName". Arithmetic becomes "$a * -1".
2. **IR types** (`tooltip-ir.ts`): `SetMessage.value: string`, `TransferMessage.amountExpr?: string`, `ShiftMessage.deltaExpr?: string` — all pre-stringified
3. **Realizer** (`tooltip-template-realizer.ts`): Emits `msg.value`, `msg.amountExpr`, `msg.deltaExpr` directly into output text
4. **Alternative**: `humanizeValueExpr(expr, ctx)` in `tooltip-value-stringifier.ts` resolves labels and humanizes identifiers, but requires `LabelContext` + raw `ValueExpr` AST — neither available when the realizer processes pre-stringified strings

### Existing humanization infrastructure

- `humanizeIdentifier()` (tooltip-humanizer.ts): Splits camelCase/kebab-case, strips "$" prefix, title-cases. "$transferAmount" → "Transfer Amount"
- `humanizeValueExpr()` (tooltip-value-stringifier.ts): Full label-aware humanization of ValueExpr AST. Handles all 12 ref types, arithmetic, arrays.
- `humanizeConditionWithLabels()` (tooltip-modifier-humanizer.ts): Humanizes ConditionAST with label resolution. Produces "is" instead of "eq".
- `humanizeKebabTokens()` (tooltip-template-realizer.ts): Post-realization regex pass for kebab-case tokens (added in iteration 2).

## Problem 1: Filter predicates displayed as raw text

**Evaluation score**: Language Naturalness = 3/10, Terminology Consistency = 3/10
**Root cause**: Token query filters are pre-stringified by `stringifyTokenFilter()` using raw operator syntax ("eq", "in") before reaching the realizer. Unlike space queries, token queries don't store the raw AST for humanization.
**Layer**: Engine

### Approaches Considered

1. **Store `TokenFilterExpr` AST on SelectMessage, humanize in realizer**: Add optional `tokenFilterAST` field to `SelectMessage`. In normalizer-compound, store the raw AST alongside the stringified filter. In the realizer, write a `humanizeTokenFilter()` function that produces natural language from the AST.
   - Feasibility: LOW — changes the IR interface, requires updating all SelectMessage constructors across the normalizer, and requires writing a new humanization function for TokenFilterExpr (different type from ConditionAST)
   - Readability impact: HIGH — produces fully context-aware humanized text
   - Risk: HIGH — IR interface change affects many files and tests; TokenFilterExpr humanization is non-trivial
   - Foundation alignment: F#14 concern — IR interface change requires updating all consumers

2. **Humanize `stringifyTokenFilter()` output directly**: Modify `stringifyTokenFilter()` to produce human-readable text instead of raw syntax. Change operators: "eq" → "is", "!=" → "is not". Humanize field names and values via `humanizeIdentifier()`.
   - Feasibility: HIGH — localized change in one function (`stringifyTokenFilter` in tooltip-value-stringifier.ts)
   - Readability impact: MEDIUM-HIGH — "Faction is US and type in Troops, Police" is much better than "Faction eq us and type in troops, police", though not as good as full label-resolved text
   - Risk: LOW — `stringifyTokenFilter` is only used in tooltip context, not in game logic
   - Foundation alignment: Game-agnostic (operator humanization is universal)

3. **Post-realization regex cleanup of filter syntax**: Add a cleanup pass in the realizer (like `humanizeKebabTokens`) that replaces "eq" → "is", "in" → "includes", and humanizes field/value identifiers in the realized text.
   - Feasibility: HIGH — extends the existing post-realization pattern
   - Readability impact: MEDIUM — regex-based replacement is fragile for complex expressions but handles the common cases
   - Risk: MEDIUM — could over-replace "eq" or "in" in non-filter contexts; needs careful word-boundary matching

### Recommendation: Approach 2 (humanize `stringifyTokenFilter()` directly)

**Why**: This is the source-level fix — the function exists specifically for tooltip rendering. It's localized (one function), low risk (no interface changes), and produces good output. The deviation from the Layer Decision Framework's suggested fix location (realizer) is justified because `stringifyTokenFilter()` is the actual source of raw syntax — fixing it at the source is more complete than regex post-processing in the realizer. The function can use `humanizeIdentifier()` for field names and values without needing `LabelContext` (which it doesn't have). Approach 1 is better in theory but too risky for one iteration.

## Problem 2: Raw $variable references and arithmetic expressions

**Evaluation score**: Language Naturalness = 3/10
**Root cause**: The normalizer pre-stringifies `ValueExpr` ASTs via `stringifyValueExpr()` / `stringifyNumericExpr()` into strings stored on messages (`msg.value`, `msg.amountExpr`, `msg.deltaExpr`). These include raw "$varName" binding references and arithmetic like "$transferAmount * -1". The realizer emits these strings directly.
**Layer**: Engine

### Approaches Considered

1. **Store raw `ValueExpr` AST on messages, humanize in realizer**: Add optional `valueAST`, `amountAST`, `deltaAST` fields to `SetMessage`, `TransferMessage`, `ShiftMessage`. Normalizer stores raw AST alongside strings. Realizer calls `humanizeValueExpr(ast, ctx)` when AST is available.
   - Feasibility: LOW-MEDIUM — changes 3 IR interfaces, requires updating normalizer emission sites, realizer consumption sites, and all test fixtures that construct these message types
   - Readability impact: HIGH — `humanizeValueExpr` produces fully label-resolved text
   - Risk: HIGH — IR interface changes affect many files
   - Foundation alignment: F#14 concern — interface changes

2. **Post-realization cleanup of $variable patterns**: Add to the existing post-realization pass in `realizeStep()` a regex that detects `$varName` patterns and humanizes them via `humanizeIdentifier()`. Also detect arithmetic expressions and simplify them.
   - Feasibility: HIGH — extends existing `humanizeKebabTokens` pattern
   - Readability impact: MEDIUM — "$transferAmount" → "Transfer Amount" (good), "$pacLevels * -4 or -3" → "Pac Levels * -4 or -3" (arithmetic still visible but variable name is readable)
   - Risk: LOW — regex with word boundaries is safe; only matches $-prefixed identifiers
   - Foundation alignment: Game-agnostic

3. **Suppress lines containing only internal computations**: When a realized line contains only `$variables` and arithmetic (e.g., "Set ARVN Resources to $pacLevels * -4 or -3"), suppress the entire line as it conveys internal computation details that don't help the player.
   - Feasibility: HIGH — pattern match and filter
   - Readability impact: MEDIUM — removes confusing content but also removes information about what changes
   - Risk: MEDIUM — may suppress lines that contain useful information alongside variables

### Recommendation: Approach 2 (post-realization $variable cleanup)

**Why**: Extends the proven post-realization pattern from iteration 2 (kebab-case humanization). Low risk, high feasibility, and produces meaningful improvement — "$transferAmount" → "Transfer Amount" makes the text readable even if the arithmetic context remains. The more ambitious Approach 1 (AST storage) can be done in a future iteration if the regex approach proves insufficient. Approach 3 is too aggressive — it removes information the player might need.

## Implementation Steps

1. **Humanize `stringifyTokenFilter()` to produce readable text** — **Layer**: Engine — **File**: `packages/engine/src/kernel/tooltip-value-stringifier.ts` — **Depends on**: none
   - In `stringifyTokenFilter()`: replace raw operators with natural language: "eq" → "is", "!=" → "is not", keep "in" as "in" (already natural), "and" → "and", "or" → "or", "not" → "not"
   - Humanize field names via `humanizeIdentifier()`: "faction" → "Faction", "type" → "Type"
   - Humanize predicate values via `humanizeIdentifier()`: "us" → "US" (with acronym detection), "troops" → "Troops"
   - Import `humanizeIdentifier` and `buildAcronymSet` from `tooltip-humanizer.ts`

2. **Add $variable humanization to post-realization pass** — **Layer**: Engine — **File**: `packages/engine/src/kernel/tooltip-template-realizer.ts` — **Depends on**: none
   - Add a `humanizeDollarVars()` function using regex `/\$([a-zA-Z_]\w*)/g` that captures binding names and humanizes them via `humanizeIdentifier()`
   - Call it in the existing post-realization pass in `realizeStep()` alongside `humanizeKebabTokens()`
   - Compose: `humanizeKebabTokens(humanizeDollarVars(raw))`

3. **Update unit tests for `stringifyTokenFilter()`** — **Layer**: Engine — **File**: `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` — **Depends on**: Step 1
   - Update golden assertions for `stringifyTokenFilter` to expect humanized operator syntax and cased field names

4. **Update integration tests** — **Layer**: Engine — **Files**: `packages/engine/test/integration/tooltip-pipeline-integration.test.ts`, `tooltip-cross-game-properties.test.ts` — **Depends on**: Steps 1, 2
   - Update end-to-end golden assertions that match on filter text or $variable output

5. **Update realizer tests for $variable cleanup** — **Layer**: Engine — **File**: `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — **Depends on**: Step 2
   - Add test cases for $variable humanization in realized lines

## Verification

1. `pnpm turbo typecheck` — must pass (both packages)
2. `pnpm -F @ludoforge/engine test` — must pass
3. `pnpm -F @ludoforge/runner test` — must pass
4. Visual check: run `pnpm -F @ludoforge/runner dev`, hover over each action button, verify:
   - No "Faction eq us" filter syntax — should show "Faction is US" or similar
   - No "$cube", "$troop", "$transferAmount" — should show "Cube", "Troop", "Transfer Amount"
   - Arithmetic expressions like "$pacLevels * -4 or -3" should show "Pac Levels * -4 or -3"

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `stringifyTokenFilter` humanization breaks non-tooltip consumers | LOW | Other code paths use raw filter strings | Verify `stringifyTokenFilter` is only used in tooltip context (grep for callers); the function is in `tooltip-value-stringifier.ts` which is tooltip-scoped |
| $variable regex over-matches legitimate text containing "$" | LOW | Non-variable text gets mangled | Use strict regex: `$` followed by `[a-zA-Z_]` and `\w*` — matches programming-style identifiers only |
| Humanized filter operators produce awkward phrasing for complex conditions | MEDIUM | "Type in Troops, Police" vs "Type includes Troops or Police" | Start with simple operator mapping; complex phrasing improvements can be iterated |
| Integration test churn | HIGH | Many golden assertions need updating | Pre-flight grep for affected patterns in test files |

## Implementation Verification Checklist

- [ ] `tooltip-value-stringifier.ts`: `stringifyTokenFilter()` uses "is" instead of "eq" for equality
- [ ] `tooltip-value-stringifier.ts`: `stringifyTokenFilter()` humanizes field names (e.g., "faction" → "Faction")
- [ ] `tooltip-value-stringifier.ts`: `stringifyTokenFilter()` humanizes predicate values
- [ ] `tooltip-template-realizer.ts`: Post-realization pass humanizes `$varName` patterns
- [ ] `tooltip-template-realizer.ts`: `$cube` → "Cube", `$transferAmount` → "Transfer Amount" in output
- [ ] All engine unit tests pass
- [ ] All engine integration tests pass

## Test Impact

- `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` — `stringifyTokenFilter` assertions
- `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — realized text containing filter syntax or $variables
- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — end-to-end golden assertions
- `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` — cross-game assertions
- `packages/engine/test/unit/tooltip-humanization.test.ts` — may need new cases

## Research Sources

- No external research needed — all solutions extend existing codebase patterns (`humanizeIdentifier`, `humanizeKebabTokens` post-realization pass)
