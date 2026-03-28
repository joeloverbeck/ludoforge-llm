# 92ENUSTASNA-007: Replace composite-key zone total access with a structured snapshot API

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — enumeration snapshot API and future aggregate-consumer boundary
**Deps**: archive/tickets/92ENUSTASNA/92ENUSTASNA-001-snapshot-types-and-factories.md, archive/specs/92-enumeration-state-snapshot.md

## Problem

Ticket `001` intentionally shipped `snapshot.zoneTotals` as a foundation-only accessor, but its current API is `get(key: string)` with composite keys like `"zoneId:tokenType"` and `"zoneId:*"`. That shape is not the ideal long-term architecture because runtime zone ids already contain `:`, so any future consumer either has to rely on brittle string conventions or replicate the current parser knowledge.

Before any later ticket starts consuming snapshot zone totals from compiled aggregate closures, the snapshot API should move to a structured accessor that represents zone id and token type as separate arguments. That preserves F10 (architectural completeness), avoids hidden parsing rules at call sites, and gives us a stable extensibility point for later aggregate compilation work.

## Assumption Reassessment (2026-03-28)

1. `packages/engine/src/kernel/enumeration-snapshot.ts` currently exposes `LazyZoneTotals.get(key: string): number` and parses keys against declared `def.zones` to disambiguate zone ids that already contain `:` — confirmed.
2. `packages/engine/src/kernel/condition-compiler.ts` already consumes `snapshot.zoneTotals` for compiled `count(tokensInZone)` fast paths via composite keys like ``${zoneId}:*`` — so this ticket must update that consumer in the same change instead of treating zone totals as foundation-only.
3. Existing unit tests in `packages/engine/test/unit/kernel/condition-compiler.test.ts`, `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts`, and `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` currently encode the composite-key contract through direct calls or stubbed `zoneTotals.get` implementations.
4. Spec 92 still documents composite string keys in `specs/92-enumeration-state-snapshot.md`, so a future consumer could easily cargo-cult the less robust API unless we correct the ticket plan first.

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

### 3. Migrate the existing compiled aggregate consumer

Update `packages/engine/src/kernel/condition-compiler.ts` so compiled `count(tokensInZone)` closures call the structured accessor directly:

```typescript
snapshot.zoneTotals.get(zoneId)
```

This keeps the fast path aligned with the new snapshot contract and avoids preserving composite-string knowledge outside the snapshot module.

### 4. Update Spec 92-facing documentation

Update the active spec and any active tickets that still describe composite string keys so the architecture description matches the intended long-term API before later implementation tickets consume it.

### 5. Add focused tests

Cover structured access for:
- total zone count
- per-token-type zone count
- caching behavior
- zone ids containing `:`
- compiled aggregate snapshot reads using the structured accessor
- any snapshot test doubles that currently expose `get(key: string)`

The last case is the design driver and should be explicit.

## Files to Touch

- `packages/engine/src/kernel/enumeration-snapshot.ts` (modify)
- `packages/engine/src/kernel/condition-compiler.ts` (modify)
- `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` (modify)
- `packages/engine/test/unit/kernel/condition-compiler.test.ts` (modify)
- `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` (modify)
- `specs/92-enumeration-state-snapshot.md` (modify)
- `tickets/92ENUSTASNA-007-structured-zone-total-access.md` (modify first to correct assumptions and scope)

## Out of Scope

- Changing non-zone snapshot accessors (`globalVars`, `activePlayerVars`, `zoneVars`, `markerStates`)
- Any runner/frontend work
- Benchmark tuning beyond preserving existing behavior

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `zoneTotals.get(zoneId)` returns the total token count for that zone.
2. Unit test: `zoneTotals.get(zoneId, tokenType)` returns the filtered token count for that zone.
3. Unit test: repeated reads for the same `(zoneId, tokenType?)` pair hit the same cached result.
4. Unit test: zones whose ids contain `:` are handled without any parsing ambiguity.
5. Unit test: compiled `count(tokensInZone)` snapshot reads use the structured accessor and stay equivalent to raw-state evaluation.
6. Existing suite: `pnpm turbo test --force`

### Invariants

1. No active snapshot consumer depends on a composite-string zone-total key after this ticket.
2. The snapshot remains local to enumeration and game-agnostic.
3. No backwards-compatibility alias like `getByKey` or dual string/structured overload survives finalization.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` — replace composite-key coverage with structured zone-total access, cache behavior, and the colon-containing zone-id edge case that motivated the change.
2. `packages/engine/test/unit/kernel/condition-compiler.test.ts` — update snapshot-backed aggregate assertions and spies to the structured accessor so the real fast-path consumer is covered.
3. `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` — update snapshot test doubles to match the final `zoneTotals` contract.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/enumeration-snapshot.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

Completion date: 2026-03-28

What actually changed:
- Replaced `LazyZoneTotals.get(key: string)` with `get(zoneId, tokenType?)` in `packages/engine/src/kernel/enumeration-snapshot.ts` and removed all public composite-key parsing.
- Updated the existing compiled aggregate fast path in `packages/engine/src/kernel/condition-compiler.ts` to call `snapshot.zoneTotals.get(zoneId)` directly, so the new API is enforced at the real consumer boundary.
- Updated the Spec 92 document and unit tests to describe and verify the structured accessor contract, including the zone-id-with-`:` edge case.

Deviations from original plan:
- The ticket scope had to expand beyond `enumeration-snapshot.ts` and its local tests because the codebase already had a live `snapshot.zoneTotals` consumer in `condition-compiler.ts`.
- `pipeline-viability-policy.test.ts` only needed test-double signature updates; no production policy logic changed there.

Verification results:
- `pnpm turbo build` ✅
- `node --test packages/engine/dist/test/unit/kernel/enumeration-snapshot.test.js` ✅
- `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js` ✅
- `node --test packages/engine/dist/test/unit/kernel/pipeline-viability-policy.test.js` ✅
- `pnpm turbo test --force` ✅
- `pnpm turbo typecheck` ✅
- `pnpm turbo lint` ✅
