# UNICOMGAMPLAAIAGE-003: Observation Projection Utilities

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new shared kernel file
**Deps**: None (leaf ticket, kernel-side)

## Problem

The MCTS agent needs to know what a player can observe before sampling hidden states. The current engine has zone visibility semantics (`public`/`owner`/`hidden`), `RevealGrant`s, and token-level visibility, but no shared utility that projects the full observation for a given player. This logic belongs in shared kernel code so the agent and runner do not diverge.

## Assumption Reassessment (2026-03-13)

1. `ZoneDef.visibility` is `'public' | 'owner' | 'hidden'` — confirmed in `types-core.ts:107`.
2. `ZoneDef.ownerPlayerIndex` exists — confirmed in `types-core.ts:105`.
3. `RevealGrant` type exists and is used in `hidden-info-grants.ts` — confirmed.
4. No `observation.ts` file exists yet — confirmed via glob.
5. The runner currently has its own visibility logic in `packages/runner/src/model/` — this ticket creates the canonical shared version in kernel.

## Architecture Check

1. Observation projection is a pure function of `(GameDef, GameState, PlayerId)` — no side effects, fits kernel purity contract.
2. Placed in `kernel/observation.ts` as a shared utility — both MCTS agent and runner can consume it.
3. Does not introduce game-specific logic — uses generic zone visibility and reveal grant semantics.

## What to Change

### 1. Create `packages/engine/src/kernel/observation.ts`

Define:
- `PlayerObservation` interface:
  - `observer: PlayerId`
  - `visibleTokenIdsByZone: Readonly<Record<string, readonly string[]>>` — which tokens the observer can see in each zone
  - `visibleTokenOrderByZone: Readonly<Record<string, readonly string[]>>` — ordering info where ordering conveys information
  - `visibleRevealsByZone: Readonly<Record<string, readonly RevealGrant[]>>` — active reveal grants per zone
  - `requiresHiddenSampling: boolean` — true if any zone has tokens not fully visible to observer
- `derivePlayerObservation(def: GameDef, state: GameState, observer: PlayerId): PlayerObservation`

Visibility rules to implement:
- `public` zones: all tokens visible to all players.
- `owner` zones: tokens visible only to zone owner (matched by `ownerPlayerIndex` against `observer`).
- `hidden` zones: no tokens visible unless reveal grants apply.
- Dynamic `RevealGrant`s: grants in `state.revealGrants` that include the observer expand visibility.
- Filtered reveals: reveal grants with `filter` only expose tokens matching the filter.
- `requiresHiddenSampling` = true if any zone has tokens the observer cannot see.

### 2. Update `packages/engine/src/kernel/index.ts`

Add `export * from './observation.js';`

## Files to Touch

- `packages/engine/src/kernel/observation.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add export)
- `packages/engine/test/unit/kernel/observation.test.ts` (new)

## Out of Scope

- Belief sampling (shuffling hidden tokens) — ticket 004.
- Runner model refactoring to consume this utility — separate concern.
- Any changes to `RevealGrant` types or `hidden-info-grants.ts`.
- Token filter expression evaluation internals — reuse existing `foldTokenFilterExpr` utilities.

## Acceptance Criteria

### Tests That Must Pass

1. Public zone: all tokens appear in `visibleTokenIdsByZone` for any observer.
2. Owner zone: tokens visible only to owner player; other players see empty.
3. Hidden zone: no tokens visible without reveal grants.
4. Reveal grant: hidden zone becomes visible to granted observer.
5. Filtered reveal: only matching tokens visible through filtered grant.
6. `requiresHiddenSampling` is `false` for fully public game state.
7. `requiresHiddenSampling` is `true` when hidden/owner zones with tokens exist.
8. Ordering info preserved for stack/queue zones where visible.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `derivePlayerObservation` is a pure function — no mutation, no side effects.
2. Zone visibility semantics match the engine's existing `ZoneDef.visibility` contract exactly.
3. The function must not import from `agents/` — it is kernel-side shared code.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/observation.test.ts` — public/owner/hidden zone visibility, reveal grants, filtered reveals, ordering, `requiresHiddenSampling` flag.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/observation.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
