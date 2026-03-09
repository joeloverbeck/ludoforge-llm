# Spec 58 — Event-Based Trace Bus for Move Traceability

## Status: Implemented

## Motivation

When playing FITL in the browser runner, it's difficult to follow what the AI agents are doing — which moves they pick, what state changes result, which triggers fire. Games sometimes crash mid-run (animation issues), making post-game-only trace dumps useless. The engine already has rich traceability infrastructure (StateDelta, EffectTrace, TriggerLogEntry, MoveLog) but none of it is surfaced to the developer during browser gameplay.

## Solution

A typed pub/sub trace bus split across two packages:

- **Engine** (`packages/engine/src/trace/`): Generic `TraceBus` (subscribe/emit/unsubscribeAll) and `TraceEvent` discriminated union. Reusable by simulator later.
- **Runner** (`packages/runner/src/trace/`): Console subscriber that formats events using `console.group()` for structured DevTools output.

## Architecture

```
Engine Package                    Runner Package
┌────────────────────┐           ┌──────────────────────────┐
│ trace/trace-bus.ts  │           │ trace/console-trace-     │
│  createTraceBus()   │◄──────────│  subscriber.ts           │
│  TraceBus interface │           │  createConsoleTrace-     │
│                     │           │   Subscriber()           │
│ trace/trace-events  │           │                          │
│  TraceEvent union   │           │ store/game-store.ts      │
│  AiDecisionTrace    │           │  emits events via bus    │
│  TraceSubscriber    │           │                          │
└────────────────────┘           │ session/active-game-     │
                                 │  runtime.ts              │
                                 │  creates bus + wires     │
                                 │  subscriber (DEV only)   │
                                 └──────────────────────────┘
```

## Key Design Decisions

1. **Kernel stays pure** — trace bus is NOT injected into the kernel. It's infrastructure alongside the store.
2. **Synchronous dispatch** — subscribers are called synchronously on `emit()`. No async, no queuing.
3. **Engine-agnostic** — trace events reference engine types (StateDelta, Move, etc.) but carry no game-specific semantics.
4. **AI decision metadata** — `selectAiMove()` returns `AiMoveSelectionResult` with metadata (index, candidate count) so the store can include it in trace events.
5. **Toggle via DEV flag** — console subscriber is only wired in `import.meta.env.DEV` (Vite dev mode).

## TraceEvent Types

```typescript
type TraceEvent =
  | GameInitializedEvent    // seed, playerCount, phase
  | MoveAppliedEvent        // player, move, deltas, triggers, effectTrace, aiDecision?
  | GameTerminalEvent       // result, turnCount

interface AiDecisionTrace {
  readonly seatType: 'ai-random' | 'ai-greedy';
  readonly candidateCount: number;
  readonly selectedIndex: number;
}
```

## TraceBus Interface

```typescript
interface TraceBus {
  subscribe(fn: TraceSubscriber): () => void;
  emit(event: TraceEvent): void;
  unsubscribeAll(): void;
}
```

## Console Output Format

```
▶ Turn 3 | Player 2 (ARVN) | Train [ai-greedy]
  ▶ State Changes (4 deltas)
    zones.saigon: ["troop_1"] → ["troop_1", "troop_2", "troop_3"]
    perPlayerVars.2.resources: 15 → 13
  ▶ Triggers (1 fired)
    momentum_shift @ depth 1
  ▶ Effect Trace (6 entries)
    moveToken: troop_2 → saigon
    varChange: resources = 13
  ▶ AI Decision
    ai-greedy | 7 candidates | selected #0
```

## Files

### New
- `packages/engine/src/trace/trace-bus.ts`
- `packages/engine/src/trace/trace-events.ts`
- `packages/engine/src/trace/index.ts`
- `packages/runner/src/trace/console-trace-subscriber.ts`
- `packages/runner/src/trace/index.ts`
- `packages/engine/test/unit/trace/trace-bus.test.ts`
- `packages/runner/test/trace/console-trace-subscriber.test.ts`

### Modified
- `packages/engine/package.json` — added `./trace` export
- `packages/runner/src/store/ai-move-policy.ts` — returns `AiMoveSelectionResult`
- `packages/runner/src/store/game-store.ts` — emits trace events via bus
- `packages/runner/src/session/active-game-runtime.ts` — creates bus, wires subscriber

## Testing

- **Engine unit tests**: subscribe, emit, unsubscribe, unsubscribeAll, no-op on empty bus
- **Runner unit tests**: console.group/log/groupEnd mock verification for all event types
- **Existing ai-move-policy tests**: updated for new `AiMoveSelectionResult` return shape
