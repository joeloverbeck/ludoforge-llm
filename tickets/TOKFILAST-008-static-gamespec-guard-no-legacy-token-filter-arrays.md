# TOKFILAST-008: Add Static GameSpecDoc Guard Against Legacy Token Filter Arrays

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — static authoring guard in lint/validation pipeline
**Deps**: archive/tickets/TOKFILAST-002-cnl-lowering-and-no-shim-migration.md, archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md

## Problem

Legacy array token-filter syntax is now rejected at compile time, but there is no dedicated static guard focused on this authoring anti-pattern. Regressions currently surface only when affected specs are compiled/tests are executed.

## Assumption Reassessment (2026-03-06)

1. Compiler currently rejects legacy array filter shapes on migrated token-filter surfaces.
2. There is no explicit repository-level static/lint guard that scans GameSpecDoc sources for legacy array token filters.
3. No active ticket in `tickets/*` currently tracks this specific fail-fast authoring guard.

## Architecture Check

1. A static guard provides faster feedback and reduces migration-regression risk before deeper compile/test cycles.
2. The guard operates on GameSpecDoc authoring shape and keeps runtime/kernel fully game-agnostic.
3. No compatibility shim/alias paths are introduced.

## What to Change

### 1. Add a static check utility for legacy token-filter arrays

Implement a source scanner (or AST-level check after parse) that flags legacy array syntax under known token-filter surfaces.

### 2. Integrate into existing quality gates

Wire the check into a deterministic command used by CI/local quality runs (for example alongside existing linter/check scripts).

### 3. Add regression tests for checker behavior

Cover positive (canonical expression) and negative (legacy array) cases, including nested query/effect filter surfaces.

## Files to Touch

- `packages/engine/src/cnl/*` (modify/add checker integration point)
- `packages/engine/scripts/*` (add or modify check command, if needed)
- `packages/engine/test/unit/*` (add checker tests)
- `package.json` / `packages/engine/package.json` (modify scripts, if needed)

## Out of Scope

- Runtime token-filter evaluation changes.
- Game-specific filter semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Static check fails on legacy array filter syntax in GameSpecDoc sources.
2. Static check passes on canonical `TokenFilterExpr` syntax.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Guard is generic and not FITL-specific.
2. GameDef/simulation/runtime remain unaffected by game-specific authoring concerns.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/*` (new checker-specific tests) — validates fail/pass behavior on representative surfaces.
2. `packages/engine/test/integration/compile-pipeline.test.ts` (optional) — end-to-end guard integration assertion if script-wired.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `<new static guard command>`
3. `pnpm -F @ludoforge/engine test`
