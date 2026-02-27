# ENGINEARCH-098: Effect Context Authority Constructor Hardening

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel effect-context construction points + guard tests
**Deps**: tickets/ENGINEARCH-097-cross-seat-choice-probe-authority-decoupling.md

## Problem

`decisionAuthority` is now required in `EffectContext`, but call sites build context objects inline. This makes the contract easy to miss during future edits and increases risk of piecemeal regressions.

## Assumption Reassessment (2026-02-27)

1. Multiple kernel entry points construct `EffectContext` literals (`apply-move`, lifecycle, triggers, event execution, initial state, legal choices).
2. Type-checking catches missing fields when object literals are typed, but misses are still easy during refactors and can surface late.
3. Mismatch: critical invariant exists but is not centralized. Corrected scope: provide canonical context-construction helpers and guard tests.

## Architecture Check

1. Central constructors reduce duplication and enforce one authoritative contract for effect execution context.
2. This is runtime-generic and game-agnostic; no GameSpecDoc game-specific coupling.
3. No backward compatibility shims; internal refactor to single canonical construction path.

## What to Change

### 1. Introduce context-construction helpers

Add kernel-internal helpers for creating execution/discovery effect contexts with mandatory authority fields.

### 2. Migrate inline object-literal call sites

Replace duplicated inline construction with helper usage across apply/lifecycle/trigger/event/setup paths.

### 3. Add contract guard coverage

Add/extend source-contract tests to assert authority is present in context construction paths.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/initial-state.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/test/unit/kernel-source-ast-guard.test.ts` (modify/add)

## Out of Scope

- Choice binding token protocol.
- Any game-specific behavior changes.

## Acceptance Criteria

### Tests That Must Pass

1. Effect-context construction no longer duplicates mandatory authority wiring across entry points.
2. Contract tests fail if mandatory authority fields are omitted in execution context builders.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every effect execution path has explicit engine-owned authority provenance.
2. Context construction remains game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel-source-ast-guard.test.ts` — verifies authority field presence in effect-context construction contracts.
2. `packages/engine/test/unit/effect-context-test-helpers.test.ts` — keeps helper contract aligned with runtime context shape.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel-source-ast-guard.test.js`
3. `node --test packages/engine/dist/test/unit/effect-context-test-helpers.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
