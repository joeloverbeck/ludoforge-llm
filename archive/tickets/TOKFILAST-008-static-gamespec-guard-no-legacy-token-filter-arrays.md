# TOKFILAST-008: Add Static GameSpecDoc Guard Against Legacy Token Filter Arrays

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No production engine/runtime changes — static guard test + helper only
**Deps**: archive/tickets/TOKFILAST-002-cnl-lowering-and-no-shim-migration.md, archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md

## Problem

Legacy array token-filter syntax is rejected by compiler-lowering tests, but we still lack a dedicated static authoring guard that scans maintained GameSpecDoc sources directly. Today, regressions are primarily caught when compile-path tests happen to execute relevant fixtures.

## Assumption Reassessment (2026-03-06)

1. Compiler-lowering coverage already rejects legacy array token filters on query/effect surfaces (`packages/engine/test/unit/compile-conditions.test.ts`, `packages/engine/test/unit/compile-effects.test.ts`).
2. Integration coverage already exercises token-filter contract behavior in compile pipeline paths (`packages/engine/test/integration/compile-pipeline.test.ts`).
3. Discrepancy corrected: this ticket is not about adding new compiler/runtime guards; it is about adding a repository-level static authoring guard in lint-policy tests for maintained GameSpecDoc sources.
4. No active ticket outside `TOKFILAST-008` currently owns this specific static-source guardrail.

## Architecture Check

1. A static source guard complements existing compile/runtime checks with faster, deterministic drift detection in authored specs.
2. Implementing this as a lint-policy unit test preserves clean architecture: no runtime/kernel/compiler branching for repository hygiene concerns.
3. No compatibility shim/alias behavior is introduced.

## What to Change

### 1. Add a static lint-policy scanner for legacy array token filters

Add a test-level scanner that inspects maintained GameSpecDoc markdown sources and fails when token-filter surfaces use legacy array syntax.

### 2. Scope scan targets to maintained authoring sources

Cover canonical source directories used for active game authoring and conformance fixtures (excluding archived artifacts and intentionally malformed non-authoring docs).

### 3. Add regression tests for scanner matcher behavior

Cover positive (canonical expression) and negative (legacy array) matcher behavior so the guard itself is tested and resilient.

## Files to Touch

- `packages/engine/test/unit/lint/*` (add static guard policy test)
- `packages/engine/test/helpers/*` (add/extend helper(s) for source scanning)

## Out of Scope

- Compiler lowering/runtime token-filter behavior changes.
- New CLI scripts or CI command surfaces for this guard.
- Game-specific semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Static lint-policy guard fails on legacy array token-filter syntax in scanned GameSpecDoc sources.
2. Static lint-policy guard passes on canonical `TokenFilterExpr` syntax.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Guard remains generic and game-agnostic.
2. Compiler/runtime/kernel behavior is unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/*` (new static guard policy test) — validates repository-scan contract and matcher behavior.
2. `packages/engine/test/helpers/*` (new/updated helper tests if needed) — validates source scanning utility behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Added a static token-filter legacy-array detector helper at `packages/engine/test/helpers/legacy-token-filter-array-guard.ts`.
  - Added a lint-policy guard test at `packages/engine/test/unit/lint/gamespec-legacy-token-filter-array-policy.test.ts`.
  - Guard now scans maintained GameSpecDoc markdown sources (`data/games/**/*.md` and non-malformed CNL fixture markdown) and fails if legacy array token-filter syntax appears on query/effect filter surfaces.
  - Added matcher regression coverage (positive/negative) to ensure the guard remains stable.
- Deviations from original plan:
  - No compiler/runtime/script wiring was added; implementation remained test-policy-only to keep repository hygiene checks out of production engine layers.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/lint/gamespec-legacy-token-filter-array-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
