# UNICOMGAMPLAAIAGE-004: Belief Sampling (Hidden-State + Future-RNG Resampling)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new file in agents/mcts/, may need kernel state-hash helper
**Deps**: UNICOMGAMPLAAIAGE-003

## Problem

The MCTS agent must sample plausible hidden states consistent with what the acting player can observe, and must also resample the future game RNG so the search does not exploit latent chance outcomes. This is the core fairness mechanism of the agent.

## Assumption Reassessment (2026-03-13)

1. `PlayerObservation` from ticket 003 provides the visibility projection needed.
2. `GameState` has `zones` (`Record<string, readonly Token[]>`), `rng` (`RngState` — not `Rng`; `Rng` wraps `RngState` as `{ state: RngState }`), `stateHash` (`bigint`).
3. No `ZoneState` type exists — zones map directly to `readonly Token[]`. `Token` has `id: TokenId`, `type: string`, `props: Record<string, number | string | boolean>`. No `ownerPlayer` field on Token — ownership is a zone-level concept via `ZoneDef.ownerPlayerIndex`.
4. `fork` from `kernel/prng.ts` can create independent RNG streams — takes `Rng`, returns `readonly [Rng, Rng]`.
5. `computeFullHash(table: ZobristTable, state: GameState): bigint` in `zobrist.ts` serves the state-hash role. `createZobristTable(def)` creates the table. No new `state-hash.ts` file needed.

## Architecture Check

1. Belief sampling is MCTS-internal logic — lives in `agents/mcts/belief.ts`.
2. Depends on `PlayerObservation` from kernel (ticket 003) but does not modify kernel APIs.
3. Conservative default: preserves per-zone token counts, owner partitions, known public identities; only shuffles within ambiguous uncertainty classes.
4. Future-RNG replacement uses `fork()` from prng module — clean, no kernel modification needed.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/belief.ts`

Define:
- `sampleBeliefState(def: GameDef, rootState: GameState, observation: PlayerObservation, observer: PlayerId, rng: Rng): { readonly state: GameState; readonly rng: Rng }`

Implementation rules (from spec §Belief Sampling Rules):
1. Preserve all currently visible tokens exactly (positions unchanged).
2. Preserve observer-visible ordering exactly.
3. Preserve zone token counts and ownership partitioning.
4. Respect dynamic reveal grants and filtered reveals.
5. Preserve all constraints representable from current state.
6. Never move tokens between zones unless observer cannot distinguish.
7. Recompute `stateHash` for synthetic state (or mark as search-only with `stateHash = 0n`).
8. Replace `state.rng` with a newly sampled RNG derived from search RNG.

Conservative default:
- Identify "uncertainty classes" per zone: sets of hidden tokens whose identities the observer cannot distinguish.
- Fisher-Yates shuffle within each uncertainty class using the search RNG.
- Do NOT redistribute tokens across zones — too aggressive and can create impossible states.

### 2. ~~Possibly create `packages/engine/src/kernel/state-hash.ts`~~ — NOT NEEDED

`computeFullHash` from `zobrist.ts` + `createZobristTable` already provide full state-hash recomputation. Import directly from kernel.

### 3. Update `packages/engine/src/agents/mcts/index.ts`

Add re-export for `belief.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/belief.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- ~~`packages/engine/src/kernel/state-hash.ts`~~ — NOT NEEDED (use `computeFullHash` from `zobrist.ts`)
- `packages/engine/test/unit/agents/mcts/belief.test.ts` (new)

## Out of Scope

- Observation projection logic — ticket 003.
- Exact perfect-recall information-set reasoning — explicitly out of scope per spec §Important Limitation.
- Game-specific belief samplers / hooks — spec §Phase 3.
- Cross-zone token redistribution — explicitly rejected by spec §Conservative Default.

## Acceptance Criteria

### Tests That Must Pass

1. **Visible-state preservation**: After sampling, `derivePlayerObservation(sampled)` returns identical observation as `derivePlayerObservation(original)` for the observer.
2. **Zone count preservation**: Every zone has the same total token count before and after sampling.
3. **Ownership preservation**: Per-zone owner partitioning is unchanged.
4. **Public token identity preservation**: Tokens in public zones are not shuffled.
5. **RNG replacement**: `sampledState.rng` differs from `rootState.rng`.
6. **Determinism**: Same inputs + same RNG seed produce same sampled state.
7. **No-op for perfect info**: If `observation.requiresHiddenSampling === false`, sampled state differs from root only in `rng`.
8. **Input immutability**: `rootState` is not mutated.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Belief sampling never creates tokens that don't exist in the original state.
2. Belief sampling never destroys tokens.
3. All visible tokens remain in exactly the same zone and position after sampling.
4. The returned state is a valid `GameState` that can be passed to `legalMoves()` and `applyMove()`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/belief.test.ts` — visible preservation, count preservation, ownership preservation, RNG replacement, determinism, no-op for public games, input immutability.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/belief.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-13
- **What changed**:
  - Created `packages/engine/src/agents/mcts/belief.ts` with `sampleBeliefState` and `BeliefSample` type.
  - Updated `packages/engine/src/agents/mcts/index.ts` with re-exports.
  - Created `packages/engine/test/unit/agents/mcts/belief.test.ts` (11 tests).
- **Deviations from original plan**:
  - `state-hash.ts` was NOT created — `computeFullHash` from `zobrist.ts` already provides the capability. Used `stateHash = 0n` search-only marker instead of recomputing.
  - Ticket assumptions corrected: `GameState.rng` is `RngState` (not `Rng`), no `ZoneState` type exists, `Token` has no `ownerPlayer` field.
- **Verification**: 4270 tests pass (0 fail), lint 0 errors, typecheck clean.
