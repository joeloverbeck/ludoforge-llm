# ENGINEARCH-092: Sequence Viability Diagnostics with Effective Action Domain Resolution

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiler diagnostics for free-operation sequencing viability
**Deps**: specs/17-fitl-turn-sequence-eligibility-and-card-flow.md

## Problem

Current sequence-risk diagnostics only compare `actionIds` when both adjacent steps explicitly define them. If one step inherits default free-operation action IDs from turn-flow config, risky non-overlap may be missed.

## Assumption Reassessment (2026-02-27)

1. Compiler now emits warnings for duplicate steps, operation-class transitions, explicit non-overlapping action IDs, and zone-filter shifts.
2. Action-domain overlap checks currently skip mixed explicit/default action-id cases.
3. Mismatch: diagnostics exist but do not fully model effective runtime action domains; corrected scope is to resolve explicit/default action domains before overlap checks.

## Architecture Check

1. Diagnostics based on effective runtime domains are more accurate than source-shape-only checks.
2. This remains game-agnostic by using generic turn-flow defaults and grant semantics, not card-specific logic.
3. No compatibility aliases/shims; extend current diagnostics directly.

## What to Change

### 1. Resolve effective sequence action domains

During compile diagnostics, compute each step’s effective action domain (`grant.actionIds` or turn-flow default `freeOperationActionIds`) before overlap checks.

### 2. Improve warning precision

Emit targeted warnings when adjacent sequence steps have disjoint effective action domains, including mixed explicit/default definitions.

### 3. Strengthen tests

Add tests for explicit-vs-default overlap and disjoint cases.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/compile-turn-flow.ts` (modify if context plumbing is needed)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)

## Out of Scope

- Runtime legality changes.
- Card-specific heuristics beyond generic effective-domain overlap.

## Acceptance Criteria

### Tests That Must Pass

1. Diagnostics catch disjoint sequence action domains in explicit/default mixed cases.
2. Diagnostics do not false-positive when effective action domains overlap.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Sequence diagnostics remain warning-level guardrails, not semantic gate changes.
2. Compiler diagnostics stay deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — mixed explicit/default action domain sequence warnings.
2. `packages/engine/test/unit/compile-effects.test.ts` — overlap case without warning.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`
