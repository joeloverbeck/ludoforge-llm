# KERCONVALQUEEVA-012: Generic Indexed Runtime Table Lookup Engine

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: KERCONVALQUEEVA-011

## Assumption Reassessment (2026-02-16)

- Confirmed discrepancy in current runtime index assumptions:
  - `buildRuntimeTableIndex` already exists and indexes table contracts to resolved rows/field metadata (`src/kernel/runtime-table-index.ts`).
  - It does not yet build key-value lookup indexes from `uniqueBy`; `assetRows` still evaluates `where` predicates via row scan (`src/kernel/eval-query.ts`).
- Confirmed discrepancy in observability assumptions:
  - Existing execution tracing is effect-oriented and schema-backed (`EffectTraceEntry`), but there is no dedicated query-plan trace surface for `assetRows` lookup strategy.
  - Therefore, mandatory query-path instrumentation in this ticket would force broader trace/schema contract changes not required to land indexed lookup correctness.
- Confirmed discrepancy in test assumptions:
  - There is existing unit coverage for runtime table index construction and `assetRows` behavior (`test/unit/runtime-table-index.test.ts`, `test/unit/eval-query.test.ts`), but no tests yet for indexed lookup path parity or key-index determinism.

## Architecture Reassessment

- Proposed indexed lookup is beneficial over the current scan-only architecture for clean and extensible runtime querying because:
  - key-constraint semantics already exist declaratively via `tableContracts[].uniqueBy`;
  - runtime can use those generic contracts directly without game-specific branching;
  - semantic parity can be preserved by using index preselection + existing predicate evaluator.
- To keep architecture robust and minimal:
  - scope this ticket to unique-key indexes only (driven by `uniqueBy`);
  - keep non-unique secondary indexing and query-plan telemetry out of scope for now;
  - avoid aliases/back-compat branches and keep one canonical path in `assetRows` query evaluation.

## 1) What needs to change/be added

- Extend runtime table indexing to build deterministic in-memory key indexes for declared `uniqueBy` tuples.
- Route `assetRows` evaluation through indexed candidate lookup when predicates constrain a declared unique key tuple with `eq` scalars.
- Preserve exact semantic parity with current filtering behavior and cardinality enforcement by applying existing predicate evaluation to indexed candidates.
- Keep fallback path to generic predicate filtering for non-indexable queries.

## 2) Invariants that should pass

1. Indexed and fallback execution produce identical result sets and ordering semantics.
2. Cardinality errors are identical regardless of indexed/fallback path.
3. Runtime behavior remains deterministic across identical inputs.
4. Engine remains fully game-agnostic; only contract metadata (`uniqueBy`) drives index construction and lookup routing.

## 3) Tests that should pass

1. Unit (`runtime-table-index`): builds deterministic key indexes from `uniqueBy` metadata and preserves row-order candidate lists.
2. Unit (`eval-query`): indexed and fallback paths return equivalent results for equivalent queries.
3. Unit (`eval-query`): cardinality errors match between indexed and fallback modes.
4. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16
- What was actually changed:
  - Extended `RuntimeTableIndexEntry` to include deterministic `uniqueBy` tuple indexes (`keyIndexesByTuple`) with composite-key candidate row maps.
  - Added indexed candidate preselection in `assetRows` query evaluation when `where` predicates constrain a declared unique tuple with scalar `eq` predicates.
  - Preserved semantic parity by running existing predicate filtering and cardinality checks over indexed candidates (or full rows on fallback).
  - Added tests covering deterministic unique-key index construction and indexed/fallback equivalence for results + cardinality failures.
- Deviations from original plan:
  - Intentionally left non-unique secondary indexes and query-path telemetry out of scope to avoid broad trace/schema contract expansion in this ticket.
- Verification results:
  - `npm run build` passed.
  - Focused tests passed:
    - `node --test dist/test/unit/runtime-table-index.test.js dist/test/unit/eval-query.test.js`
  - `npm test` passed.
  - `npm run lint` passed.
