# TOKFILAST-039: CNL Predicate Canonical Shape — Strict Alias-Key Rejection

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL predicate object shape validation
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-034-cnl-predicate-operator-single-source-and-no-alias-shorthand.md

## Problem

CNL lowering no longer uses alias keys as fallbacks, but mixed payloads that include canonical keys plus alias keys (for example `{ op: "eq", value: 1, eq: 1 }`) are still accepted silently. This leaves a non-fail-closed alias path and weakens no-alias contract enforcement.

## Assumption Reassessment (2026-03-06)

1. `lowerTokenFilterEntry` and `lowerAssetRowFilterEntry` now require canonical `op` + `value` for lowering.
2. Current implementation does not reject extra alias keys (`eq`/`neq`/`in`/`notIn`) when canonical fields are present.
3. Existing tests cover alias-only rejection, but not mixed canonical+alias payload rejection.

## Architecture Check

1. Strict object-shape enforcement is cleaner and more robust than permissive parsing with ignored legacy keys.
2. This is CNL compiler contract hardening only; `GameDef` and runtime/simulator remain game-agnostic.
3. No backwards-compatibility aliasing/shims are introduced; authored payloads must be canonical.

## What to Change

### 1. Reject alias keys whenever canonical predicate shape is used

In token-filter and `assetRows.where` lowering, emit deterministic diagnostics when alias keys are present, even if canonical `op` and `value` exist.

### 2. Keep diagnostics deterministic and canonical-contract focused

Ensure diagnostics continue pointing to stable predicate paths and list canonical alternatives only.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify, if effect-local filter shapes need rejection assertions)

## Out of Scope

- Runtime predicate evaluation semantics.
- Predicate-op literal ownership policy tests (`tickets/TOKFILAST-035-predicate-operator-literal-ownership-policy-guard.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Mixed canonical+alias token-filter payloads are rejected deterministically.
2. Mixed canonical+alias `assetRows.where` predicates are rejected deterministically.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. CNL predicate contracts are fail-closed and canonical-only.
2. Game-specific behavior remains encoded in `GameSpecDoc`/assets, not compiler/runtime branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — add mixed canonical+alias rejection cases for token filters and `assetRows.where`.
2. `packages/engine/test/unit/compile-effects.test.ts` — add mixed canonical+alias rejection case for effect-local token filters (if not already covered by shared query paths).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
