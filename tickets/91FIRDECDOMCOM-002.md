# 91FIRDECDOMCOM-002: Domain check compilation (patterns 1-5)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — extends `first-decision-compiler.ts`
**Deps**: 91FIRDECDOMCOM-001 (walker + types)

## Problem

With the effect-tree walker in place (001), we need to compile the found
`FirstDecisionNode` into a fast closure that directly queries game state
for the first decision's option domain — bypassing the AST interpreter
entirely. The spec defines 5 compilable patterns; actions not matching any
pattern fall through to the interpreter.

## Assumption Reassessment (2026-03-28)

1. `OptionsQuery` on `chooseOne`/`chooseN` nodes describes the domain
   source (token query, zone query, enum list, int range). Confirmed in
   `types-ast.ts` — the `options` field on choice nodes carries the query.
2. `tryCompileCondition` from `condition-compiler.ts` (Spec 90) compiles
   `ConditionAST → CompiledConditionPredicate | null`. Guard conditions
   preceding the first decision can be composed via this.
3. Token queries are resolved by `resolveTokenQuery` or equivalent in the
   kernel. Zone queries by `resolveZoneQuery`. These existing functions
   will be called by the compiled closures.
4. `ChoiceOption` has shape `{ value, legality, illegalReason, resolution? }`.
   For single-decision bypass, the compiled domain must produce full
   `ChoiceOption[]` matching interpreter output.
5. `insideForEach` flag from 001 indicates Pattern 3 (forEach + nested
   decision). The forEach collection query determines iteration elements.

## Architecture Check

1. The compiler is a pure function `FirstDecisionNode → FirstDecisionDomainResult`.
   Each pattern is a separate matcher function, tried in order. Clean
   separation of concerns — adding a new pattern is adding a new matcher.
2. Compiled closures call existing kernel query functions (`resolveTokenQuery`,
   zone enumeration, etc.) — no duplication of query logic. Aligns with DRY.
3. F1 (agnosticism): patterns match structural EffectAST shapes, not
   game-specific identifiers. F5 (determinism): closures are pure functions
   of `(state, activePlayer)`. F7 (immutability): closures are read-only.

## What to Change

### 1. Add `compileFirstDecisionDomain` to `first-decision-compiler.ts`

```typescript
function compileFirstDecisionDomain(
  def: GameDef,
  actionEffects: readonly EffectAST[],
): FirstDecisionDomainResult
```

