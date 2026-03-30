# 95POLGUIMOVCOM-011: Centralize owner-qualified zone address construction for policy and selector runtimes

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel zone-address contract/helper, selector resolution, agents policy-eval
**Deps**: archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-004.md

## Problem

The guided-completion work exposed a broader architectural weakness in zone addressing: policy evaluation reconstructs owner-qualified zone ids ad hoc, while the kernel already has selector/runtime logic that understands the canonical `zoneBase:owner` convention.

Today:

- `initial-state.ts` materializes `state.zones` from declared zone ids
- `resolve-selectors.ts` constructs owner-qualified ids like `${zoneBase}:none` and `${zoneBase}:${playerId}`
- `policy-eval.ts` currently reconstructs `${resolvedZone}:${ownerSuffix}` inside `evaluateZoneTokenAggregate`

This means the owner-qualified zone-address contract is duplicated instead of owned in one place. That duplication is exactly the kind of cross-layer drift Foundations #8 and #10 warn against. If zone addressing changes, policy evaluation can silently diverge from selector/runtime truth.

## Assumption Reassessment (2026-03-30)

1. `packages/engine/src/kernel/resolve-selectors.ts` already treats owner-qualified zones as a canonical runtime shape, constructing `zoneBase:none` and `zoneBase:${playerId}` values directly. Confirmed.
2. `packages/engine/src/agents/policy-eval.ts` currently rebuilds the owner-qualified zone id locally inside `evaluateZoneTokenAggregate` instead of calling shared kernel logic. Confirmed.
3. `packages/engine/src/kernel/initial-state.ts` keys `state.zones` from declared `def.zones` ids, so the owner-qualified runtime key shape is a kernel concern, not a policy-only concern. Confirmed.
4. No active ticket in `tickets/` currently owns this cleanup. `005`, `007`, and `008` are about completion refs, scoring, and callback wiring; `010` is about policy vocabulary drift, not runtime zone-address construction. Confirmed.
5. Mismatch correction: this issue should not be folded into `007`, `008`, or `009`. It is a separate generic contract-centralization task.

## Architecture Check

1. Cleanest approach: create one small kernel-owned helper/module for owner-qualified zone address construction and normalization, then make both selector/runtime code and policy evaluation consume it. This is better than leaving string interpolation duplicated across layers.
2. Engine agnosticism is preserved because the helper encodes only the generic zone-address contract already implied by kernel selector behavior. No game-specific identifiers or branching belong there.
3. No backwards-compatibility shims: the codebase should move to one canonical zone-address helper and delete duplicated string-building logic rather than layering aliases.
4. This ticket complements, but does not duplicate, ticket `010`. `010` centralizes policy vocabulary tables; this ticket centralizes runtime zone-address construction semantics.

## What to Change

### 1. Add a kernel-owned zone-address helper

Create a focused helper module that owns the canonical logic for constructing owner-qualified zone ids from:

- a zone base id
- an ownership selector or resolved owner token (`none`, `active`, `self`, concrete player id, or already-resolved player number where appropriate)

Keep the helper narrow and declarative. It should not absorb full selector parsing or broader query resolution.

### 2. Make selector resolution consume the shared helper

Replace direct string interpolation in `resolve-selectors.ts` for:

- `${zoneBase}:none`
- `${zoneBase}:${playerId}`

with the shared kernel helper so selector resolution continues to define the canonical runtime contract, but no longer owns it alone.

### 3. Make policy zone aggregation consume the shared helper

Update `policy-eval.ts` so `evaluateZoneTokenAggregate` resolves the owner-qualified zone id through the same helper instead of reconstructing `${resolvedZone}:${ownerSuffix}` locally.

This keeps guided completion and future policy scoring aligned with kernel runtime truth.

### 4. Add synchronization coverage

Add or strengthen tests that prove:

- selector resolution and policy aggregation resolve the same owner-qualified zone ids
- unowned and player-owned zone variants are treated consistently
- dynamic `zoneTokenAgg.zone` still works after the refactor

## Files to Touch

- `packages/engine/src/kernel/zone-address.ts` (new)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/kernel/resolve-selectors.test.ts` or adjacent selector-contract test file (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)

## Out of Scope

- Changing the authored `zoneTokenAgg` expression surface
- Changing `state.zones` storage shape away from owner-qualified ids
- Completion-guidance callback wiring or evaluator implementation (`007` / `008`)
- Policy vocabulary-table centralization (`010`)
- Broad selector parsing refactors unrelated to zone-address ownership

## Acceptance Criteria

### Tests That Must Pass

1. New/updated unit test: selector resolution for owned/unowned zone selectors uses the shared canonical helper and still resolves the same zone ids.
2. New/updated unit test: `policy-eval` `zoneTokenAgg` resolves the same owner-qualified zone id shape as selector/runtime logic for both static and dynamic zones.
3. New/updated unit test: dynamic `zoneTokenAgg.zone` with `owner: self` and `owner: active` still reads the expected zone entries after the refactor.
4. Existing suite: `pnpm -F @ludoforge/engine test` — all pass.
5. Existing suite: `pnpm -F @ludoforge/engine typecheck` — all pass.
6. Existing suite: `pnpm -F @ludoforge/engine lint` — all pass.

### Invariants

1. Owner-qualified zone id construction has one canonical implementation path, not duplicated string interpolation across selector and policy runtimes.
2. The zone-address helper remains generic and game-agnostic.
3. Guided-completion policy evaluation and kernel selector/runtime logic stay synchronized on the same zone-address contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — extend coverage so policy aggregation proves it uses the same owner-qualified zone-address contract as the kernel.
2. `packages/engine/test/unit/kernel/resolve-selectors.test.ts` or the closest existing selector-resolution contract test — add regression coverage for shared zone-address construction.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/kernel/resolve-selectors.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine typecheck`
5. `pnpm -F @ludoforge/engine lint`
