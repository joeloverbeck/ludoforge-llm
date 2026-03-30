# 95POLGUIMOVCOM-011: Centralize owner-qualified zone address construction for policy and selector runtimes

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime zone-address helper, selector resolution, agents policy-eval
**Deps**: archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-004.md

## Problem

The guided-completion work exposed a broader architectural weakness in zone addressing: policy evaluation reconstructs owner-qualified zone ids ad hoc, while the kernel already has selector/runtime logic that understands the canonical `zoneBase:owner` convention.

Today:

- `initial-state.ts` materializes `state.zones` from declared zone ids
- `resolve-selectors.ts` constructs owner-qualified ids like `${zoneBase}:none` and `${zoneBase}:${playerId}`
- `policy-eval.ts` currently reconstructs `${resolvedZone}:${ownerSuffix}` inside `evaluateZoneTokenAggregate`

This means the owner-qualified zone-address contract is duplicated instead of owned in one place. That duplication is exactly the kind of cross-layer drift Foundations #8 and #10 warn against. If zone addressing changes, policy evaluation can silently diverge from selector/runtime truth.

## Assumption Reassessment (2026-03-30)

1. `packages/engine/src/kernel/resolve-selectors.ts` already treats owner-qualified zones as a canonical runtime shape, constructing `zoneBase:none` and `zoneBase:${playerId}` values directly inside runtime selector resolution. Confirmed.
2. `packages/engine/src/agents/policy-eval.ts` currently rebuilds the owner-qualified zone id locally inside `evaluateZoneTokenAggregate` instead of calling shared kernel logic. Confirmed.
3. `packages/engine/src/kernel/initial-state.ts` keys `state.zones` from declared `def.zones` ids, so the owner-qualified runtime key shape is a kernel concern, not a policy-only concern. Confirmed.
4. No active ticket in `tickets/` currently owns this cleanup. `005`, `007`, and `008` are about completion refs, scoring, and callback wiring; `010` is about policy vocabulary drift, not runtime zone-address construction. Confirmed.
5. Mismatch correction: the selector regression coverage does not live in `packages/engine/test/unit/kernel/resolve-selectors.test.ts`; the active file is `packages/engine/test/unit/resolve-selectors.test.ts`. Any ticketed test plan should target the actual unit file path.
6. Mismatch correction: this issue should not be folded into `007`, `008`, or `009`. It is a separate generic contract-centralization task.

## Architecture Check

1. Cleanest approach: create one small kernel-owned helper/module for runtime owner-qualified zone-address construction, then make both selector/runtime code and policy evaluation consume it. The helper should own string construction only; selector parsing and authored-zone compilation stay where they already belong.
2. Engine agnosticism is preserved because the helper encodes only the generic zone-address contract already implied by kernel selector behavior. No game-specific identifiers or branching belong there.
3. No backwards-compatibility shims: the codebase should move to one canonical zone-address helper and delete duplicated string-building logic rather than layering aliases.
4. This ticket complements, but does not duplicate, ticket `010`. `010` centralizes policy vocabulary tables; this ticket centralizes runtime zone-address construction semantics.
5. Architectural note: the authored/compiler-side zone canonicalization in `packages/engine/src/cnl/compile-zones.ts` is a separate concern from runtime lookup. Do not broaden this ticket into a compiler refactor unless implementation exposes a real shared abstraction that improves both sides without forcing selector/runtime concepts upward.

## What to Change

### 1. Add a kernel-owned zone-address helper

Create a focused helper module that owns the canonical logic for constructing runtime owner-qualified zone ids from:

- a zone base id
- a resolved owner token (`none` or concrete player id) after the caller has handled policy/runtime-specific indirection such as `self`, `active`, or selector parsing

Keep the helper narrow and declarative. It should not absorb full selector parsing, broader query resolution, or compiler-side authored zone normalization.

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
- `packages/engine/test/unit/resolve-selectors.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)

## Out of Scope

- Changing the authored `zoneTokenAgg` expression surface
- Changing `state.zones` storage shape away from owner-qualified ids
- Completion-guidance callback wiring or evaluator implementation (`007` / `008`)
- Policy vocabulary-table centralization (`010`)
- Broad selector parsing refactors unrelated to zone-address ownership

## Acceptance Criteria

### Tests That Must Pass

1. New/updated unit test: selector resolution for owned/unowned zone selectors still resolves the same canonical zone ids through the shared runtime helper path.
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
2. `packages/engine/test/unit/resolve-selectors.test.ts` — add regression coverage for shared runtime zone-address construction.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/resolve-selectors.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine typecheck`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completed: 2026-03-30
- What changed:
  - Added `packages/engine/src/kernel/zone-address.ts` as the single runtime helper for owner-qualified zone-id construction.
  - Updated `packages/engine/src/kernel/resolve-selectors.ts` and `packages/engine/src/agents/policy-eval.ts` to consume that helper instead of rebuilding zone ids ad hoc.
  - Hardened `policy-eval` so unsupported `zoneTokenAgg.owner` literals now resolve to `unknown` instead of fabricating impossible runtime zone ids.
  - Corrected this ticket's stale selector-test path assumptions before implementation.
  - Added regression coverage in `packages/engine/test/unit/resolve-selectors.test.ts` and `packages/engine/test/unit/agents/policy-eval.test.ts`.
- Deviations from original plan:
  - Kept the helper intentionally narrow to runtime zone-address construction only; selector parsing and compiler-side zone canonicalization were not refactored into it.
  - Reused the existing `packages/engine/test/unit/resolve-selectors.test.ts` coverage file instead of introducing a new kernel-specific selector test file.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/resolve-selectors.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`
