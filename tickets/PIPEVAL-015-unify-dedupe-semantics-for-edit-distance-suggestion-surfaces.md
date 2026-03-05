# PIPEVAL-015: Unify dedupe semantics for edit-distance suggestion surfaces

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contracts behavior normalization + tests
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-010-consolidate-edit-distance-contract-utility.md`

## Problem

Suggestion surfaces currently diverge on duplicate-candidate handling: binding identifier alternatives dedupe before ranking, while missing-reference alternatives do not. This inconsistency weakens the shared-contract architecture and can produce duplicate diagnostics output.

## Assumption Reassessment (2026-03-05)

1. `rankBindingIdentifierAlternatives` deduplicates with `new Set(inScope)` before ranking.
2. `findReferenceAlternatives` ranks `validValues` directly and can return duplicate alternatives when duplicate inputs appear.
3. No active ticket currently standardizes dedupe semantics across edit-distance suggestion surfaces.

## Architecture Check

1. A single dedupe policy at shared utility boundary is cleaner and more extensible than per-consumer divergence.
2. This is generic contract behavior and does not add game-specific rules into GameDef/runtime/simulation.
3. No backwards-compatibility aliases/shims: consumers are normalized to one canonical ranking contract.

## What to Change

### 1. Centralize dedupe behavior in shared ranking path

Define and implement canonical dedupe semantics in `edit-distance-contract.ts` (or a dedicated shared helper used by both consumers).

### 2. Normalize both suggestion consumers

Apply canonical dedupe behavior for both missing-reference and binding-identifier alternatives without introducing consumer-specific drift.

### 3. Add parity tests

Add/extend tests proving duplicate candidate inputs produce deterministic, non-duplicated alternatives in both consumers.

## Files to Touch

- `packages/engine/src/contracts/edit-distance-contract.ts` (modify)
- `packages/engine/src/contracts/missing-reference-diagnostic-contract.ts` (modify)
- `packages/engine/src/contracts/binding-identifier-contract.ts` (modify, if needed for parity)
- `packages/engine/test/unit/contracts/missing-reference-diagnostic-contract.test.ts` (modify)
- `packages/engine/test/unit/contracts/binding-identifier-contract.test.ts` (modify)
- `packages/engine/test/unit/contracts/edit-distance-contract.test.ts` (modify/add, if PIPEVAL-014 lands first)

## Out of Scope

- Rewriting diagnostic messages
- Changing ranking distance algorithm itself
- Any GameSpecDoc/visual-config/runtime behavior work

## Acceptance Criteria

### Tests That Must Pass

1. Missing-reference alternatives are deterministic and duplicate-free with duplicate candidate input.
2. Binding-identifier alternatives retain deterministic and duplicate-free behavior under same canonical policy.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Shared edit-distance utilities own dedupe + ranking semantics for suggestion surfaces.
2. No game-specific branching is introduced into agnostic engine layers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/missing-reference-diagnostic-contract.test.ts` — add duplicate-input coverage and assert dedupe invariants.
2. `packages/engine/test/unit/contracts/binding-identifier-contract.test.ts` — keep parity assertions under canonical dedupe policy.
3. `packages/engine/test/unit/contracts/edit-distance-contract.test.ts` — lock dedupe/ranking canonical behavior at utility boundary.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/contracts/missing-reference-diagnostic-contract.test.js packages/engine/dist/test/unit/contracts/binding-identifier-contract.test.js packages/engine/dist/test/unit/contracts/edit-distance-contract.test.js`
3. `pnpm turbo test --force`
