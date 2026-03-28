# 92ENUSTASNA-008: Generalize enumeration snapshot player access beyond `state.activePlayer`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — enumeration snapshot shape, compiled condition accessors, pipeline snapshot eligibility policy
**Deps**: specs/92-enumeration-state-snapshot.md, archive/tickets/92ENUSTASNA/92ENUSTASNA-003-thread-snapshot-through-pipeline-policy.md

## Problem

The current enumeration snapshot shape caches only `activePlayerVars` for the player used when the snapshot was created. That makes the snapshot incomplete for enumeration-time predicate evaluation in contexts where `evalCtx.activePlayer !== state.activePlayer`, such as actions whose executor differs from the turn's active player.

Production code currently preserves correctness by refusing to pass the snapshot into compiled predicates when the evaluation player does not match `snapshot.activePlayer`. That is safe, but it is not the ideal architecture:

- it leaves a blind spot in the snapshot optimization surface
- it pushes player-eligibility knowledge into `pipeline-viability-policy.ts`
- it makes the snapshot a partial representation of the state rather than a complete enumeration-time read model

The cleaner long-term design is a snapshot that can serve per-player variable reads for any evaluation player encountered during a single enumeration pass.

## Assumption Reassessment (2026-03-28)

1. `packages/engine/src/kernel/enumeration-snapshot.ts` currently exposes `activePlayerVars` and `activePlayer`, not a generic per-player accessor or per-player snapshot map — confirmed.
2. `packages/engine/src/kernel/condition-compiler.ts` already reads `snapshot.activePlayerVars` for compiled `pvar` references when `player: 'active'` — confirmed.
3. `packages/engine/src/kernel/pipeline-viability-policy.ts` currently guards snapshot use with `snapshot?.activePlayer === evalCtx.activePlayer` before invoking compiled predicates — confirmed.
4. That guard preserves semantics but proves the snapshot shape is not architecturally complete for enumeration-time evaluation.
5. No remaining active ticket currently owns this redesign. `92ENUSTASNA-005` and `92ENUSTASNA-006` should depend on it so their proof/benchmark scopes reflect the final architecture, not the temporary guard.

## Architecture Check

1. The snapshot should model the enumeration-time read surface generically, not as a special case for one player. A per-player accessor or per-player snapshot map is cleaner than encoding one privileged player into the snapshot contract.
2. This remains fully game-agnostic and aligns with `docs/FOUNDATIONS.md`: the snapshot still exposes generic kernel data (`perPlayerVars`, globals, zones, markers) and introduces no game-specific branching.
3. No backwards-compatibility shim should survive. Once the generalized player access exists, compiled predicates and pipeline viability code should use the new snapshot contract directly, and the temporary player-match guard should be removed.

## What to Change

### 1. Replace `activePlayerVars` with a generalized per-player snapshot contract

Update `EnumerationStateSnapshot` in `packages/engine/src/kernel/enumeration-snapshot.ts` so per-player data is available for any evaluation player during enumeration.

Recommended shape:

```typescript
interface LazyPerPlayerVars {
  get(playerId: PlayerId | string, varName: string): VariableValue | undefined;
}

interface EnumerationStateSnapshot {
  readonly globalVars: GameState['globalVars'];
  readonly perPlayerVars: LazyPerPlayerVars;
  readonly zoneTotals: LazyZoneTotals;
  readonly zoneVars: LazyZoneVars;
  readonly markerStates: LazyMarkerStates;
}
```

An eager `Readonly<Record<string, Readonly<Record<string, VariableValue>>>>` is also acceptable if it is demonstrably simpler and does not violate the hot-path constraints. The key requirement is that the snapshot be complete for arbitrary evaluation players within one enumeration pass.

### 2. Update snapshot construction

`createEnumerationSnapshot` should stop baking one privileged player into the snapshot. It should instead expose all per-player vars through the generalized contract.

### 3. Update compiled `pvar(active)` accessors

In `packages/engine/src/kernel/condition-compiler.ts`, compiled `pvar` accessors should resolve the requested player from the current invocation's `activePlayer` and then read that player's vars from the generalized snapshot contract.

### 4. Remove the temporary player-match guard

In `packages/engine/src/kernel/pipeline-viability-policy.ts`, remove the `snapshot.activePlayer === evalCtx.activePlayer` gating once the snapshot can serve any evaluation player. The policy layer should not own snapshot-shape limitations.

### 5. Update spec documentation

Update `specs/92-enumeration-state-snapshot.md` so the documented snapshot structure matches the generalized player model instead of the current `activePlayerVars` shortcut.

## Files to Touch

- `packages/engine/src/kernel/enumeration-snapshot.ts` (modify)
- `packages/engine/src/kernel/condition-compiler.ts` (modify)
- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify)
- `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` (modify)
- `packages/engine/test/unit/kernel/condition-compiler.test.ts` (modify)
- `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` (modify)
- `specs/92-enumeration-state-snapshot.md` (modify)
- `tickets/92ENUSTASNA-005-equivalence-tests.md` (modify only if test scope wording still needs alignment)
- `tickets/92ENUSTASNA-006-benchmark-regression-test.md` (modify only if benchmark scope wording still needs alignment)

## Out of Scope

- Structured `zoneTotals` API redesign; that belongs in `92ENUSTASNA-007`
- New aggregate-compiler consumers beyond the existing compiled `gvar` / `pvar` snapshot reads
- Any runner/frontend work
- Benchmark tuning beyond restoring the intended optimization surface

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: compiled `pvar(active)` predicates read from the generalized snapshot for any invocation `activePlayer`, not just the player used when the snapshot was created.
2. Unit test: pipeline viability evaluation passes the snapshot through to compiled predicates for executor-shifted contexts without falling back to raw-state due to a player-match guard.
3. Unit test: with-snapshot and without-snapshot compiled evaluation remain semantically identical for both default and executor-shifted evaluation players.
4. Existing suite: `pnpm turbo test --force`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

### Invariants

1. The snapshot remains local to enumeration and game-agnostic.
2. No per-player fallback alias such as keeping both `activePlayerVars` and `perPlayerVars` survives finalization.
3. `pipeline-viability-policy.ts` does not retain policy-level knowledge of snapshot player eligibility once the generalized snapshot shape exists.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` — prove the snapshot can resolve per-player vars for multiple players within one enumeration snapshot.
2. `packages/engine/test/unit/kernel/condition-compiler.test.ts` — prove compiled `pvar(active)` reads remain equivalent with and without the generalized snapshot across multiple invocation players.
3. `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` — prove executor-shifted predicate evaluation uses the snapshot directly once the temporary guard is removed.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/enumeration-snapshot.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/pipeline-viability-policy.test.js`
5. `pnpm turbo test --force`
6. `pnpm turbo typecheck`
7. `pnpm turbo lint`
