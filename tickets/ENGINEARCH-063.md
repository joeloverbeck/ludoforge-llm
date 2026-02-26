# ENGINEARCH-063: Enforce a single public scoped-var write surface and add architecture guardrails

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-var write API surface + effects-var cleanup + guard tests
**Deps**: ENGINEARCH-058, ENGINEARCH-060

## Problem

The runtime currently routes writes through `writeScopedVarsToState`, but branch-level scoped-var writers remain publicly exported and callable by effect modules. This leaves an avoidable drift seam where future changes could bypass the canonical state-write path and fragment scoped write architecture again.

## Assumption Reassessment (2026-02-26)

1. `effects-var.ts` and `effects-resource.ts` currently use `writeScopedVarsToState`, so runtime behavior is already functionally centralized on the batched state writer.
2. `scoped-var-runtime-access.ts` still exports `writeScopedVarToBranches` and `writeScopedVarsToBranches`, which exposes non-canonical write entry points beyond module boundaries.
3. Existing tests cover scoped write correctness but do not enforce an architectural boundary that forbids reintroducing non-canonical write paths in effect modules.
4. **Mismatch + correction**: scoped writes should expose exactly one public state-level write API, with branch-level helpers internal to the module, and static guard tests should prevent drift.

## Architecture Check

1. One public write surface (`writeScopedVarsToState`) is cleaner and more robust than multiple externally callable write layers because all scoped write behavior flows through one canonical contract.
2. This is entirely game-agnostic kernel plumbing; no game-specific behavior or visual-config concerns are introduced.
3. No backwards-compatibility shims/aliases are introduced; non-canonical exports are removed rather than preserved.

## What to Change

### 1. Narrow scoped write public API to one canonical entry point

Make branch-level writers module-private (no exports) and keep `writeScopedVarsToState` as the single exported scoped write API.

### 2. Remove redundant branching in `effects-var` scoped write return path

Collapse duplicated write return branches in `applySetVar` where both paths now call the same batched writer, keeping behavior unchanged while reducing drift risk.

### 3. Add architecture anti-drift guard tests

Add a kernel guard test that fails when:
- effect modules call branch-level scoped write helpers directly,
- `writeScopedVarToState` is reintroduced,
- branch-level helpers are exported from `scoped-var-runtime-access.ts`.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/test/unit/kernel/` (new guard test)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify if import/export surface assertions need updates)

## Out of Scope

- Transactional clone minimization internals (covered by `ENGINEARCH-058`)
- Scoped-write runtime invariant diagnostics (covered by `ENGINEARCH-061`/`ENGINEARCH-062`)
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Scoped write module exports only canonical state-level write API (`writeScopedVarsToState`) for runtime mutation entry.
2. Kernel guard test fails if effect modules bypass canonical scoped write surface or if removed alias paths reappear.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped write architecture has one externally visible runtime mutation path.
2. GameDef/simulator kernel logic remains game-agnostic and detached from game-specific data placement concerns.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/scoped-var-write-surface-guard.test.ts` — static architecture guard for canonical scoped write surface usage.
2. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — update imports/assertions to match narrowed public API (if required).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/scoped-var-write-surface-guard.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
