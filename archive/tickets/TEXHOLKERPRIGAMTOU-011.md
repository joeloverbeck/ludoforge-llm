# TEXHOLKERPRIGAMTOU-011: Composable Multi-Source Queries for OptionsQuery

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-010 (completed; archived)
**Blocks**: TEXHOLKERPRIGAMTOU-012, TEXHOLKERPRIGAMTOU-014

## 1) What needs to be fixed/added

Add composable query operators so YAML can build item sets from multiple sources (for example player hand + community cards) without engine special cases.

Scope:
- Extend `OptionsQuery` with one canonical compositional form:
  - `{ query: "concat", sources: OptionsQuery[] }`
- Composition semantics are ordered concatenation (left-to-right, duplicates preserved).
- Preserve existing query result item typing (`QueryResult`) and keep composition game-agnostic.
- Support use from existing effects including `evaluateSubset`, `forEach`, and aggregations.
- Define and enforce stable ordering semantics for composed queries.

Constraints:
- No aliasing or duplicate syntaxes for equivalent behavior.
- No Texas-specific combinator behavior.
- Deterministic output ordering is mandatory.
- No implicit deduplication or union semantics in this ticket; dedupe is a separate primitive if ever needed.

## 2) Invariants that should pass

1. Composed queries are deterministic and stable given identical input state.
2. Query composition remains game-agnostic and reusable across card/board games.
3. Existing single-source query behavior remains unchanged.
4. Compiler/schema/runtime reject invalid composition node shapes (missing/empty/non-array `sources`) with clear diagnostics.
5. `evaluateSubset` and `forEach` can consume composed query outputs directly.
6. Consumer-specific type errors continue to surface where required (for example token-only effects), rather than introducing ad-hoc query-level shape typing.

## 3) Tests that should pass

1. Unit: AST/schema/compiler support for `{ query: "concat", sources: [...] }`.
2. Unit: runtime `concat` ordering and result cardinality tests (left-to-right, duplicates preserved).
3. Unit: composed query usage inside `evaluateSubset` and `forEach`.
4. Unit: invalid composition diagnostics for malformed `concat` payloads.
5. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- **Completion date**: 2026-02-15
- **What was changed**:
  - Added canonical query composition primitive: `{ query: "concat", sources: [<OptionsQuery>, ...] }`.
  - Extended AST/types/schema/compiler lowering/runtime evaluation/behavior validation to support `concat`.
  - Enforced deterministic semantics: left-to-right source concatenation with duplicates preserved.
  - Added tests covering schema/lowering/runtime, `evaluateSubset` consumption, `forEach` consumption, and invalid empty-source diagnostics.
  - Regenerated JSON schema artifacts (`GameDef`, `Trace`, `EvalReport`) after schema updates.
- **Deviations from original plan**:
  - Scoped composition to one canonical primitive (`concat`) and explicitly deferred deduplicating union semantics to future work.
  - Replaced the earlier “mixed-shape composition rejection” assumption with consumer-level type enforcement, matching current architecture.
- **Verification results**:
  - `npm run build` ✅
  - Targeted suites (query/schema/compiler/evaluateSubset/legalChoices/validateGameDef/types-exhaustive) ✅
  - `npm test` ✅
  - `npm run lint` ✅
