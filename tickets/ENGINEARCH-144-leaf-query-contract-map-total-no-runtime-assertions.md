# ENGINEARCH-144: Leaf Query-Contract Map Must Be Total and Assertion-Free

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel query contract typing and failure semantics hardening
**Deps**: archive/tickets/ENGINEARCH-138-optionsquery-recursive-contract-map-remove-structural-heuristics.md

## Problem

`inferLeafOptionsQueryContract` currently relies on a runtime assertion guard even though callers are typed as `LeafOptionsQuery`. This leaves a generic runtime throw path (`Error`) in core contract inference instead of a purely compile-time-total mapping.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-kind-contract.ts` currently performs a runtime assertion (`assertLeafOptionsQueryKindContract`) before reading `domain`/`runtimeShape` from `OPTIONS_QUERY_KIND_CONTRACT_MAP`.
2. `packages/engine/src/kernel/query-kind-map.ts` already owns canonical query-kind metadata, including partition (`leaf`/`recursive`) and leaf contract fields.
3. Mismatch: contract lookup is not yet encoded as a total leaf-only map at compile time. Corrected scope: introduce a leaf-only total contract view keyed by `LeafOptionsQueryKind` and remove runtime assertion paths from leaf contract inference.

## Architecture Check

1. A leaf-only total map is cleaner and more robust than runtime assertion guards because correctness is encoded in type ownership, not runtime checks.
2. This preserves architecture boundaries: GameSpecDoc/visual-config remain game-specific data surfaces, while GameDef/kernel/simulator remain game-agnostic contract evaluators.
3. No backwards-compatibility aliases/shims; migrate inference directly to canonical typed ownership.

## What to Change

### 1. Add leaf-only canonical view

In `query-kind-map.ts`, expose a typed leaf-contract view derived from canonical kind metadata, keyed only by `LeafOptionsQueryKind` with required `domain` and `runtimeShape`.

### 2. Remove runtime assertion path from `inferLeafOptionsQueryContract`

Refactor `query-kind-contract.ts` to consume the leaf-only view directly and eliminate assertion helper + generic runtime throw paths.

### 3. Keep type-only dependency boundaries tight

Where map symbols are used only for type derivation (for example partition type module), use type-only imports to avoid unnecessary runtime coupling.

## Files to Touch

- `packages/engine/src/kernel/query-kind-map.ts` (modify)
- `packages/engine/src/kernel/query-kind-contract.ts` (modify)
- `packages/engine/src/kernel/query-partition-types.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify if additional compile-time assertions are needed)

## Out of Scope

- Query runtime behavior changes in evaluator/walker.
- GameSpecDoc or visual-config schema/content changes.
- Diagnostic taxonomy redesign.

## Acceptance Criteria

### Tests That Must Pass

1. `inferLeafOptionsQueryContract` has no runtime assertion branch and remains total for all `LeafOptionsQueryKind` variants.
2. Any missing leaf-kind contract entry fails compile-time.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Canonical query-kind metadata remains single-source and game-agnostic.
2. Leaf contract inference cannot throw generic runtime assertion errors under typed usage.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-exhaustive.test.ts` — add/strengthen compile-time checks that leaf kinds are fully covered by canonical contract ownership.
2. `packages/engine/test/unit/kernel/query-kind-contract.test.ts` — preserve expected leaf contract outputs after assertion removal.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine typecheck`
3. `node --test packages/engine/dist/test/unit/kernel/query-kind-contract.test.js`
4. `node --test packages/engine/dist/test/unit/types-exhaustive.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
