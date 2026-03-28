# 88PHAAWAACTFIL-002: Integrate phase index into enumerateRawLegalMoves

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel legal-moves module
**Deps**: archive/tickets/88PHAAWAACTFIL/88PHAAWAACTFIL-001.md

## Problem

`enumerateRawLegalMoves` in `legal-moves.ts` has two `for (const action of def.actions)` loops (lines 1166 and 1196) that iterate all actions regardless of phase. With the phase-action-index from ticket 001, both loops can be narrowed to phase-applicable actions only.

## Assumption Reassessment (2026-03-28)

1. Two `for (const action of def.actions)` loops at lines 1166 and 1196 — confirmed via grep.
2. The preflight phase check at `action-applicability-preflight.ts:112` uses `action.phase.includes(state.currentPhase)` — confirmed. This check must be RETAINED as belt-and-suspenders safety.
3. `state.currentPhase` is a `PhaseId` available on the state object — confirmed at `types-core.ts:864`.
4. The early-exit trivial-action pass (lines 1158-1194) also iterates all `def.actions` — confirmed.

## Architecture Check

1. Replacing `def.actions` with `phaseIndex.actionsByPhase.get(state.currentPhase) ?? []` is a minimal, surgical change — two lines of index lookup added, two loop sources replaced.
2. The preflight phase check is retained — zero behavioral change, only a performance narrowing.
3. No game-specific logic introduced. The phase index is populated from the compiler-assigned `ActionDef.phase` field.

## What to Change

### 1. Add import and index lookup

At the top of `enumerateRawLegalMoves`, add:
```typescript
import { getPhaseActionIndex } from './phase-action-index.js';
```

Before the early-exit block, compute:
```typescript
const phaseIndex = getPhaseActionIndex(def);
const actionsForPhase = phaseIndex.actionsByPhase.get(state.currentPhase) ?? [];
```

### 2. Replace early-exit trivial-action loop source (line 1166)

Change `for (const action of def.actions)` to `for (const action of actionsForPhase)`.

### 3. Replace main enumeration loop source (line 1196)

Change `for (const action of def.actions)` to `for (const action of actionsForPhase)`.

### 4. Retain preflight phase check

Do NOT modify `action-applicability-preflight.ts:112`. The `skipPhaseCheck` parameter and the `.includes()` check remain as-is for safety.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)

## Out of Scope

- Modifying `action-applicability-preflight.ts` — the phase check there is intentionally retained.
- Creating the phase-action-index module — that is ticket 001.
- Adding any new test files — that is ticket 003.
- Optimizing the preflight beyond the loop narrowing (e.g., removing the redundant phase check).
- Changes to `GameDefRuntime`, `GameDef`, or any types.
- Any compiler or CNL changes.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo test` — all existing tests pass with no behavioral changes.
2. `pnpm turbo typecheck` — compiles cleanly.
3. `pnpm turbo lint` — passes linting.
4. Specifically: `packages/engine/test/unit/no-hardcoded-fitl-audit.test.ts` must continue to pass (no game-specific logic introduced).

### Invariants

1. `enumerateRawLegalMoves` produces identical `LegalMoveResult` output for any `(def, state)` pair — the change is purely an iteration narrowing.
2. The preflight phase check in `action-applicability-preflight.ts:112` is NOT removed or bypassed.
3. No new fields on `GameDefRuntime`, `GameDef`, or `ActionDef`.
4. When `state.currentPhase` is not in the index (hypothetical edge case), the empty-array fallback (`?? []`) means zero actions are iterated — matching the existing behavior where all actions would fail the preflight phase check.

## Test Plan

### New/Modified Tests

None in this ticket — see 88PHAAWAACTFIL-003.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo lint`
3. `pnpm turbo test`
