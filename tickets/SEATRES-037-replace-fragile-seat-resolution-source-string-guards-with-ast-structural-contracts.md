# SEATRES-037: Replace fragile seat-resolution source-string guards with AST structural contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unit-test architecture guard hardening for seat-resolution lifecycle contracts
**Deps**: archive/tickets/SEATRES/SEATRES-035-remove-implicit-seat-resolution-context-fallback-from-active-seat-invariants.md

## Problem

Recent lifecycle architecture guards rely on exact source-string snippets. This is brittle and can fail on harmless formatting/identifier changes while missing true contract regressions if equivalent text still appears. The guard intent should be structural (AST-level), not formatting-coupled.

## Assumption Reassessment (2026-03-02)

1. Current guards in `kernel/legal-moves.test.ts` and `phase-advance.test.ts` use `expressionToText(...).includes(...)` with exact call-string fragments.
2. `kernel/turn-flow-runtime-invariants.test.ts` uses direct regex checks against source text for forbidden patterns.
3. Existing active tickets do not explicitly cover making these new lifecycle guards resilient to non-semantic refactors.

## Architecture Check

1. AST-structural assertions (call target + argument identity + signature shape) are more robust and maintainable than text-snippet matching.
2. This is test-contract hardening only and keeps runtime/kernel game-agnostic boundaries unchanged.
3. No compatibility paths: old string-fragile guard style is replaced, not kept in parallel.

## What to Change

### 1. Convert seat-resolution lifecycle guards to structural AST assertions

1. In affected tests, resolve target call expressions and assert argument shapes/identifiers via helper functions.
2. Remove strict substring/regex assertions that couple to formatting.
3. Add helper utilities only where needed to express contract checks clearly.

### 2. Keep guard intent explicit and narrow

1. Assert the architectural contract directly (explicit context threading at operation boundaries; no implicit fallback creation).
2. Avoid over-broad source-level checks that can false-fail unrelated changes.

## Files to Touch

- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify)
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify only if minimal helper extension is needed)

## Out of Scope

- Runtime behavior changes in kernel flow logic
- Seat-resolution API redesign
- Compiler/validator/runner changes

## Acceptance Criteria

### Tests That Must Pass

1. Lifecycle architecture guards pass across harmless formatting/identifier refactors while still failing on true contract regressions.
2. Guard coverage still enforces explicit context threading and no implicit active-seat fallback creation.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Architecture guards validate structure/semantics, not source formatting.
2. Guard assertions remain deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — replace string-includes guard checks with AST-structural assertions for context-threaded calls.
2. `packages/engine/test/unit/phase-advance.test.ts` — replace string-includes coup-loop guard checks with structural call-shape assertions.
3. `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` — replace/limit regex checks in favor of structural signature/import/call-contract assertions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
