# ENGINEARCH-094: Exhaustive Query-Domain Contract Enforcement for `OptionsQuery`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel query contract utility and compile-time exhaustiveness guards
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

`inferQueryDomainKinds` currently relies on a broad `default` branch for unhandled `OptionsQuery` variants. That allows newly added query kinds to silently degrade into `'other'` instead of forcing an explicit contract decision, which can drift compiler diagnostics and runtime choice-target behavior over time.

## Assumption Reassessment (2026-02-27)

1. Current `packages/engine/src/kernel/query-domain-kinds.ts` uses a catch-all default branch that maps unknown query kinds to `'other'`.
2. `packages/engine/src/kernel/choice-target-kinds.ts` and `packages/engine/src/cnl/compile-effects.ts` now depend on this shared inference, increasing the blast radius of silent fallback behavior.
3. Mismatch: current behavior is permissive where architecture should be explicit; corrected scope requires exhaustive handling of query variants with type-level compile-time enforcement.

## Architecture Check

1. Exhaustive query-domain handling is cleaner and safer than default-fallback classification because every new query kind must declare its domain contract intentionally.
2. This remains fully game-agnostic: contracts are attached to generic `OptionsQuery` shapes, not game-specific GameSpecDoc content.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Make query-domain inference exhaustive

Refactor `inferQueryDomainKinds` to enumerate all `OptionsQuery` variants explicitly and use a `never`-guard pattern so newly added variants fail compilation until classified.

### 2. Keep semantics explicit per query kind

For each query kind, assign domain output intentionally (`token`, `zone`, or `other`) and avoid implicit fallback paths.

### 3. Harden tests for exhaustiveness-sensitive behavior

Add tests that pin representative variants from each query-family bucket and ensure stable domain classification.

## Files to Touch

- `packages/engine/src/kernel/query-domain-kinds.ts` (modify)
- `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` (modify)

## Out of Scope

- Runtime query execution behavior changes.
- Game-specific query rules.

## Acceptance Criteria

### Tests That Must Pass

1. Query-domain inference has no permissive catch-all path and fails compile-time when new query variants are unclassified.
2. Existing query kinds classify deterministically to intended domain buckets.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Query-domain contracts are explicit and complete for the entire `OptionsQuery` union.
2. GameDef/runtime behavior remains game-agnostic and unchanged for existing query semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` — representative coverage for each `OptionsQuery` family, including recursive/query-composition variants.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --coverage=false`
2. `pnpm -F @ludoforge/engine test`
