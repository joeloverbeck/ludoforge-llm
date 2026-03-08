# FITLEVENTARCH-015: Add behavior-level regression coverage for non-event admission contexts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — legal-move behavior regression tests only
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-012-unify-legal-move-admission-policy-surface-across-callsites.md, tickets/FITLEVENTARCH-014-centralize-missing-binding-policy-context-identifiers.md

## Problem

Current coverage strongly validates helper contracts and source-shape architecture, but behavior-level legal-move tests are event-heavy. Non-event admission contexts (pipeline and free-operation unresolved paths) do not yet have dedicated end-to-end legal-move regression tests for defer-vs-throw semantics at enumeration level.

## Assumption Reassessment (2026-03-08)

1. `legal-moves.ts` and `legal-moves-turn-order.ts` now route unresolved admission through canonical helper with explicit non-event contexts.
2. Existing tests cover helper semantics and callsite source-shape contracts, but direct behavior assertions for pipeline/free-operation unresolved admission are limited.
3. Mismatch + correction: add behavior-level legal-move tests for pipeline/free-operation contexts to catch runtime regressions not visible in AST guards.

## Architecture Check

1. Behavior-level tests complement source-shape guards and produce stronger long-term robustness for policy evolution.
2. This work is pure test hardening for game-agnostic kernel behavior; no game-specific runtime logic is introduced.
3. No backwards-compatibility aliases/shims are added; tests assert canonical policy semantics only.

## What to Change

### 1. Add pipeline admission behavior tests

Add legal-moves tests that exercise unresolved pipeline decision probing and assert:
- deferrable missing-binding path remains admitted (candidate present)
- non-deferrable path throws (fail-fast)

### 2. Add free-operation admission behavior tests

Add legal-moves tests covering unresolved free-operation variant path and assert:
- deferrable missing-binding path remains admitted for free-operation candidate generation
- non-deferrable path throws in legal-move enumeration

## Files to Touch

- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- Kernel policy logic changes
- Missing-binding context taxonomy changes
- GameSpecDoc or visual-config data edits

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline unresolved legal-move admission behavior is directly validated at legal-moves layer for defer-vs-throw outcomes.
2. Free-operation unresolved admission behavior is directly validated at legal-moves layer for defer-vs-throw outcomes.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Legal-move admission remains deterministic and fail-fast outside deferrable contexts.
2. Kernel/simulator behavior remains game-agnostic and independent from game-specific presentation data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add pipeline unresolved admission behavior test pair (admit deferrable, throw non-deferrable).
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add free-operation unresolved admission behavior test pair (admit deferrable, throw non-deferrable).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
