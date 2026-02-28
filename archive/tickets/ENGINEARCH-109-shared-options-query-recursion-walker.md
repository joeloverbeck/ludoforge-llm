# ENGINEARCH-109: Shared `OptionsQuery` Recursion Walker for Contract Inference

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel query traversal utility + inference adoption
**Deps**: specs/51-cross-game-primitive-elevation.md, tickets/ENGINEARCH-108-query-runtime-shape-inference-coverage-hardening.md

## Problem

Leaf query contracts are now centralized, but recursion handling (`concat`, `nextInOrderByCondition`) is still duplicated across inferencers. This duplication can drift when new recursive query forms are added or traversal behavior evolves.

## Assumption Reassessment (2026-02-27)

1. `packages/engine/src/kernel/query-domain-kinds.ts` and `packages/engine/src/kernel/query-runtime-shapes.ts` both contain duplicated recursive traversal logic for `OptionsQuery`.
2. `packages/engine/src/kernel/query-shape-inference.ts` is already a thin adapter that delegates query-shape inference to `query-runtime-shapes.ts`; it does not duplicate recursion.
3. Leaf classification is centralized in `packages/engine/src/kernel/query-kind-contract.ts`, but recursive traversal is not yet centralized.
4. Corrected scope: introduce one shared recursion walker and adopt it in both inferencers that currently recurse directly.

## Architecture Check

1. A shared recursion walker is cleaner and more robust than repeated switch recursion because traversal semantics become single-source and less error-prone.
2. Utility remains strictly game-agnostic and operates only on generic `OptionsQuery` structure, preserving GameSpecDoc/GameDef boundaries.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Introduce shared query traversal utility

Add a kernel utility that walks `OptionsQuery` recursively and applies a callback/reducer over leaf query nodes.

### 2. Adopt utility in inference modules

Refactor domain and runtime-shape inferencers to consume the shared walker so recursive handling is no longer duplicated.

### 3. Add traversal-focused tests

Add/extend tests that lock recursive traversal behavior and parity across both inferencers.

## Files to Touch

- `packages/engine/src/kernel/query-domain-kinds.ts` (modify)
- `packages/engine/src/kernel/query-runtime-shapes.ts` (modify)
- `packages/engine/src/kernel/query-kind-contract.ts` (modify if needed for type exports)
- `packages/engine/src/kernel/query-walk.ts` (new)
- `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` (modify)
- `packages/engine/test/unit/query-shape-inference.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-walk.test.ts` (new)

## Out of Scope

- Introducing new query kinds.
- Any runtime evaluator behavior changes (`eval-query`) beyond traversal utility adoption for inference.

## Acceptance Criteria

### Tests That Must Pass

1. Recursive traversal semantics are defined once and validated by dedicated unit tests.
2. Domain/runtime-shape inferencers use the shared traversal utility and preserve current behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Query inference contracts remain fully game-agnostic and independent from presentation config.
2. Any new recursive `OptionsQuery` form requires explicit handling in a single traversal utility.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-walk.test.ts` — verify traversal order and recursive coverage for nested `concat`/`nextInOrderByCondition`.
2. `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` — ensure domain outputs remain unchanged after walker adoption.
3. `packages/engine/test/unit/query-shape-inference.test.ts` — ensure runtime-shape outputs and dedup behavior remain unchanged after walker adoption.

### Commands

1. `pnpm -F @ludoforge/engine test:unit`
2. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Added `packages/engine/src/kernel/query-walk.ts` with shared recursive leaf traversal utilities (`forEachOptionsQueryLeaf`, `reduceOptionsQueryLeaves`).
  - Refactored `query-domain-kinds.ts` and `query-runtime-shapes.ts` to consume the shared walker instead of duplicating recursive switch logic.
  - Kept leaf contract authority centralized in `query-kind-contract.ts`; updated it to consume the shared `LeafOptionsQuery` type.
  - Added new traversal contract tests in `packages/engine/test/unit/kernel/query-walk.test.ts`.
  - Strengthened recursive inference coverage in `query-domain-kinds.test.ts` and `query-shape-inference.test.ts`.
- **Deviations from original plan**:
  - Corrected scope before implementation: recursion duplication was in `query-runtime-shapes.ts` (not `query-shape-inference.ts`), so runtime-shape inferencer adoption occurred there.
- **Verification results**:
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (includes `dist/test/unit/kernel/query-walk.test.js`).
  - `pnpm -F @ludoforge/engine test` passed.
