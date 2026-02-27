# ENGINEARCH-084: Free-Operation Sequence Viability Diagnostics and Authoring Guardrails

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiler diagnostics and optional runtime observability for grant sequencing
**Deps**: specs/17-fitl-turn-sequence-eligibility-and-card-flow.md

## Problem

Ordered free-operation grants (`sequence.chain`/`step`) can be authored in ways that deadlock later steps when earlier grants are not currently legal. The compiler/runtime currently do not surface this risk clearly.

## Assumption Reassessment (2026-02-27)

1. Sequence ordering is enforced strictly at runtime.
2. Zone/action legality for earlier grants can block access to later grants indefinitely.
3. Mismatch: authoring flow lacks robust diagnostics for likely deadlocks; corrected scope is to add static diagnostics and runtime trace hints.

## Architecture Check

1. Diagnostics-first guardrails are cleaner than card-by-card manual fixes after regressions.
2. This is game-agnostic: checks analyze generic grant semantics, not FITL-specific content.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Static compiler diagnostics

Detect obviously risky sequence chains (for example disjoint/over-constrained zone filters or action sets that can make earlier steps inapplicable).

### 2. Runtime trace observability

Add trace/diagnostic entries that explicitly indicate sequence blocking causes during legality scans.

### 3. Tests

Add unit/integration tests that assert diagnostics and runtime trace behavior for blocked sequences.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Changing legal sequence semantics themselves.
- Game-specific special-casing for individual cards.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler emits diagnostics for known deadlock-prone sequencing patterns.
2. Runtime trace surfaces sequence-block reasons when grants exist but are inaccessible.
3. Existing suite: `npm run test`

### Invariants

1. Free-operation semantics remain game-agnostic and deterministic.
2. Diagnostics do not require game-specific ids or branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — sequence viability diagnostics.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — blocked-sequence observability.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — end-to-end sequence block coverage.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/unit/**/*.test.js"`
2. `npm run test`
