# TESTINFRA-002: Add CNL visual-config import boundary guard

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL/source-guard test policy
**Deps**: tickets/SEATRES-070-generalize-canonical-symbol-owner-lint-policy-for-cnl.md

## Problem

There is no explicit source-level guard that prevents CNL/compiler/kernel/simulator modules from importing game-specific visual configuration modules. Without a guard, architecture drift can couple game-agnostic execution layers to visual-config concerns.

## Assumption Reassessment (2026-03-03)

1. Current architecture contract states `GameSpecDoc` carries game-specific data while `GameDef` and simulation/runtime/kernel remain game-agnostic. Verified in `tickets/README.md`.
2. Existing lint/AST guard tests enforce multiple CNL/kernel boundaries, but there is no dedicated guard for visual-config import separation. Verified by current `packages/engine/test/unit/lint/*` and kernel guard coverage.
3. Existing active tickets do not currently scope this specific visual-config boundary guard. Scope is new.

## Architecture Check

1. A focused source guard is cleaner than relying on review discipline because it makes boundary violations fail fast in CI.
2. This directly preserves the `GameSpecDoc` (game-specific) vs `GameDef`/runtime/simulator (game-agnostic) ownership contract.
3. No backwards-compatibility aliasing/shims: enforce canonical boundary now and fail direct violations.

## What to Change

### 1. Add boundary policy test

1. Add a lint/source guard test that scans engine CNL/kernel/sim modules for imports from visual-config ownership surfaces.
2. Keep rule deterministic and narrowly scoped to disallow game-specific visual-config coupling in agnostic layers.

### 2. Align module ownership and references

1. If any violating imports are found, migrate them to approved agnostic contracts or move the logic to non-agnostic ownership.
2. Ensure the guard test uses canonical ownership boundaries, not brittle filename substrings only.

## Files to Touch

- `packages/engine/test/unit/lint/` (modify/add boundary policy test)
- `packages/engine/src/cnl/` (modify only if violations are discovered)
- `packages/engine/src/kernel/` (modify only if violations are discovered)
- `packages/engine/src/sim/` (modify only if violations are discovered)

## Out of Scope

- Game-specific visual presentation behavior changes
- Any GameSpecDoc schema migration unrelated to import-boundary enforcement
- Runtime behavior changes not needed to remove boundary violations

## Acceptance Criteria

### Tests That Must Pass

1. Guard test fails when CNL/kernel/sim directly import visual-config ownership modules.
2. Guard test passes under the current intended architecture after remediation (if needed).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Engine agnostic layers (`cnl`, `kernel`, `sim`) do not import visual-config-specific ownership surfaces.
2. Game-specific data boundaries remain explicit: game data in `GameSpecDoc`; visual presentation data in visual-config; execution contracts remain agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/*visual-config-boundary*.test.ts` — source-level contract guard for visual-config import separation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/*visual-config-boundary*.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck && pnpm turbo lint`