Internally:
1. Call `findFirstDecisionNode(actionEffects)`.
2. If `null`, return `{ compilable: false }` (no decisions — action is
   always admissible, but this is not this function's concern).
3. Call `countDecisionNodes(actionEffects)` to determine `isSingleDecision`.
4. Try pattern matchers in order:
   - **Pattern 5** (enum/range — always non-empty): check first.
   - **Pattern 1** (direct token query domain).
   - **Pattern 4** (zone query domain).
   - **Pattern 2** (guard condition + token/zone query).
   - **Pattern 3** (forEach iteration + nested decision).
5. If no pattern matches, return `{ compilable: false }`.

### 2. Implement pattern matchers

Each matcher receives a `FirstDecisionNode` and the `GameDef`, and returns
a `FirstDecisionDomainResult` or `null` (no match).

**Pattern 5 — Enum/range (always non-empty)**:
- Match: `options.query === 'enums'` or (`options.query === 'intsInRange'`
  with literal bounds where max >= min).
- Compiled check: `() => ({ admissible: true })`.
- No guard conditions needed (domain is static and non-empty).

**Pattern 1 — Direct token query**:
- Match: `options.query === 'tokensInZone'` (or equivalent token query)
  AND `guardConditions.length === 0` AND `!insideForEach`.
- Compiled check: resolve the token query against state, return
  `{ admissible: results.length > 0 }`.
- For single-decision: also return `domain` as `ChoiceOption[]`.

**Pattern 4 — Zone query**:
- Match: `options.query === 'zones'` or `'mapSpaces'` AND no guards AND
  `!insideForEach`.
- Compiled check: resolve zone query with filters, return admissible.

**Pattern 2 — Guard condition + query**:
- Match: `guardConditions.length > 0` AND all guards compilable via
  `tryCompileCondition` AND inner query matches Pattern 1 or 4.
- Compiled check: evaluate compiled guards AND query check.

**Pattern 3 — forEach + nested decision**:
- Match: `insideForEach === true` AND the forEach collection query is
  resolvable AND the nested decision matches Pattern 1 or 4.
- Compiled check: iterate collection elements, return admissible if ANY
  element produces a non-empty domain.

### 3. Add `compileActionFirstDecision` — pipeline-aware wrapper

For pipeline actions, walk `stages[0].effects → stages[1].effects → ...`
to find the first decision across stages. Compose with stage predicates
(Spec 90 compiled conditions) if available.

For plain actions, call `compileFirstDecisionDomain(def, action.effects)`
directly.

## Files to Touch

- `packages/engine/src/kernel/first-decision-compiler.ts` (modify — add compilation)
- `packages/engine/test/unit/kernel/first-decision-compiler.test.ts` (new)

## Out of Scope

- Cache infrastructure — that is 91FIRDECDOMCOM-003.
- Integration into `legal-moves.ts` — that is 91FIRDECDOMCOM-003.
- Event card effect compilation (explicitly excluded per spec).
- Adding new query resolution functions to the kernel. The compiled
  closures must use EXISTING kernel query functions only.
- Modifying `condition-compiler.ts` or `compiled-condition-cache.ts`.
- Modifying `gamedef-runtime.ts`.

## Acceptance Criteria

### Tests That Must Pass

1. **Pattern 5**: Action with `chooseOne { options: { query: 'enums', values: ['a','b'] } }`
   compiles to `{ compilable: true }` and check returns `{ admissible: true }`.
2. **Pattern 5**: Action with `chooseOne { options: { query: 'intsInRange', min: 1, max: 5 } }`
   compiles and always returns admissible.
3. **Pattern 1**: Action with `chooseOne { options: { query: 'tokensInZone', zone: 'X' } }`
   compiles. Check returns `admissible: true` when zone has tokens,
   `admissible: false` when zone is empty.
4. **Pattern 1 single-decision**: Same as above but with `isSingleDecision: true`.
   Check returns populated `domain` with correct `ChoiceOption[]` shape.
5. **Pattern 4**: Action with zone query compiles. Check reflects zone
   availability in state.
6. **Pattern 2**: Action with `if { when: condition } → then: [chooseOne { query: tokens }]`.
   Compiles when condition is compilable. Check returns `admissible: false`
   when guard fails. Check returns based on token query when guard passes.
7. **Pattern 2**: Returns `{ compilable: false }` when guard condition is
   NOT compilable by `tryCompileCondition`.
8. **Pattern 3**: Action with `forEach { zones } → [chooseOne { tokens }]`.
   Compiles. Returns `admissible: true` when at least one zone yields tokens.
   Returns `admissible: false` when no zone yields tokens.
9. **Fallback**: Action with unsupported first-decision structure (e.g.,
   decision inside a `reduce`) returns `{ compilable: false }`.
10. **Pipeline**: Multi-stage pipeline where first decision is in stage 1
    (not stage 0) — correctly found and compiled.
11. **Pipeline + stage predicate**: Stage with a Spec 90 compiled predicate —
    predicate is composed into the domain check.
12. Existing suite: `pnpm turbo test --force`

### Invariants

1. Compiled closures are pure functions of `(state, activePlayer)`.
2. No game-specific pattern matching — all patterns operate on generic
   EffectAST structures and OptionsQuery shapes.
3. `tryCompileCondition` is called for guard conditions — if it returns
   `null`, the entire action is `{ compilable: false }`. No partial
   compilation with interpreter fallback within a single action.
4. For single-decision actions, `domain` ChoiceOption values must have
   `legality: 'legal'` and `illegalReason: null` matching the interpreter's
   default for option construction.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/first-decision-compiler.test.ts` —
   Unit tests for `compileFirstDecisionDomain` and
   `compileActionFirstDecision` using hand-crafted EffectAST + GameDef
   fixtures for all 5 patterns plus fallback and pipeline cases.

### Commands

1. `pnpm -F @ludoforge/engine test 2>&1 | grep -E 'first-decision|FAIL'`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`
