# ENGINEARCH-100: Enforce Required `ILLEGAL_MOVE` Context by Reason at Compile Time

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime error typing + illegal-move emitter contracts
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

`illegalMoveError` currently accepts an optional context argument for all illegal-move reasons. This allows call sites to omit reason-required payload fields at compile time, weakening the reason-specific contract and making silent drift possible.

## Assumption Reassessment (2026-02-27)

1. `IllegalMoveContextByReason` defines reason-specific payloads in `runtime-error.ts`, but `illegalMoveError` uses a broad optional `context` parameter.
2. Current implementation relies on a cast (`as IllegalMoveContext<R>`), so type-level enforcement for required fields is incomplete.
3. `apply-move.ts` call sites are already mostly context-complete for reasons that require additional payload fields; the main gap is helper signature permissiveness, not widespread call-site defects.
4. Missing coverage: current tests validate emitted runtime payloads but do not lock compile-time requiredness failures for helper invocations.
5. Mismatch: contract intent is strict per-reason typing, but helper signature still permits missing required context. Corrected scope is compile-time requiredness enforcement at the helper boundary, plus explicit type-contract tests.

## Architecture Check

1. Enforcing required context at the helper boundary is cleaner than relying on runtime checks and broad casts.
2. This remains game-agnostic: only kernel error contracts are tightened; no game-specific branches are introduced.
3. No backwards-compatibility aliasing/shims: move directly to strict reason-aware signatures.

## What to Change

### 1. Make `illegalMoveError` signature reason-strict

Use overloads or conditional tuple parameters so reasons with required context fields must provide them, while reasons with no additional fields stay zero-arg.

### 2. Remove unsafe broad cast path

Eliminate or isolate `as IllegalMoveContext<R>` casts in `illegalMoveError` construction so requiredness is enforced by the type system rather than bypassed.

### 3. Add compile-time and runtime contract guards

Add tests that lock expected helper call shapes and ensure runtime context payloads remain stable.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify only if stricter helper typing reveals a concrete mismatch)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (optional; only if helper tightening changes emitted contexts)

## Out of Scope

- Cross-surface parity expansion (covered separately).
- New illegal-move reasons or semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Call sites cannot compile when required reason context fields are omitted.
2. Existing `ILLEGAL_MOVE` context assertions continue to pass with strict reason-aware payloads.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `ILLEGAL_MOVE` context contracts are enforced at compile time per reason.
2. Kernel/simulator error contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — assert stable reason-specific context contracts and add compile-time guard assertions (`@ts-expect-error`) for missing required reason payloads.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` — keep existing coverage; only update if signature tightening causes emitted-context behavior changes.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- Implemented strict reason-aware `illegalMoveError` overloads so reasons with required payload fields now require context at compile time.
- Added compile-time contract guards in `runtime-error-contracts.test.ts` (`@ts-expect-error` assertions) and retained runtime payload assertions.
- Tightened `legality-outcome.ts` projection helpers with literal-preserving generic return types so downstream call sites keep precise illegal-move reason types.
- `apply-move.ts` did not require behavioral changes; existing call sites remained architecturally valid once reason typing precision was restored.
