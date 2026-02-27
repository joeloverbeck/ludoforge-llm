# ENGINEARCH-098: Effect Context Authority Constructor Hardening

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel effect-context construction points + guard tests
**Deps**: archive/tickets/ENGINEARCH-097-cross-seat-choice-probe-authority-decoupling.md

## Problem

`decisionAuthority` is now required in `EffectContext`, but call sites build context objects inline. This makes the contract easy to miss during future edits and increases risk of piecemeal regressions.

## Assumption Reassessment (2026-02-27)

1. Confirmed: all top-level runtime `applyEffects` entry points still construct `EffectContext` inline (`apply-move`, lifecycle, triggers, event execution, initial state, legal choices).
2. Confirmed: `decisionAuthority` is mandatory in `EffectContext`, but constructor wiring is duplicated across entry points with repeated literal fields.
3. Corrected mismatch: there is no canonical production constructor in `effect-context.ts`; only test-side helpers currently centralize defaults.
4. Corrected dependency reference: prerequisite ticket `ENGINEARCH-097` is completed and archived.
5. Corrected scope: introduce kernel runtime constructors in production code and add dedicated source-contract coverage for constructor usage, instead of adding checks to helper-utility tests.

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

Add dedicated source-contract tests to assert runtime entry points construct contexts via canonical helpers and preserve explicit authority behavior.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/initial-state.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` (add)

## Out of Scope

- Choice binding token protocol.
- Any game-specific behavior changes.

## Acceptance Criteria

### Tests That Must Pass

1. Effect-context construction no longer duplicates mandatory authority wiring across top-level runtime entry points.
2. Contract tests fail if runtime entry points bypass canonical effect-context constructors.
3. Contract tests fail if mandatory `decisionAuthority` defaults are removed from runtime constructors.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every effect execution path has explicit engine-owned authority provenance.
2. Context construction remains game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — enforces constructor usage at production runtime entry points and authority defaults in constructor implementations.
2. `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` — enforces constructor-based mode threading at runtime `applyEffects` boundaries.
3. `packages/engine/test/unit/effect-context-test-helpers.test.ts` — keeps test helper contract aligned with runtime context shape.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
3. `node --test packages/engine/dist/test/unit/effect-context-test-helpers.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Added canonical runtime constructors in `effect-context.ts`: `createExecutionEffectContext` and `createDiscoveryEffectContext`.
  - Migrated top-level runtime `applyEffects` entry points to constructor-based context creation in:
    - `apply-move.ts`
    - `legal-choices.ts`
    - `initial-state.ts`
    - `phase-lifecycle.ts`
    - `trigger-dispatch.ts`
    - `event-execution.ts`
  - Added source-contract coverage in `effect-context-construction-contract.test.ts` for constructor usage and authority defaults.
  - Updated `effect-mode-threading-guard.test.ts` to enforce constructor-based mode threading (instead of inline `mode` literals).
  - Strengthened `effect-context-test-helpers.test.ts` with explicit `decisionAuthority` default assertions.
- **Deviations from original plan**:
  - Instead of changing `kernel-source-ast-guard.test.ts` (helper utility tests), added a dedicated production architecture guard and updated an existing architecture guard to match constructor-based wiring.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js packages/engine/dist/test/unit/effect-context-test-helpers.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (310 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅
