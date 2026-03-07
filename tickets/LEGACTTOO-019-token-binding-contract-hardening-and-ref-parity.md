# LEGACTTOO-019: Token Binding Contract Hardening and Ref Parity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel reference resolution (`resolve-ref.ts`) and unit coverage
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-017-choice-token-binding-fidelity-for-token-refs.md

## Problem

`resolveRef` token binding validation is still too permissive: object values with `props` can be treated as `Token` even when token identity fields are invalid or missing. This can produce misleading downstream errors and weakens runtime contract clarity for token references.

## Assumption Reassessment (2026-03-07)

1. `resolve-ref.ts` currently checks token-like objects via `isTokenBinding(value) => 'props' in value`, which is broader than the canonical `Token` shape. **Confirmed in `packages/engine/src/kernel/resolve-ref.ts`.**
2. `tokenProp` and `tokenZone` now both accept token-id string bindings after LEGACTTOO-017. **Confirmed in `packages/engine/src/kernel/resolve-ref.ts`.**
3. Current tests cover valid token-id and token-object bindings plus missing-token errors, but do not assert malformed token-object rejection paths (for example non-string `id`). **Confirmed in `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts`.**

## Architecture Check

1. Tightening token binding guards makes runtime contracts explicit and fail-fast at the correct boundary (`TYPE_MISMATCH`), improving debuggability and reducing hidden invalid-state propagation.
2. This remains game-agnostic kernel behavior; no game-specific data or branching is introduced.
3. No compatibility alias/shim: malformed token-like bindings become invalid by contract rather than tolerated implicitly.

## What to Change

### 1. Harden token binding shape checks in reference resolution

- Replace permissive token-object guard with strict structural validation of the canonical runtime token minimum (`id: string`, `type: string`, `props: object`).
- Ensure `tokenProp` and `tokenZone` both use the same strict binding validation path.

### 2. Add regression tests for malformed token-like bindings

- Add unit tests proving malformed object bindings fail with deterministic `TYPE_MISMATCH` errors.
- Keep existing valid-path and missing-token-path assertions green.

## Files to Touch

- `packages/engine/src/kernel/resolve-ref.ts` (modify)
- `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` (modify)

## Out of Scope

- Broad token model redesign
- Game data/content changes (GameSpecDoc / visual config)

## Acceptance Criteria

### Tests That Must Pass

1. Malformed token-like bindings for `tokenProp`/`tokenZone` are rejected at binding-validation boundary with `TYPE_MISMATCH`.
2. Existing valid token-id and token-object binding behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Token reference bindings in kernel resolve only from canonical scalar token ids or canonical token objects.
2. Error reporting stays deterministic and game-agnostic for invalid binding shape.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` — add malformed token-object binding rejection assertions for `tokenProp` and `tokenZone`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/resolve-ref-token-bindings.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
