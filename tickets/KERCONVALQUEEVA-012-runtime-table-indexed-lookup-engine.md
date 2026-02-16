# KERCONVALQUEEVA-012: Generic Indexed Runtime Table Lookup Engine

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: KERCONVALQUEEVA-011

## 1) What needs to change/be added

- Extend runtime table indexing to build deterministic in-memory indexes for declared unique keys (and optionally non-unique keys).
- Route `assetRows` evaluation through indexed lookup when predicates match an indexable key pattern.
- Keep exact semantic parity with current filtering behavior and cardinality enforcement.
- Keep fallback path to generic predicate filtering for non-indexable queries.
- Add trace/collector metadata hooks (optional, low-noise) to indicate indexed vs fallback query path for observability.

## 2) Invariants that should pass

1. Indexed and non-indexed execution produce identical result sets and ordering semantics.
2. Cardinality errors are identical regardless of indexed/fallback path.
3. Runtime behavior remains deterministic across identical inputs.
4. Engine remains fully game-agnostic; only contract metadata drives index construction.

## 3) Tests that should pass

1. Unit (`runtime-table-index`): builds deterministic key indexes from contract metadata.
2. Unit (`eval-query`): indexed path and fallback path return equivalent results for same queries.
3. Unit (`eval-query`): cardinality errors match between indexed and fallback modes.
4. Performance-oriented unit/integration smoke: indexed exact-match queries avoid full-table scans (assert via instrumentation counter or query-path metadata).
5. Regression: `npm run build`, `npm test`, `npm run lint`.
