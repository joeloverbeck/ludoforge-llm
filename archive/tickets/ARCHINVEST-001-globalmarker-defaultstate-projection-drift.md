# ARCHINVEST-001: Investigate globalMarker defaultState projection drift

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — investigation only
**Deps**: None

## Problem

Both `effects-choice.ts` and `eval-query.ts` independently resolve `lattice.defaultState` when a global marker is absent from `state.globalMarkers`. The effect layer uses `resolveGlobalMarkerLattice(env.def, marker, ...)` while the query layer uses inline `ctx.def.globalMarkerLattices?.find(...)`. The investigation must determine whether those paths have semantically drifted or whether this is acceptable duplication.

**Source**: `reports/architectural-abstractions-2026-04-09-fitl-events-1968-nva.md` — Needs Investigation item A.

## Assumption Reassessment (2026-04-09)

1. The live write path in [packages/engine/src/kernel/effects-choice.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effects-choice.ts) resolves the lattice by `id`, throws on unknown markers, and falls back to `lattice.defaultState` when `state.globalMarkers[marker]` is absent for `shiftGlobalMarker` and `flipGlobalMarker`.
2. The live read path in [packages/engine/src/kernel/eval-query.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/eval-query.ts) resolves the same lattice by `id`, filters out unknown markers, and uses the same `state.globalMarkers?.[markerId] ?? lattice.defaultState` fallback when `query.states` filtering is active.
3. The ticket premise was partially speculative: there is duplication, but the current codebase does not show semantic drift. `eval-query.ts` added the `globalMarkers` query case in commit `3e0da724` and its fallback logic has not changed since. `effects-choice.ts` changed independently afterward, but only around helper signatures, typing, runtime-error constants, and mutable cursor plumbing; the lattice lookup and `defaultState` fallback semantics remained intact.

## Architecture Check

1. Closing this as acceptable duplication is cleaner than extracting a shared helper without evidence of divergent behavior. A shared helper would create new cross-module coupling without a demonstrated architectural need.
2. The current boundary remains engine-agnostic and Foundation-compliant: both modules interpret generic `globalMarkerLattices` data from `GameDef`, and neither embeds game-specific logic.
3. No compatibility shims, alias paths, or partial migrations are needed because no runtime contract changed.

## Investigation Steps

### 1. Compared live resolution implementations

- `effects-choice.ts` uses `resolveGlobalMarkerLattice(...)` to find the lattice and throws if the marker is unknown.
- `eval-query.ts` performs the same `globalMarkerLattices?.find(...)` lookup inline and drops unknown markers from query results instead of throwing, which is appropriate for query enumeration.
- For the investigated fallback specifically, both paths use the same authoritative read: `state.globalMarkers?.[markerId] ?? lattice.defaultState`.
- Edge-case outcome:
  - Missing lattice: write path throws, query path filters out. This is intentional API-shape behavior, not projection drift.
  - Undefined `defaultState`: both paths surface `undefined` from the same lattice field; neither adds extra normalization.
  - Empty `states` array: neither path special-cases it at fallback time; any invalidity is left to the broader lattice consumer contract.

### 2. Checked git co-change history

Command reviewed:

```bash
git log --since="6 months ago" --oneline -- packages/engine/src/kernel/effects-choice.ts packages/engine/src/kernel/eval-query.ts
```

Line-history review showed:

- `eval-query.ts` gained the `globalMarkers` query branch in `3e0da724` and did not subsequently change the `defaultState` fallback logic.
- `effects-choice.ts` had several later commits touching surrounding helpers, but none changed the `find(... by id)` lookup or `?? lattice.defaultState` semantics for global markers.
- No six-month commit modified both files' global-marker fallback logic together or revealed a bug fix landing in one path but not the other.

### 3. Outcome

- Verdict: no projection drift found.
- Classification: neither incidence nor mechanism of drift was verified.
- Follow-up ticket: not needed. The duplication is currently acceptable and has not demonstrated semantic divergence.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (read only — investigated)
- `packages/engine/src/kernel/eval-query.ts` (read only — investigated)
- `reports/architectural-abstractions-2026-04-09-fitl-events-1968-nva.md` (modify — record resolved verdict)
- `tickets/ARCHINVEST-001-globalmarker-defaultstate-projection-drift.md` (modify — capture investigation outcome)

## Out of Scope

- Refactoring the resolution paths into a shared helper
- Spec 120 marker separation
- Any engine behavior change

## Acceptance Criteria

### Tests That Must Pass

1. No runtime or test command changes required; this is a read-only engine investigation.

### Invariants

1. No engine code changes are made during the investigation.
2. The ticket and source report record a concrete verdict backed by live code inspection and git history.

## Test Plan

### New/Modified Tests

1. None — investigation only.

### Commands

1. `git log --since="6 months ago" --oneline -- packages/engine/src/kernel/effects-choice.ts packages/engine/src/kernel/eval-query.ts`
2. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-04-09

Investigation confirmed that the duplicated `globalMarker` fallback logic is behaviorally aligned across the query and effect layers. The report’s “Needs Investigation” item A is resolved as acceptable duplication, so no follow-up engine ticket was created.
