# LEGACTTOO-021: tokenZones Strict Runtime Token-Shape Boundary Parity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel query/effects runtime token binding validation + unit coverage
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-019-token-binding-contract-hardening-and-ref-parity.md

## Problem

`resolve-ref` and effect token bindings were tightened to strict runtime token-shape validation, but `tokenZones` still accepts token-like objects with malformed `id`/`type` and can surface downstream `MISSING_VAR` instead of boundary `TYPE_MISMATCH`. This leaves token binding/error contracts inconsistent across kernel surfaces.

## Assumption Reassessment (2026-03-07)

1. `resolve-ref.ts` token bindings now validate strict runtime token shape via shared helper and reject malformed token-like objects with `TYPE_MISMATCH`. **Confirmed in `packages/engine/src/kernel/resolve-ref.ts` + tests.**
2. `eval-query.ts` `tokenZones` currently classifies token objects via key-presence helper (`id/type/props` present) rather than strict typed shape, and then resolves `String(item.id)`. **Confirmed in `packages/engine/src/kernel/eval-query.ts`.**
3. Current tests assert invalid `tokenZones` source item behavior for non-token domains (for example `zones` strings), but do not assert malformed token-like object source rejection at boundary. **Confirmed in `packages/engine/test/unit/eval-query.test.ts`.**

## Architecture Check

1. Enforcing strict boundary token validation in `tokenZones` aligns all token-consuming runtime entry points to the same fail-fast contract and prevents misleading late failures.
2. This remains game-agnostic runtime behavior; no game-specific ids, rules, or visual concerns are introduced.
3. No backwards-compatibility alias/shim: malformed token-like payloads are invalid by contract.

## What to Change

### 1. Enforce strict runtime token-shape validation in `tokenZones`

- In `eval-query.ts`, accept token object source items only when they pass strict runtime token validation (`id: string`, `type: string`, `props: non-null object`).
- Preserve existing `tokenZones` output semantics, dedupe behavior, and caching behavior.

### 2. Add boundary regression coverage for malformed token-like objects

- Add `eval-query` unit tests proving malformed token-like source items are rejected as `TYPE_MISMATCH` with deterministic context.
- Add missing malformed token-object binding tests for `moveToken` and `destroyToken` (in addition to existing `setTokenProp`) to lock effect-surface parity.

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/effects-lifecycle.test.ts` (modify)

## Out of Scope

- Canonical token-location index redesign (tracked separately)
- Query contract map redesign
- Game data updates (`GameSpecDoc`, visual-config)

## Acceptance Criteria

### Tests That Must Pass

1. `tokenZones` rejects malformed token-like objects at source boundary with `TYPE_MISMATCH` (not late missing-token errors).
2. `moveToken`, `destroyToken`, and `setTokenProp` consistently reject malformed token-object bindings at effect runtime boundary.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Runtime token object acceptance uses strict canonical shape at token-binding boundaries.
2. Query/effect/reference token-binding diagnostics stay deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — malformed token-like item in `tokenZones.source` yields boundary `TYPE_MISMATCH`.
2. `packages/engine/test/unit/effects-lifecycle.test.ts` — malformed token-object binding rejection tests for `moveToken` and `destroyToken`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js`
3. `node --test packages/engine/dist/test/unit/effects-lifecycle.test.js`
4. `pnpm -F @ludoforge/engine test:unit`
5. `pnpm -F @ludoforge/engine lint`
