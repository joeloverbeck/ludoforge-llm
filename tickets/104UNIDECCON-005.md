# 104UNIDECCON-005: Implement `compileConsideration()`, remove `compileScoreTerm()`/`compileCompletionScoreTerm()`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `compile-agents.ts`, `validate-agents.ts`, `compiler-core.ts`
**Deps**: `archive/tickets/104UNIDECCON-003.md`, `tickets/104UNIDECCON-004.md`, `archive/tickets/104UNIDECCON-002.md`, `specs/104-unified-decision-context-considerations.md`

## Problem

The compiler must replace the two separate compilation methods (`compileScoreTerm` and `compileCompletionScoreTerm`) with a single `compileConsideration()` that validates scopes and enforces scope-specific ref rules. The validator must check `scopes` validity and `use.considerations` references.

## Assumption Reassessment (2026-04-01)

1. `compileScoreTerm()` at `compile-agents.ts:~1229` — confirmed. Compiles weight/value/when for move-level scoring.
2. `compileCompletionScoreTerm()` at `compile-agents.ts:~1299` — confirmed. Compiles weight/value/when for completion-level scoring.
3. `scoreTermStatus`/`completionScoreTermStatus` tracking maps in `AgentLibraryCompiler` — confirmed. Must be replaced with `considerationStatus`.
4. `validate-agents.ts` validates `use.scoreTerms` and `use.completionScoreTerms` — confirmed. Must be updated.

## Architecture Check

1. Single `compileConsideration()` handles both scopes — Foundation 15.
2. Scope validation at compile time — Foundation 12.
3. Single-scope violations are errors; dual-scope cross-context refs are warnings (per spec).

## What to Change

### 1. Implement `compileConsideration()` in `AgentLibraryCompiler`

- Validate `scopes` is non-empty, contains only `'move'` | `'completion'`
- Compile weight/value/when expressions (same as current `compileScoreTerm`)
- Scope-specific ref validation:
  - `scopes: [move]` only: `decision.*`/`option.*` refs → error
  - `scopes: [completion]` only: `candidate.*`/`preview.*` refs → error
  - `scopes: [move, completion]`: cross-context refs without `context.kind` guard → warning

### 2. Remove `compileScoreTerm()` and `compileCompletionScoreTerm()`

### 3. Replace tracking maps

`scoreTermStatus` + `completionScoreTermStatus` → `considerationStatus`

### 4. Update profile lowering

`use.considerations` replaces `use.scoreTerms` + `use.completionScoreTerms`. Profile `plan.considerations` derived from transitive dependencies.

### 5. Update `validate-agents.ts`

- Validate `scopes` on each consideration definition
- Validate `use.considerations` refs exist in library
- Remove `use.scoreTerms`/`use.completionScoreTerms` validation

### 6. Update `compiler-core.ts` if needed

Wire `considerations` through the compilation pipeline.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify — major)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify — if needed)

## Out of Scope

- Runtime changes — ticket 006
- Game spec migration — ticket 007
- Diagnostic code registration — ticket 008

## Acceptance Criteria

### Tests That Must Pass

1. Consideration with `scopes: [move]` compiles successfully
2. Consideration with `scopes: [completion]` compiles successfully
3. Consideration with `scopes: [move, completion]` compiles successfully
4. Empty scopes → error diagnostic
5. Invalid scope value → error diagnostic
6. `candidate.*` ref in `scopes: [completion]` only → error diagnostic
7. `decision.*` ref in `scopes: [move]` only → error diagnostic
8. `candidate.*` ref in `scopes: [move, completion]` without guard → warning diagnostic
9. Profile `use.considerations` with unknown ref → error diagnostic
10. Existing tests updated to use new API

### Invariants

1. Compilation is pure — deterministic output
2. Scope validation enforces correct ref usage per context

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-considerations.test.ts` — consideration compilation + scope validation tests
2. Update existing `compile-agents-authoring.test.ts` tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern compile-considerations` — targeted
2. `pnpm -F @ludoforge/engine test` — full suite
3. `pnpm turbo typecheck`
