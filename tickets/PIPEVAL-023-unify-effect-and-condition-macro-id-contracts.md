# PIPEVAL-023: Unify effect and condition macro ID contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL macro-definition validation contract consolidation
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-021-unify-macro-path-segment-contract-between-expansion-and-codec.md`

## Problem

Effect and condition macro ID validation currently diverges in implementation style and constraints ownership. This increases drift risk and weakens long-term contract clarity for macro identifier behavior.

## Assumption Reassessment (2026-03-05)

1. Condition macro expansion validates non-empty IDs in `packages/engine/src/cnl/expand-condition-macros.ts`.
2. Effect macro expansion now validates non-empty IDs in `packages/engine/src/cnl/expand-effect-macros.ts`, but the logic is duplicated and not centralized.
3. Macro IDs are consumed by path contracts (`[macro:<id>]`), so ID invariants should be owned by a shared validator utility.
4. Scope correction: centralize macro ID validation predicate + diagnostics message policy so effect/condition paths cannot drift.

## Architecture Check

1. Shared macro ID validation utility is cleaner than duplicated validators in separate expansion modules.
2. This remains generic CNL compiler infrastructure and preserves game-agnostic kernel/runtime boundaries.
3. No backwards-compatibility aliasing; one canonical ID contract is enforced.

## What to Change

### 1. Add shared macro ID validator utility

Introduce a utility that owns macro ID contract checks (at minimum non-empty/trimmed) with reusable error message text.

### 2. Migrate effect/condition expansion call sites

Route both `expand-effect-macros` and `expand-condition-macros` ID validation through shared utility.

### 3. Add anti-drift tests

Add/adjust tests to lock parity between effect and condition macro ID diagnostics.

## Files to Touch

- `packages/engine/src/cnl/path-utils.ts` (modify) or `packages/engine/src/cnl/macro-id-contract.ts` (new)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/src/cnl/expand-condition-macros.ts` (modify)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)
- `packages/engine/test/unit/expand-condition-macros.test.ts` (modify)

## Out of Scope

- Macro argument constraint semantics
- Macro expansion ordering behavior
- Path codec/source-map algorithm changes

## Acceptance Criteria

### Tests That Must Pass

1. Effect and condition macro ID validation follow one shared contract implementation.
2. ID-invalid diagnostics remain deterministic and test-covered in both expansion paths.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Macro ID validity rules are defined once and consumed by both effect/condition macro systems.
2. GameDef/runtime/simulator remain game-agnostic and free of game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-effect-macros.test.ts` — invalid ID diagnostics remain correct via shared validator.
2. `packages/engine/test/unit/expand-condition-macros.test.ts` — parity check for condition macro invalid ID handling.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-effect-macros.test.js packages/engine/dist/test/unit/expand-condition-macros.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
