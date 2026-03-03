# CROGAMPRIELE-015: Extract reusable findPhaseDef utility

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel utility + callers in legal-moves.ts and apply-move.ts
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-006-phase-action-defaults.md`

## Problem

The pattern `def.turnStructure.phases.find(p => p.id === phaseId) ?? (def.turnStructure.interrupts ?? []).find(p => p.id === phaseId)` now appears in two kernel hot paths (`legal-moves.ts:221-223`, `apply-move.ts:797-799`). As more features reference phase defs at runtime (e.g., zone behaviors in CROGAMPRIELE-007), this will proliferate further. The duplicated linear scan is both a DRY violation and a latent performance concern — in `legal-moves.ts` it runs once per parameter combination per action inside recursive `enumerateParams`.

## Assumption Reassessment (2026-03-02)

1. `legal-moves.ts:222-224` — confirmed: `find()` on phases + interrupts inside the `paramIndex >= action.params.length` leaf of `enumerateParams`.
2. `apply-move.ts:808-810` — confirmed: identical `find()` pattern before action effect execution (named `originatingPhaseDef`).
3. No existing `findPhaseDef` or `phaseById` utility exists anywhere in `packages/engine/src/kernel/` (grep confirmed zero matches).
4. `currentPhase` does not change during a single `legalMoves()` call, so the lookup can be hoisted above the per-action loop.

## Architecture Check

1. A centralized `findPhaseDef(def, phaseId)` is cleaner than repeating the two-step find+fallback pattern at every call site. It provides a single place to add caching (e.g., `Map<PhaseId, PhaseDef>`) if profiling shows the linear scan matters.
2. This is a pure utility operating on `GameDef` — no game-specific logic, fully agnostic.
3. No backwards-compatibility shims — just replace inline lookups with the utility call.

## What to Change

### 1. Create `findPhaseDef` utility

Add a small exported function (in an existing kernel utility file or a new `phase-lookup.ts`) that encapsulates the two-step lookup:

```typescript
export function findPhaseDef(def: GameDef, phaseId: PhaseId): PhaseDef | undefined {
  return def.turnStructure.phases.find(p => p.id === phaseId) ??
    (def.turnStructure.interrupts ?? []).find(p => p.id === phaseId);
}
```

### 2. Replace inline lookups in `legal-moves.ts`

Replace lines 221-223 with a call to `findPhaseDef(def, state.currentPhase)`. Consider hoisting the lookup above `enumerateParams` since `currentPhase` is constant for the duration of `legalMoves()` — pass the resolved `PhaseDef | undefined` as a parameter to `enumerateParams`.

### 3. Replace inline lookup in `apply-move.ts`

Replace lines 797-799 with `findPhaseDef(def, effectState.currentPhase)`.

## Files to Touch

- `packages/engine/src/kernel/phase-lookup.ts` (new) — or add to an existing kernel utility file
- `packages/engine/src/kernel/legal-moves.ts` (modify) — replace inline lookup, optionally hoist
- `packages/engine/src/kernel/apply-move.ts` (modify) — replace inline lookup
- `packages/engine/src/kernel/index.ts` (modify) — barrel export if new file created

## Out of Scope

- Adding a `Map<PhaseId, PhaseDef>` cache — that's a separate perf optimization if profiling warrants it.
- Changing the `enumerateParams` signature to accept pre-resolved phase def (optional optimization, can be done here or deferred).

## Acceptance Criteria

### Tests That Must Pass

1. All 18 CROGAMPRIELE-006 tests remain green (no behavioral change).
2. Full suite: `pnpm turbo test --force`

### Invariants

1. `findPhaseDef` returns the same result as the inline pattern for all valid `PhaseId` values (phases + interrupts).
2. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-lookup.test.ts` — unit tests for `findPhaseDef`: finds in phases, finds in interrupts, returns `undefined` for unknown id, prefers phases over interrupts if duplicate id (edge case).

### Commands

1. `node --test packages/engine/dist/test/unit/phase-lookup.test.js`
2. `pnpm turbo build && pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

All deliverables implemented as planned, with one enhancement beyond the ticket:

- **`phase-lookup.ts`** (new, 16 lines): Pure `findPhaseDef(def, phaseId)` utility encapsulating the two-step phases+interrupts lookup.
- **`legal-moves.ts`** (modified): Replaced inline lookup with `findPhaseDef`. **Hoisted** the lookup above the per-action loop in `enumerateLegalMoves` (from inside `enumerateParams` leaf). The resolved `PhaseDef | undefined` is now passed as a parameter through `enumerateParams`, avoiding redundant linear scans per parameter combination. This was listed as optional in the ticket but is a clear performance win.
- **`apply-move.ts`** (modified): Replaced inline lookup with `findPhaseDef`. Removed unused `PhaseDef` type import (now inferred from utility return type).
- **`kernel/index.ts`** (modified): Added barrel export for `phase-lookup.js`.
- **`test/unit/kernel/phase-lookup.test.ts`** (new, 6 tests): Covers find in phases, find in interrupts, unknown id, undefined interrupts, id collision (phases wins), empty phases array.

Verification: build passes, 3397 tests pass (0 failures, +6 new), typecheck clean, lint clean.
