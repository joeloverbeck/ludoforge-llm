# FITLMECHINF-004 - Runtime Stacking Enforcement in Effects

**Status**: Pending
**Spec**: `specs/25-fitl-game-mechanics-infrastructure.md` (Task 25.2, runtime half)
**References**: `specs/00-fitl-implementation-order.md` (Milestone B), Decision #5
**Depends on**: `FITLMECHINF-003` (stacking constraint type must exist)

## Goal

Enforce stacking constraints at runtime during piece placement effects (`moveToken`, `moveAll`, `createToken`). When a placement would violate a stacking constraint, the effect interpreter throws an `EffectRuntimeError`.

## Rationale

Decision #5 requires both compile-time and runtime stacking enforcement. Compile-time catches scenario authoring errors; runtime catches bugs in operation/event effect definitions that would place pieces in violation of stacking rules. This is the belt-and-suspenders second half.

## Scope

### Changes

1. **New helper `checkStackingConstraints`** (`src/kernel/stacking.ts`): Pure function that, given a `GameDef`, destination zone ID, the token being placed, and the current zone contents after placement, checks all `stackingConstraints` and returns violations (if any).

   The function must:
   - Resolve which constraints match the destination zone via `spaceFilter` (requires looking up `MapSpaceDef` from `GameDef` data assets or zone metadata)
   - Resolve which constraints match the piece via `pieceFilter` (requires token `type` and `props.faction`)
   - For `maxCount` rule: count matching pieces in zone after placement, reject if > maxCount
   - For `prohibit` rule: reject if any matching piece is in the zone

2. **Integrate into `effects.ts`**: After `applyMoveToken`, `applyMoveAll`, and `applyCreateToken` compute their new zone contents, call `checkStackingConstraints` on destination zones. If violated, throw `EffectRuntimeError` with code `'STACKING_VIOLATION'`.

3. **Unit tests** with synthetic GameDefs containing stacking constraints, verifying that violations throw and non-violations pass through.

## File List

- `src/kernel/stacking.ts` — New file: `checkStackingConstraints` helper
- `src/kernel/effects.ts` — Integrate stacking check after placement effects
- `src/kernel/index.ts` — Re-export stacking module if needed
- `test/unit/stacking.test.ts` — Unit tests for the stacking check helper
- `test/unit/effects-token-move-draw.test.ts` — Tests that `moveToken` to a zone violating stacking throws
- `test/unit/effects-lifecycle.test.ts` — Tests that `createToken` in a zone violating stacking throws

## Out of Scope

- Compile-time stacking validation (FITLMECHINF-003, already done)
- Derived value computation (FITLMECHINF-002)
- Free operation flag (FITLMECHINF-005)
- FITL-specific stacking data
- Any stacking-aware legal move filtering (moves that would violate stacking should not appear in `legalMoves` — but that's Spec 26–27 scope, not this ticket)
- Changes to `ConditionAST`, `ValueExpr`, or `OptionsQuery`

## Acceptance Criteria

### Specific Tests That Must Pass

- `test/unit/stacking.test.ts`:
  - `checkStackingConstraints` with maxCount=2 and 2 matching pieces → no violation
  - `checkStackingConstraints` with maxCount=2 and 3 matching pieces → violation returned
  - `checkStackingConstraints` with prohibit rule and matching piece → violation returned
  - `checkStackingConstraints` with prohibit rule and non-matching piece → no violation
  - `checkStackingConstraints` with no constraints defined → no violation (backward-compatible)
  - `checkStackingConstraints` with spaceFilter not matching destination → no violation
  - `checkStackingConstraints` with pieceFilter not matching token → no violation
- `test/unit/effects-token-move-draw.test.ts`:
  - `moveToken` to zone exceeding maxCount throws `EffectRuntimeError` with code `'STACKING_VIOLATION'`
  - `moveToken` to zone within limits succeeds normally
- `test/unit/effects-lifecycle.test.ts`:
  - `createToken` in zone violating prohibit rule throws `EffectRuntimeError` with code `'STACKING_VIOLATION'`
- `test/integration/fitl-stacking.test.ts`:
  - Stacking violations detected at both compile-time and runtime for the same constraint set
- `npm run build` passes
- `npm test` passes

### Invariants That Must Remain True

- Existing effects without `stackingConstraints` in `GameDef` behave identically (no performance or behavioral change)
- Stacking checks are pure functions — no mutation of state
- `EffectRuntimeError` thrown on violation includes the constraint ID and a descriptive message
- All other effect types (`setVar`, `addVar`, `draw`, `shuffle`, `destroyToken`) are unaffected
- Budget accounting in `effects.ts` is not disrupted — stacking check does not consume budget
