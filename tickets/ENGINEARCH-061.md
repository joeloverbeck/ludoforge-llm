# ENGINEARCH-061: Enforce fail-fast scoped-write invariants and canonicalize invalid-write diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-var write invariant/error handling
**Deps**: none

## Problem

Current scoped-write internals include an impossible-branch fallback that returns state branches unchanged instead of failing fast, and constructor-level invalid write diagnostics currently throw a raw `TypeError`. Both weaken invariant enforcement consistency in the kernel write path.

## Assumption Reassessment (2026-02-26)

1. `ScopedVarWrite` is now a strict discriminated union (`zone -> number`, `global|pvar -> VariableValue`) in `scoped-var-runtime-access.ts`.
2. `writeScopedVarToBranches` currently has an "exhaustive" fallback that returns `branches` unchanged if reached via unsafe runtime input.
3. `toScopedVarWrite(...)` currently throws `TypeError` for `zone`+non-number instead of canonical kernel diagnostic shape.
4. **Mismatch + correction**: invariant breaches in scoped-write runtime paths should fail fast with canonical kernel diagnostics, never degrade to silent no-op behavior.

## Architecture Check

1. Fail-fast invariant enforcement is cleaner and more robust than silent fallback because invalid states become immediately observable and debuggable.
2. Canonical kernel diagnostics for invalid write construction keep error semantics consistent across engine internals.
3. This is fully game-agnostic kernel hardening; no GameSpecDoc/GameDef or visual-config coupling is introduced.
4. No backwards-compatibility shims or alias paths are introduced.

## What to Change

### 1. Replace no-op exhaustive fallback with hard invariant failure

Update `writeScopedVarToBranches` so any impossible endpoint-shape runtime path throws immediately instead of returning unchanged branches.

### 2. Canonicalize invalid scoped-write constructor diagnostics

Refactor `toScopedVarWrite(...)` invalid-input handling (`zone` + non-number) to use canonical kernel error signaling instead of raw `TypeError`.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify only if constructor error-code threading requires call-site metadata)

## Out of Scope

- New variable effect features
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Impossible scoped-write runtime shape paths throw hard invariant errors (no silent state no-op fallback).
2. Invalid constructor writes (`zone` endpoint with non-number payload) emit canonical kernel diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped-write helper boundaries remain strictly scope/value-coupled.
2. Kernel invariant violations fail fast and deterministically with consistent diagnostics.
3. Runtime/contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add runtime invariant/error-path assertions for constructor and branch writer hard-fail behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
