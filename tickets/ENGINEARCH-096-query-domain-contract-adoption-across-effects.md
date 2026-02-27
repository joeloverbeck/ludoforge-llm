# ENGINEARCH-096: Adopt Query-Domain Contracts Across Compiler Effect Entry Points

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — CNL effect validation contracts and targeted diagnostics
**Deps**: specs/51-cross-game-primitive-elevation.md, tickets/ENGINEARCH-094-query-domain-contract-exhaustiveness.md

## Problem

`distributeTokens` now enforces query-domain contracts at compile time, but other effect entry points that consume `OptionsQuery` (`chooseOne`, `chooseN`, `forEach`, `reduce`, `evaluateSubset`, and related composites) still accept broader domains and defer some mismatches to runtime or downstream failures. This creates uneven safety guarantees and weaker compiler feedback.

## Assumption Reassessment (2026-02-27)

1. Domain-contract enforcement currently exists for `distributeTokens` but is not consistently applied across all query-consuming effect forms.
2. Shared query-domain inference now exists in kernel and can be reused by compiler effect lowerers without game-specific branching.
3. Mismatch: compiler guarantees are inconsistent by effect; corrected scope introduces explicit, effect-specific domain contracts with diagnostics.

## Architecture Check

1. Uniform compile-time contracts across effect entry points are cleaner than mixed compile/runtime enforcement.
2. Contracts are generic to query/effect semantics and preserve GameSpecDoc game-specific data boundaries while keeping GameDef/runtime agnostic.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Define effect-level domain requirements

Document and enforce expected query domains per effect form (for example token-only, zone-only, or domain-agnostic where intentional).

### 2. Apply validation in compiler lowering

Integrate shared query-domain inference into relevant lowerers (`chooseOne`, `chooseN`, `forEach`, `reduce`, `evaluateSubset`, and any composite wrappers) with targeted diagnostics.

### 3. Add comprehensive contract tests

Add compiler tests for valid and invalid domains per affected effect, including recursive query composition cases.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/effects-runtime.test.ts` (modify if needed for parity assertions)

## Out of Scope

- Runtime coercion/fallback for malformed authored specs.
- Game-specific exceptions.

## Acceptance Criteria

### Tests That Must Pass

1. Each query-consuming effect has explicit compile-time domain behavior (enforced or intentionally agnostic).
2. Invalid domains are rejected with targeted diagnostics at compile time where contracts require.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Query-domain contracts are centralized and reusable, not duplicated per game.
2. GameDef/simulator remain game-agnostic with no game-specific branching in validation logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — per-effect domain contract matrix (valid/invalid + diagnostics).
2. `packages/engine/test/unit/effects-runtime.test.ts` — parity checks where compile-time constraints replace previously runtime-only failures.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --coverage=false`
2. `pnpm -F @ludoforge/engine test`
