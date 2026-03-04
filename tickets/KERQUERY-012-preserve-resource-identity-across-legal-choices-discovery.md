# KERQUERY-012: Preserve resource identity across legal-choices discovery

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — legal-choices discovery context resource propagation
**Deps**: archive/tickets/KERQUERY/KERQUERY-008-operation-scoped-eval-resources-and-query-cache-threading.md, packages/engine/src/kernel/legal-choices.ts, packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/effect-context.ts

## Problem

`legal-choices` discovery currently reconstructs runtime resources from eval-context collector/cache each time instead of propagating one stable resource identity through discovery effect evaluations. Behavior is currently correct, but identity continuity is implicit and avoidably lossy for future diagnostics/ownership invariants.

## Assumption Reassessment (2026-03-04)

1. Eval/effect contexts now use operation resources as canonical ownership containers.
2. `legal-choices` discovery still wraps collector/cache into a new resources object per discovery context build.
3. No active ticket currently addresses identity continuity in this path.

## Architecture Check

1. Propagating one resources identity through discovery is cleaner than repeatedly reconstructing wrappers.
2. This improves ownership clarity without introducing any game-specific data paths.
3. No compatibility aliases/shims: move directly to canonical propagation.

## What to Change

### 1. Thread stable resources identity through legal-choices discovery

1. Extend eval-context surface to carry optional `resources` identity where needed.
2. Update `legal-choices` discovery context builder to reuse provided identity rather than recreating wrappers.

### 2. Keep context construction deterministic

1. Ensure strict/probe discovery branches share the same resources object within one discovery operation.
2. Avoid creating new collector/cache wrappers in hot discovery paths.

### 3. Add identity-focused contract tests

1. Add tests locking resource identity continuity in legal-choices discovery.
2. Preserve current legality/probe behavior and outputs.

## Files to Touch

- `packages/engine/src/kernel/eval-context.ts` (modify if needed)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/legal-choices.test.ts` (modify/add)

## Out of Scope

- Query cache API encapsulation (`KERQUERY-009`)
- Trigger-dispatch API shape changes (`KERQUERY-010`)
- Bootstrap lifecycle threading (`KERQUERY-011`)
- Any game-specific rule logic

## Acceptance Criteria

### Tests That Must Pass

1. Legal-choices discovery reuses one resources identity through strict/probe discovery evaluations.
2. Existing legal-choices behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Resource identity continuity is explicit in discovery flows.
2. Runtime remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/legal-choices.test.ts` — verify resources identity continuity and behavioral parity.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/legal-choices.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
