# 130CANHOTPAT-001: GameState — convert optional fields to always-present `T | undefined`

**Status**: COMPLETE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel types, initial state, state draft, all GameState construction sites
**Deps**: None

## Problem

`GameState` has 4 optional fields using `?` syntax (`reveals`, `globalMarkers`, `activeLastingEffects`, `interruptPhaseStack`). These create up to 16 different V8 hidden classes at runtime — `createMutableState` in `state-draft.ts` conditionally spreads each field, producing objects with different property sets depending on game configuration. This is the single largest contributor to megamorphic property access overhead (~6% total CPU in V8 profiling).

## Assumption Reassessment (2026-04-13)

1. `GameState` is defined in `packages/engine/src/kernel/types-core.ts:1080-1100` — confirmed
2. Exactly 4 optional fields exist: `reveals?`, `globalMarkers?`, `activeLastingEffects?`, `interruptPhaseStack?` — confirmed at lines 1096-1099
3. `createMutableState` in `state-draft.ts:46-68` conditionally spreads all 4 fields — confirmed
4. `initialState` in `initial-state.ts:32-123` constructs base state but only populates `globalMarkers` — other optional fields are absent from initial construction — confirmed
5. GameState has ~55 kernel source imports and ~42 test file imports — confirmed via reassessment

## Architecture Check

1. Converting `?` to `T | undefined` is a type-only change at the interface level — runtime behavior is identical since accessing a missing property already returns `undefined`. The change makes the V8 hidden class consistent.
2. GameState is engine-internal — no game-specific logic introduced. The change is purely about V8 optimization discipline.
3. No backwards-compatibility shims — all construction sites migrated in one change per Foundation 14.

## What to Change

### 1. Update GameState interface in `types-core.ts`

Change all 4 optional fields from `?` syntax to `T | undefined`:

```typescript
// Before
readonly reveals?: Readonly<Record<string, readonly RevealGrant[]>>;
readonly globalMarkers?: Readonly<Record<string, string>>;
readonly activeLastingEffects?: readonly ActiveLastingEffect[];
readonly interruptPhaseStack?: readonly InterruptPhaseFrame[];

// After
readonly reveals: Readonly<Record<string, readonly RevealGrant[]>> | undefined;
readonly globalMarkers: Readonly<Record<string, string>> | undefined;
readonly activeLastingEffects: readonly ActiveLastingEffect[] | undefined;
readonly interruptPhaseStack: readonly InterruptPhaseFrame[] | undefined;
```

### 2. Update `initialState` in `initial-state.ts`

Ensure the base state construction at line 54 populates all 4 fields explicitly:

```typescript
const baseState: GameState = {
  // ... existing required fields ...
  globalMarkers: initialGlobalMarkers,
  reveals: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
};
```

### 3. Update `createMutableState` in `state-draft.ts`

Replace conditional spreads (lines 56-68) with always-present fields:

```typescript
// Before
...(state.reveals !== undefined ? { reveals: { ...state.reveals } } : {}),

// After
reveals: state.reveals !== undefined ? { ...state.reveals } : undefined,
```

Apply this pattern to all 4 optional fields.

### 4. Fix all remaining GameState construction sites

Grep for all object literals producing `GameState` across kernel files (~25 sites). Ensure every site includes all 4 fields. Common patterns to fix:

- Spread-then-conditionally-add: `{ ...state, ...(cond ? { reveals: x } : {}) }` → `{ ...state, reveals: cond ? x : undefined }`
- Omission: sites that spread `state` but omit optional fields are safe (spread carries the property), but sites that construct from scratch must include all fields

### 5. Fix test files

~42 test files import/reference GameState. Most tests construct GameState via helpers (`makeIsolatedInitialState`, etc.) which will inherit the fix from `initialState`. Tests that construct GameState objects directly need all 4 fields added. Type errors from `tsc` will identify all sites.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/initial-state.ts` (modify)
- `packages/engine/src/kernel/state-draft.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-*.ts` (modify — multiple effect files)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- Test files constructing GameState directly (modify — guided by `tsc` errors)

## Out of Scope

- Serialized GameDef or GameState JSON format — serialization can strip `undefined` fields
- Other hot-path types (EffectCursor, ClassifiedMove, etc.) — separate tickets
- ESLint rule — separate ticket
- Performance measurement — validated via campaign harness after all tickets complete

## Acceptance Criteria

### Tests That Must Pass

1. All existing engine tests pass unchanged (no behavioral change)
2. `stateHash` determinism preserved — replay tests produce identical hashes
3. `Object.keys(state)` returns the same set for any GameState object regardless of game configuration

### Invariants

1. Every GameState object has exactly the same set of own property names — no conditional properties
2. Foundation 8: determinism unaffected — `undefined` property reads behave identically to absent property reads
3. Foundation 14: no `?` syntax remains on GameState optional fields after this ticket

## Test Plan

### New/Modified Tests

1. Test files with direct GameState construction — add missing optional fields (guided by `tsc --noEmit`)

### Commands

1. `pnpm -F @ludoforge/engine build` — verify type changes compile
2. `pnpm -F @ludoforge/engine test` — verify all engine tests pass
3. `pnpm turbo typecheck` — verify no type errors across workspace
4. `pnpm turbo test` — full suite verification

## Outcome (2026-04-13)

- Landed the `GameState` contract change to always-present `reveals`, `globalMarkers`, `activeLastingEffects`, and `interruptPhaseStack` fields as `T | undefined`.
- Updated runtime constructors and reset paths to preserve canonical `GameState` keys instead of deleting them when a branch becomes empty. This absorbed the live `state-shape.ts`, reveal cleanup, lasting-effect expiry, validation-state, and interrupt-stack resume paths that the draft ticket did not originally enumerate.
- Kept serialized `GameState` / trace JSON semantically unchanged by continuing to strip undefined optional fields during serde, and updated `SerializedGameState` to match that live contract.
- Updated direct `GameState` test fixtures across the engine suite so typechecked construction sites now materialize the canonical runtime shape.
- Schema/artifact fallout checked: `schema:artifacts:check` passed and no generated schema artifacts changed.
- Verification run:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
