# SESSMGMT-013: Effect Trace Translation (Spec 43 D7 — logic layer)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: Spec 43 D7, SESSMGMT-015 (optional enhancement only)

## Problem

The event log panel needs human-readable event text, but runner state currently exposes raw `effectTrace` and `triggerFirings` entries from the kernel. We need a pure translation layer that converts trace entries into stable, display-ready records without introducing game-specific logic into runner internals.

## Assumption Reassessment (2026-02-20)

1. `EffectTraceEntry` and `TriggerLogEntry` contracts differ from earlier assumptions. Runtime `effectTrace` entries are discriminated by `kind` values like `moveToken`, `varChange`, `resourceTransfer`, `createToken`, `destroyToken`, `setTokenProp`, `forEach`, `reduce`, `lifecycleEvent`; trigger logs also include non-trigger kinds (`turnFlowLifecycle`, `turnFlowEligibility`, `simultaneousSubmission`, `simultaneousCommit`, `operationPartial`, `operationFree`).
2. The original examples implied token counts/types for `moveToken`, but `EffectTraceMoveToken` only carries `tokenId`, `from`, and `to`. Token count aggregation and guaranteed token-type labeling are not derivable from this function signature and must not be fabricated.
3. `VisualConfigProvider` currently supports `getZoneLabel()` and `getFactionDisplayName()`; `getTokenTypeDisplayName()` is not available yet in current code and stays optional via SESSMGMT-015. This ticket must work without it.
4. Trigger depth exists only on `TriggerLogEntry` entries of kind `fired` and `truncated`; effect-trace entries do not carry depth. For effect entries, translated depth is `0`.
5. Required ticket-template sections were missing. This ticket now explicitly defines assumption checks, architecture checks, and a concrete test plan aligned with current file layout.

## Architecture Check

1. A dedicated pure translator (`translateEffectTrace`) is cleaner than embedding formatting logic in UI components because it centralizes trace semantics, keeps React render paths simple, and makes translation behavior unit-testable.
2. The design remains engine-agnostic and game-agnostic: translation is driven by runtime trace discriminants plus `VisualConfigProvider`/`formatIdAsDisplayName()` fallbacks; no game-specific IDs, branches, or YAML-specific assumptions are introduced.
3. No backwards-compatibility aliases/shims are introduced. We consume current runtime contracts directly and fail fast at compile time if kernel trace unions change.

## What to Change

### 1. Create `packages/runner/src/model/translate-effect-trace.ts`

Define a stable event-log shape:

```typescript
export interface EventLogEntry {
  readonly id: string;
  readonly kind: 'movement' | 'variable' | 'trigger' | 'phase' | 'token' | 'lifecycle';
  readonly message: string;
  readonly playerId?: number;
  readonly zoneIds: readonly string[];
  readonly tokenIds: readonly string[];
  readonly depth: number;
  readonly moveIndex: number;
}
```

Implement:

```typescript
export function translateEffectTrace(
  effectTrace: readonly EffectTraceEntry[],
  triggerLog: readonly TriggerLogEntry[],
  visualConfig: VisualConfigProvider,
  gameDef: GameDef,
  moveIndex: number,
): readonly EventLogEntry[];
```

Translation behavior:

- Translate every `effectTrace` entry to exactly one `EventLogEntry`.
- Translate every trigger-log entry kind to exactly one `EventLogEntry` (including turn-flow/operation/simultaneous trace entries).
- Use deterministic ID generation scoped to `moveIndex` and source index (`effect` / `trigger` prefixes).
- Populate `zoneIds` / `tokenIds` from concrete fields on each entry where available.
- For trigger depth:
  - `fired` / `truncated` use `entry.depth`.
  - all other trigger-log kinds use `0`.

### 2. Name resolution and message policy

Display-name resolution order:

1. Zone labels: `visualConfig.getZoneLabel(zoneId)` -> `formatIdAsDisplayName(zoneId)`.
2. Faction names: `visualConfig.getFactionDisplayName(factionId)` -> `formatIdAsDisplayName(factionId)` -> `Player <id>` fallback when faction is unavailable.
3. Token types: `formatIdAsDisplayName(tokenTypeId)` in this ticket. If SESSMGMT-015 lands, optionally switch to `getTokenTypeDisplayName()` first.

Message policy corrections:

- Do not claim counts or inferred token types for `moveToken` (data unavailable).
- Prefer factual messages from actual trace payload fields.
- Keep messages deterministic and stable for testability.

### 3. Tests

Add focused unit tests with synthetic traces and a mock/real `VisualConfigProvider` instance.

## Files to Touch

- `packages/runner/src/model/translate-effect-trace.ts` (new)
- `packages/runner/test/model/translate-effect-trace.test.ts` (new)

## Out of Scope

- Event log UI panel and filtering/collapsing UX (SESSMGMT-014)
- Visual-config schema/provider token-type `displayName` API (SESSMGMT-015)
- Replay controller, save/load, or session routing changes

## Acceptance Criteria

### Tests That Must Pass

1. `moveToken` translation emits movement entry with correct zone/token references and deterministic message.
2. `varChange` translation emits variable entry including player context for per-player scope.
3. `createToken` and `destroyToken` translations emit token entries with correct zone/token references.
4. `resourceTransfer`, `setTokenProp`, `forEach`, `reduce`, and `lifecycleEvent` each translate without throwing and produce stable event entries.
5. Trigger entries of kind `fired` and `truncated` preserve `depth`.
6. Trigger-log extension kinds (`turnFlowLifecycle`, `turnFlowEligibility`, `simultaneousSubmission`, `simultaneousCommit`, `operationPartial`, `operationFree`) translate to lifecycle/phase entries with depth `0`.
7. Zone labels and faction display names use visual-config methods with `formatIdAsDisplayName()` fallback.
8. Entry IDs are unique within a translation call.
9. Existing runner suite passes: `pnpm -F @ludoforge/runner test`.

### Invariants

1. `translateEffectTrace` is pure and side-effect-free.
2. Translation never throws on missing optional visual-config labels; it always falls back to deterministic text.
3. Event ordering is stable: all effect entries in input order, followed by all trigger-log entries in input order.
4. `moveIndex` is copied unchanged to every emitted entry.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — covers all effect/trigger kinds, fallback behavior, depth handling, id uniqueness, and reference extraction.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-20
- Implemented:
  - Added `packages/runner/src/model/translate-effect-trace.ts` with a pure `translateEffectTrace()` that translates all current `EffectTraceEntry` and `TriggerLogEntry` union kinds into deterministic `EventLogEntry` records.
  - Added `packages/runner/test/model/translate-effect-trace.test.ts` covering message translation, fallback name resolution, depth handling, zone/token reference extraction, ordering, and id uniqueness.
  - Updated ticket assumptions/scope to match actual runtime trace contracts (including non-trigger trigger-log kinds and lack of token-count/type data on `moveToken`).
- Deviations from original plan:
  - Message examples were revised to avoid inferred token counts/types not present in runtime payloads.
  - Scope explicitly includes translation coverage for trigger-log extension entries (`turnFlow*`, `simultaneous*`, `operation*`) instead of only `fired`/`truncated`.
- Verification:
  - `pnpm -F @ludoforge/runner test -- translate-effect-trace` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` still fails due to pre-existing unrelated issues in `test/replay/replay-store.test.ts`, `test/session/replay-runtime.test.tsx`, and `test/ui/SaveGameDialog.test.tsx`.
