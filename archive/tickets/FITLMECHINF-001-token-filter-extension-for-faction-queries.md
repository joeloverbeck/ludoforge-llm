# FITLMECHINF-001 - Token Filter Extension for Faction Queries

**Status**: ✅ COMPLETED
**Spec**: `specs/25-fitl-game-mechanics-infrastructure.md`
**References**: `specs/00-fitl-implementation-order.md` (Milestone B)
**Depends on**: None (builds on existing `OptionsQuery` infrastructure)

## Goal

Extend the `tokensInZone` query with an optional filter predicate so that derived value computations (COIN Control, NVA Control, Victory formulas) can count faction-specific pieces without post-filtering in effect AST. This is the prerequisite flagged in the spec's "Kernel extension note" (line 113).

## Rationale

Several Spec 25 derived values require counting pieces filtered by token properties (e.g., faction). The current `tokensInZone` query returns all tokens in a zone with no filter mechanism. Without this extension, every derived value computation would require verbose `forEach` + `if` + `let` patterns instead of a single aggregate query. This ticket adds the minimal filter predicate to `OptionsQuery.tokensInZone`.

## Scope

### Changes

1. **Extend `OptionsQuery` type** (`src/kernel/types.ts`): Add optional `filter` field to the `tokensInZone` variant:
   ```typescript
   | {
       readonly query: 'tokensInZone';
       readonly zone: ZoneSel;
       readonly filter?: {
         readonly prop: string;       // token property name (e.g., 'faction')
         readonly op: 'eq' | 'neq' | 'in' | 'notIn';
         readonly value: string | readonly string[];
       };
     }
   ```

2. **Update `evalQuery`** (`src/kernel/eval-query.ts`): When `filter` is present on a `tokensInZone` query, apply the predicate to the token array before returning. Filter matches against `token.props[filter.prop]`.

3. **Update Zod schema** (`src/kernel/schemas.ts`): Extend the `tokensInZone` schema variant to accept the optional `filter` field.

4. **Add unit tests** covering all four filter operators (`eq`, `neq`, `in`, `notIn`) and the no-filter backward-compatible case.

## File List

- `src/kernel/types.ts` — Extend `OptionsQuery` tokensInZone variant
- `src/kernel/eval-query.ts` — Implement filter predicate logic
- `src/kernel/schemas.ts` — Extend Zod schema for tokensInZone filter
- `test/unit/eval-query.test.ts` — New filter test cases

## Out of Scope

- Derived value computation functions (FITLMECHINF-002)
- Stacking constraints (FITLMECHINF-003)
- Zone-level property queries or a new `zones` query with extended filters
- Any changes to `EffectAST`, `ConditionAST`, or `ValueExpr`
- Compiler changes (`src/cnl/*`)
- FITL-specific data encoding

## Acceptance Criteria

### Specific Tests That Must Pass

- `test/unit/eval-query.test.ts`:
  - `tokensInZone` with no filter returns all tokens (backward-compatible)
  - `tokensInZone` with `filter: { prop: 'faction', op: 'eq', value: 'US' }` returns only US tokens
  - `tokensInZone` with `filter: { prop: 'faction', op: 'neq', value: 'US' }` returns non-US tokens
  - `tokensInZone` with `filter: { prop: 'faction', op: 'in', value: ['US', 'ARVN'] }` returns COIN tokens
  - `tokensInZone` with `filter: { prop: 'faction', op: 'notIn', value: ['US', 'ARVN'] }` returns insurgent tokens
  - `tokensInZone` with filter on missing token prop returns empty array (no crash)
- `test/unit/schemas-ast.test.ts`: Schema validates `tokensInZone` with and without filter
- `npm run build` passes
- `npm test` passes (all existing tests unbroken)

### Invariants That Must Remain True

- Existing `tokensInZone` queries without `filter` produce identical results to current behavior
- No mutation of `GameState` or `Token` objects during filter evaluation
- Filter evaluation is a pure function of token props — no side effects
- `evalQuery` budget enforcement still applies after filtering

## Outcome

- **Completed**: 2026-02-12
- **Changes**:
  - `src/kernel/types.ts`: Added `TokenFilterPredicate` interface; extended `tokensInZone` variant with optional `filter`
  - `src/kernel/schemas.ts`: Extended tokensInZone Zod schema to validate optional `filter` (prop, op, value) with strict mode
  - `src/kernel/eval-query.ts`: Added `applyTokenFilter` pure function; `tokensInZone` case applies filter before bounds check
  - `test/unit/eval-query.test.ts`: 6 new tests (backward-compat, eq, neq, in, notIn, missing prop)
  - `test/unit/schemas-ast.test.ts`: 2 new tests (valid filter schemas, rejected malformed filters)
- **Deviations**: None
- **Verification**: Build passes, 25/25 tests in modified files pass, no existing tests broken
