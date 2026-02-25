# ENGINEARCH-017: Add Runtime Regression Coverage for Newly Typed EvalError Context Codes

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — eval-error runtime tests for structured context preservation
**Deps**: ENGINEARCH-014

## Problem

Recent context typing hardening added stricter compile-time contracts for several eval-error codes, but runtime tests do not yet explicitly verify these structured payloads remain stable under constructor/helper usage.

## Assumption Reassessment (2026-02-25)

1. Compile-time coverage exists in `types-foundation.test.ts` for new structured context constraints.
2. `eval-error.test.ts` currently has stronger runtime checks for `SELECTOR_CARDINALITY`, but only baseline code checks for some other typed codes.
3. No dedicated runtime assertions currently validate context payload persistence for `QUERY_BOUNDS_EXCEEDED`, `DIVISION_BY_ZERO`, and `ZONE_PROP_NOT_FOUND` helper constructors.

## Architecture Check

1. Runtime assertions complement compile-time checks and prevent silent regressions in error constructor plumbing.
2. This remains game-agnostic infrastructure hardening.
3. No compatibility layers; this is direct contract verification.

## What to Change

### 1. Expand eval-error runtime tests for structured context codes

Add assertions that constructor helpers preserve required context fields for:
- `QUERY_BOUNDS_EXCEEDED`
- `DIVISION_BY_ZERO`
- `ZONE_PROP_NOT_FOUND`

### 2. Validate guard and formatting behavior parity

Ensure code guards and message formatting continue to behave as expected with structured context payloads.

## Files to Touch

- `packages/engine/test/unit/eval-error.test.ts` (modify)

## Out of Scope

- Additional error-code type-map expansion
- Kernel behavior changes outside error construction/testing
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Runtime tests assert structured context fields are present and correct for newly typed codes.
2. Existing eval error guards remain behaviorally unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Typed contracts are validated at both compile-time and runtime test layers.
2. Game-agnostic error semantics remain deterministic and unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-error.test.ts` — add runtime payload assertions for newly typed eval-error constructors.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-error.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
