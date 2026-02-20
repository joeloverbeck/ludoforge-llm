# SESSMGMT-013: Effect Trace Translation (Spec 43 D7 — logic layer)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None (can be developed in parallel with other SESSMGMT tickets)

## Problem

The event log panel needs to display human-readable descriptions of game events. Raw kernel trace data (effect trace entries, trigger log entries) needs to be translated into readable text using display names from `VisualConfigProvider` and the `formatIdAsDisplayName()` fallback.

## What to Change

### 1. Create `packages/runner/src/model/translate-effect-trace.ts`

Define the event log entry type:

```typescript
export interface EventLogEntry {
  readonly id: string;          // Unique entry id (e.g., `move-${moveIndex}-${entryIndex}`)
  readonly kind: 'movement' | 'variable' | 'trigger' | 'phase' | 'token' | 'lifecycle';
  readonly message: string;     // Human-readable description
  readonly playerId?: number;   // Associated player/faction
  readonly zoneIds: readonly string[];   // Referenced zones (for click-to-highlight)
  readonly tokenIds: readonly string[];  // Referenced tokens
  readonly depth: number;       // Trigger nesting depth (0 = top-level)
  readonly moveIndex: number;   // Which move this belongs to
}
```

Implement the translation function:

```typescript
export function translateEffectTrace(
  effectTrace: readonly EffectTraceEntry[],
  triggerLog: readonly TriggerLogEntry[],
  visualConfig: VisualConfigProvider,
  gameDef: GameDef,
  moveIndex: number,
): readonly EventLogEntry[];
```

**Display name resolution** (priority order):
1. `VisualConfigProvider.getZoneLabel(zoneId)` for zone names — fallback to `formatIdAsDisplayName(zoneId)`.
2. `VisualConfigProvider.getFactionDisplayName(factionId)` for faction/player names — fallback to `formatIdAsDisplayName()` or `"Player N"`.
3. `VisualConfigProvider.getTokenTypeDisplayName(tokenTypeId)` for token type names (SESSMGMT-015) — fallback to `formatIdAsDisplayName(tokenTypeId)`.

**Translation examples** (reference, not exhaustive):
- `EffectTraceMoveToken`: "VC moved 3 Guerrillas from Saigon to Can Tho"
- `EffectTraceVarChange`: "Pot increased to 15,000"
- `EffectTraceCreateToken`: "Dealt Ace Of Spades to Player 1"
- `EffectTraceDestroyToken`: "Removed 2 NVA Troops from Hue"
- `TriggerFiring`: "Terror triggered: shifted Saigon to Active Opposition"

### 2. Tests

Comprehensive unit tests with synthetic trace data and a mock `VisualConfigProvider`.

## Files to Touch

- `packages/runner/src/model/translate-effect-trace.ts` (new)
- `packages/runner/test/model/translate-effect-trace.test.ts` (new)

## Out of Scope

- Event log UI panel (SESSMGMT-014)
- Token type `displayName` in visual config (SESSMGMT-015 — this ticket uses `formatIdAsDisplayName()` as fallback)
- Replay controller (SESSMGMT-011, 012)
- Save/load (SESSMGMT-009, 010)
- Session store or router changes

## Acceptance Criteria

### Tests That Must Pass

1. **Move token translation**: `EffectTraceMoveToken` with zone labels produces "X moved N TokenType from ZoneA to ZoneB".
2. **Variable change translation**: `EffectTraceVarChange` produces "VarName changed to Value".
3. **Create token translation**: `EffectTraceCreateToken` produces "Created TokenType in Zone".
4. **Destroy token translation**: `EffectTraceDestroyToken` produces "Removed N TokenType from Zone".
5. **Trigger translation**: Trigger firing produces a nested entry with `depth > 0`.
6. **Zone name resolution**: Uses `VisualConfigProvider.getZoneLabel()` when available, `formatIdAsDisplayName()` when not.
7. **Faction name resolution**: Uses `VisualConfigProvider.getFactionDisplayName()` when available, fallback otherwise.
8. **Token type name resolution**: Uses `formatIdAsDisplayName()` for token type ids (or `getTokenTypeDisplayName` if SESSMGMT-015 is done).
9. **Entry ids are unique**: All entries in a single call have unique `id` values.
10. **Zone and token ids populated**: Each entry correctly lists referenced `zoneIds` and `tokenIds`.
11. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. `translateEffectTrace` is a pure function — no side effects.
2. Display name resolution never throws — always falls back to `formatIdAsDisplayName()`.
3. Each effect trace entry type produces exactly one event log entry (1:1 mapping, not N:1).
4. Trigger depth is correctly propagated from the trace data.
5. `moveIndex` is correctly set on all entries.
