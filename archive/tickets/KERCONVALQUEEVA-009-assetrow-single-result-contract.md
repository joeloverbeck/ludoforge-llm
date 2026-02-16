# KERCONVALQUEEVA-009: Exact-Match Runtime Table Lookup Contract (Single-Row Semantics)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: GAMEDEFGEN-029
**Blocks**: Safe data-driven control flow across card/board games

## 0) Reassessed baseline (code + tests)

Current state in repository:
- Runtime table lookups already exist through `assetRows` (`OptionsQuery`) with `where` predicates.
- Runtime table contract/field validation already exists in both validator and runtime (`validate-gamedef-behavior`, `eval-query`, `runtime-table-eval-errors`).
- Texas blind escalation currently selects the next schedule row via `forEach` over filtered `assetRows`.
- That pattern is structurally unsafe for invariants: 0 matches become silent no-op; >1 matches apply multiple writes in sequence.

Assumption corrections:
- We do **not** need a brand-new table-query subsystem.
- We should extend the existing generic `assetRows` contract with explicit cardinality semantics rather than introducing game-specific logic or ad-hoc aliases.
- Existing tests cover table lookup and field validation, but do not enforce strict single-row cardinality behavior for runtime table queries.

## 1) What needs to change/be added

Add a game-agnostic runtime table lookup contract on top of existing `assetRows` query semantics that can require exactly one row and fail hard on 0 or >1 matches.

Scope:
- Extend `assetRows` query shape with explicit cardinality mode (no new game-specific query type).
- Add cardinality modes:
  - `many` (default; current behavior)
  - `exactlyOne` (strict invariant mode)
  - `zeroOrOne` (optional, bounded mode for future-safe composition)
- Add dedicated deterministic runtime errors for cardinality mismatch, including context (`tableId`, `cardinality`, `where`, `actualMatchCount`).
- Keep compile-time validation generic and schema-driven; no per-game branches.
- Refactor Texas blind escalation to use strict single-row lookup for next blind level row selection.

Out of scope:
- Silent fallback to list-style iteration when single-row lookup is requested.
- New game-specific runtime handlers or per-game schema forks.

## 2) Invariants that must pass

1. `exactlyOne` lookup fails when 0 rows match.
2. `exactlyOne` lookup fails when >1 rows match.
3. Failure includes deterministic error code + context (table id/name, predicates, cardinality mode).
4. Query behavior is generic and reusable for any game data table.

## 3) Tests that must pass

1. Unit (`eval-query`): `assetRows` with `cardinality: exactlyOne` returns one row when exactly one match exists.
2. Unit (`eval-query`): `assetRows` with `cardinality: exactlyOne` throws deterministic dedicated errors on 0 and >1 matches.
3. Unit (`eval-query`): `assetRows` with `cardinality: zeroOrOne` allows 0 or 1 match and throws on >1.
4. Unit (schema/validation): malformed cardinality values are rejected by AST schema/validator.
5. Unit/Integration (Texas blind escalation): malformed schedule cardinality produces explicit failure instead of silent no-op or multi-apply behavior.
6. Regression: `npm run build`, `npm test`, `npm run lint`.

## 4) Architectural rationale

- Extending `assetRows` keeps the kernel query model composable and avoids duplicating table lookup concepts.
- Cardinality belongs at query evaluation boundary, where row count is known and invariant enforcement is centralized.
- This design is more robust than current `forEach`-over-filter pattern for invariant-dependent flows (like blind level transitions).

## Outcome

- Completion date: 2026-02-16
- What changed:
  - Added generic `assetRows.cardinality` support (`many` | `exactlyOne` | `zeroOrOne`) across AST types, schema validation, CNL lowering, and runtime evaluation.
  - Added deterministic runtime errors for cardinality violations with query/table context and actual match counts.
  - Updated Texas `escalate-blinds` to require `cardinality: exactlyOne` for next-level row selection.
  - Strengthened unit tests for schema acceptance/rejection, query runtime cardinality behavior, compile lowering, and Texas malformed-schedule failure behavior.
  - Regenerated JSON schema artifacts after AST/schema updates.
- Deviations from original plan:
  - Implemented strict cardinality as an extension of existing `assetRows` instead of introducing a separate single-row query form, to keep architecture generic and avoid duplicated query semantics.
  - Added `zeroOrOne` now (not deferred) because it is low-cost in the same query boundary and improves extensibility.
- Verification:
  - `npm test` passed.
  - `npm run lint` passed.
