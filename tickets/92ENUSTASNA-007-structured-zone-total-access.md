# 92ENUSTASNA-007: Replace composite-key zone total access with a structured snapshot API

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — enumeration snapshot API and future aggregate-consumer boundary
**Deps**: 92ENUSTASNA-001, specs/92-enumeration-state-snapshot.md

## Problem

Ticket `001` intentionally shipped `snapshot.zoneTotals` as a foundation-only accessor, but its current API is `get(key: string)` with composite keys like `"zoneId:tokenType"` and `"zoneId:*"`. That shape is not the ideal long-term architecture because runtime zone ids already contain `:`, so any future consumer either has to rely on brittle string conventions or replicate the current parser knowledge.

Before any later ticket starts consuming snapshot zone totals from compiled aggregate closures, the snapshot API should move to a structured accessor that represents zone id and token type as separate arguments. That preserves F10 (architectural completeness), avoids hidden parsing rules at call sites, and gives us a stable extensibility point for later aggregate compilation work.

## Assumption Reassessment (2026-03-28)

1. `packages/engine/src/kernel/enumeration-snapshot.ts` currently exposes `LazyZoneTotals.get(key: string): number` and parses keys against declared `def.zones` to disambiguate zone ids that already contain `:` — confirmed.
2. None of the remaining active Spec 92 tickets (`002` through `006`) introduce snapshot `zoneTotals` consumers. They only wire snapshot support for existing `globalVars` / active-player `perPlayerVars` reads and test that limited surface.
3. Spec 92 still documents composite string keys in `specs/92-enumeration-state-snapshot.md`, so a future consumer could easily cargo-cult the less robust API unless we correct the ticket plan first.

## Architecture Check

1. A structured accessor like `get(zoneId, tokenType?)` is cleaner than a composite string because call sites stay typed and local; no caller has to know parser rules or delimiter edge cases.
2. This remains fully game-agnostic. The API deals in generic `ZoneId` and token-type ids already present in `GameState` / `GameDef`, not game-specific semantics.
3. No backwards-compatibility shim should be kept. Once the structured accessor exists, all snapshot zone-total consumers should use it directly and the composite-string API should be removed.

## What to Change

### 1. Replace the `LazyZoneTotals` API

In `packages/engine/src/kernel/enumeration-snapshot.ts`, change the accessor contract from:

```typescript
interface LazyZoneTotals {
  get(key: string): number;
}
```

to a structured contract such as:

```typescript
interface LazyZoneTotals {
  get(zoneId: ZoneId | string, tokenType?: string): number;
}
```

`tokenType === undefined` means total tokens in the zone; otherwise it means count of that token type in the zone.

### 2. Remove composite-key parsing

Delete the composite-key parser path and replace it with direct cache-key construction internal to the accessor implementation. Parsing should no longer be part of the public contract.

### 3. Update Spec 92-facing documentation

Update the active spec and any active tickets that still describe composite string keys so the architecture description matches the intended long-term API before later implementation tickets consume it.

### 4. Add focused tests

Cover structured access for:
- total zone count
- per-token-type zone count
- caching behavior
- zone ids containing `:`

The last case is the design driver and should be explicit.

## Files to Touch

- `packages/engine/src/kernel/enumeration-snapshot.ts` (modify)
- `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` (modify)
- `specs/92-enumeration-state-snapshot.md` (modify)
- `tickets/92ENUSTASNA-00*.md` (modify only where composite-string wording is still active)

## Out of Scope

- Wiring new compiled aggregate consumers into `condition-compiler.ts`
- Changing non-zone snapshot accessors (`globalVars`, `activePlayerVars`, `zoneVars`, `markerStates`)
- Any runner/frontend work
- Benchmark tuning beyond preserving existing behavior

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `zoneTotals.get(zoneId)` returns the total token count for that zone.
2. Unit test: `zoneTotals.get(zoneId, tokenType)` returns the filtered token count for that zone.
3. Unit test: repeated reads for the same `(zoneId, tokenType?)` pair hit the same cached result.
4. Unit test: zones whose ids contain `:` are handled without any parsing ambiguity.
5. Existing suite: `pnpm turbo test --force`

### Invariants

1. No active snapshot consumer depends on a composite-string zone-total key after this ticket.
2. The snapshot remains local to enumeration and game-agnostic.
3. No backwards-compatibility alias like `getByKey` or dual string/structured overload survives finalization.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` — extend coverage to the structured zone-total API and the colon-containing zone-id edge case that motivated the change.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/enumeration-snapshot.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
