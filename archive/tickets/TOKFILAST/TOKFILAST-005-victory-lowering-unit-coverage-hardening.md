# TOKFILAST-005: Add Focused Unit Coverage for Victory Lowering

**Status**: COMPLETED (2026-03-06)
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler test coverage only
**Deps**: archive/tickets/TOKFILAST-001-token-query-filter-expression-unification.md

## Problem

`lowerVictory` now performs non-trivial lowering of terminal checkpoint `when` and margin `value` expressions, but current regression safety is mostly integration-level. This slows feedback and increases the risk of subtle compiler regressions slipping through until large FITL suites run.

## Assumption Reassessment (2026-03-06)

1. `lowerVictory` lowers `terminal.checkpoints[].when` through `lowerConditionNode` and `terminal.margins[].value` through `lowerValueNode` (`packages/engine/src/cnl/compile-victory.ts`).
2. Existing coverage is mixed (unit + integration), not purely integration-only:
   - `packages/engine/test/unit/compile-top-level.test.ts` already checks high-level coup/victory pass-through and some malformed victory metadata diagnostics.
   - `packages/engine/test/integration/*coup-victory*.test.ts` and `fitl-production-terminal-victory.test.ts` validate runtime terminal outcomes.
3. Missing coverage is specifically compiler-lowering focused: canonical AST shape assertions for lowered `checkpoint.when` / `margin.value`, plus explicit proof that `compiler-core` threads lowering context (named sets/token filter props/seat normalization/type-inference) into `lowerVictory`.

## Architecture Reassessment

1. Adding compiler-focused unit tests is beneficial to the current architecture because it protects the lowering boundary (`GameSpecDoc` -> canonical AST) where regressions are most likely and cheapest to catch.
2. The target architecture remains a generic compiler/runtime contract: no FITL-specific branches, no aliases, and no backward-compatibility shims.
3. Test emphasis should be on canonicalization invariants and fail-closed diagnostics, not runtime behavior duplication already covered by integration tests.
4. A dedicated `compile-victory` unit suite would be the cleanest long-term layout, but this ticket will keep changes minimal and localized to existing unit coverage unless new scaffolding is strictly necessary.

## What to Change

### 1. Add direct unit coverage for lowered victory checkpoints

Add tests that verify `terminal.checkpoints[].when` is lowered to canonical AST shape and that invalid nested expressions produce deterministic diagnostics.

### 2. Add direct unit coverage for lowered victory margins

Add tests that verify `terminal.margins[].value` lowering handles valid value expressions and reports deterministic diagnostics for invalid forms.

### 3. Guard compiler wiring

Add assertions that `compiler-core` threads lowering context into `lowerVictory` by exercising:
- named-set resolution from `metadata.namedSets`,
- token filter prop validation/canonical lowering in terminal checkpoint expressions,
- seat selector normalization inside terminal expressions.

## Files to Touch

- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (do not modify unless new helper extraction becomes necessary)
- `packages/engine/test/integration/fitl-production-terminal-victory.test.ts` (no planned change; only touch if a non-duplicative contract gap is discovered)

## Out of Scope

- Any terminal/victory rules redesign.
- Any GameSpecDoc data migration work.

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests explicitly assert lowered checkpoint/margin shapes and diagnostics.
2. Tests fail if `lowerVictory` reverts to raw passthrough for checkpoint `when` or margin `value`.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Terminal victory lowering remains deterministic and context-aware at compiler layer.
2. Coverage remains generic and game-agnostic (no FITL-specific kernel behavior).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — explicit assertions for lowered terminal checkpoint/margin internals and lowering-context threading.
2. `packages/engine/test/unit/compile-conditions.test.ts` — only if helper extraction is truly required.
3. `packages/engine/test/integration/fitl-production-terminal-victory.test.ts` — no change expected.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test:integration`

## Outcome

Completed with a tighter, architecture-focused scope than originally written:

1. Updated assumptions to reflect existing mixed coverage and narrowed the gap to lowering-boundary invariants/context threading.
2. Implemented focused unit coverage only in `packages/engine/test/unit/compile-top-level.test.ts`:
   - canonical lowered AST assertions for `terminal.checkpoints[].when` and `terminal.margins[].value`,
   - deterministic nested diagnostics for invalid checkpoint/margin internals.
3. No changes were needed in `compile-conditions` or FITL integration tests.
4. Follow-up architecture hardening moved this coverage into a dedicated `packages/engine/test/unit/compile-victory.test.ts` suite and removed the dedicated lowering cases from `compile-top-level`, so victory lowering contracts now live beside the `lowerVictory` module boundary.
5. Validation executed:
   - `pnpm -F @ludoforge/engine build`,
   - `node --test packages/engine/dist/test/unit/compile-victory.test.js`,
   - `node --test packages/engine/dist/test/unit/compile-top-level.test.js --test-name-pattern "preserves coupPlan and victory contracts when declared|returns blocking diagnostics for malformed coupPlan and victory metadata"`,
   - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js packages/engine/dist/test/integration/fitl-coup-victory.test.js packages/engine/dist/test/integration/fitl-production-terminal-victory.test.js`,
   - `pnpm -F @ludoforge/engine lint`.
