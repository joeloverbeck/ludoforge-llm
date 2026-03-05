# TOKFILAST-001: Unify Token Query Filters As Expression AST

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `kernel/types-ast`, `kernel/types-core`, query/effect evaluation, schema validation, hidden-info canonicalization, compiler output alignment to canonical AST
**Deps**: specs/29-fitl-event-card-encoding.md, specs/00-implementation-roadmap.md

## Problem

Token query/effect filters in engine AST currently rely on conjunction-only predicate arrays (`filter: [{ prop, ... }, ...]`). This blocks direct expression of disjunction/negation at token-filter level, forces verbose query-level `concat` workarounds, and duplicates filtering semantics between zone filters (ConditionAST) and token filters (custom mini-language).

## Assumption Reassessment (2026-03-05)

1. `tokensInMapSpaces.spaceFilter` already uses `ConditionAST`, while token filters in `tokensInZone` / `tokensInAdjacentZones` / `tokensInMapSpaces` and `reveal`/`conceal` still use `TokenFilterPredicate[]`.
2. Runtime query/effect behavior enforces conjunction-only token predicates via `filterTokensByPredicates(...every...)` and predicate-array canonicalization in hidden-info grants.
3. Compiler lowering (`compile-conditions.ts`) still lowers author input token filters from array syntax; this means AST/runtime can be modernized first while authoring syntax migration remains a follow-up boundary-hardening step.
4. FITL data uses `query: concat` patterns to union multiple token-filtered sources where boolean token filtering is insufficiently expressive at a single query node.

## Architecture Check

1. A canonical token filter expression AST (boolean composition + predicate leaves) is cleaner and more extensible than ad-hoc predicate arrays.
2. Keeping evaluation generic and data-driven preserves engine agnosticism: no FITL-specific branches are introduced.
3. This ticket hardens the canonical AST/runtime contract first; strict authoring-surface migration (removing array author syntax) remains explicitly handled in follow-up ticket `TOKFILAST-002`.

## What to Change

### 1. Introduce canonical token filter expression AST

Define a token filter expression type that supports `and`/`or`/`not` composition over `TokenFilterPredicate` leaves. Replace token-filter array contracts in AST/query/effect surfaces with this expression type.

### 2. Evaluate token filter expressions with bound token context

At runtime, evaluate token filter expressions per candidate token using generic boolean composition, replacing bespoke conjunction-only array filtering.

### 3. Update validation/schema/core contracts to expression shape

Update TypeScript types + Zod schemas + JSON schema artifacts + behavior validation + hidden-info filter canonicalization to use expression filters end-to-end.

### 4. Align compiler output to canonical AST

Update CNL lowering output so compiled `OptionsQuery`/effects emit expression filters in AST, while preserving existing ticket split where strict authoring syntax migration/removal is handled by `TOKFILAST-002`.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/hidden-info-grants.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify if needed for expression canonicalization keys)
- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (delete or simplify)
- `packages/engine/schemas/GameDef.schema.json` (modify; regenerated)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)

## Out of Scope

- Strict removal of legacy authoring array syntax in GameSpecDoc input files and production FITL migration (tracked by `TOKFILAST-002`).
- New game-specific helper macros for Phoenix or any specific event.

## Acceptance Criteria

### Tests That Must Pass

1. Token query/effect filters support boolean `or`/`and`/`not` composition in unit tests.
2. Existing token predicate semantics (`eq/neq/in/notIn`) remain expressible and validated via expression leaves.
3. CNL lowering emits canonical expression filter AST for token filters.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. GameDef/runtime remain game-agnostic; no FITL-specific branches or enums are introduced.
2. A single canonical token-filter contract exists in AST/schema/runtime (no dual contracts at that layer).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — token filter expression schema coverage.
2. `packages/engine/test/unit/eval-query.test.ts` — runtime token filter expression evaluation including disjunction/negation.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — validator diagnostics for malformed/invalid token filter expressions.
4. `packages/engine/test/unit/compile-conditions.test.ts` — compiler lowering emits canonical expression filter AST.
5. `packages/engine/test/unit/token-filter.test.ts` — expression evaluator and canonicalization behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test:integration`

## Outcome

- Completion date: 2026-03-05
- What changed:
  - Implemented canonical `TokenFilterExpr` across AST/core/schema/runtime/compiler paths (`and`/`or`/`not` + predicate leaves).
  - Replaced conjunction-only token filter arrays at runtime query/effect surfaces and reveal/conceal traces.
  - Regenerated JSON schema artifacts to match canonical expression filter contracts.
  - Added recursive token-filter validation + canonicalization support and expression-aware hidden-info grant key normalization.
  - Updated compiler lowering to emit canonical expression filters for token queries/effects.
  - Hardened terminal/victory lowering so checkpoint `when` and margin value expressions are lowered through canonical condition/value compilation (prevents raw legacy filter shapes leaking into `GameDef`).
  - Extended `zones`/`mapSpaces` query lowering to accept `{ filter: { condition: ... } }` wrapper form used by production terminal logic.
  - Updated and strengthened unit/integration expectations to assert canonical expression filter shape.
- Deviations from original plan:
  - Additional compiler hardening in `compile-victory.ts` and `compiler-core.ts` was required to keep production FITL integration green after canonical filter migration.
  - Added compatibility handling for `{ condition }` zone/map-space filter wrappers in query lowering; this was not explicitly called out in initial scope but was required by existing production terminal conditions.
  - Expanded integration test updates beyond initial unit-focused list due canonical shape propagation into production event/card fixture expectations.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (263/263).
  - `pnpm -F @ludoforge/engine test:integration` passed (134/134).
