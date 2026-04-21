# Architecture

Engine source modules are under `packages/engine/src/`, with a separate runner package under `packages/runner/`:

| Directory | Purpose |
|-----------|---------|
| `packages/engine/src/kernel/` | Pure, deterministic game engine — state init, legal move enumeration, condition eval, effect application, trigger dispatch, terminal detection, spatial queries, derived values |
| `packages/engine/src/cnl/` | Game Spec parsing (Markdown + YAML blocks, YAML 1.2 strict), validation, macro expansion (including board generation), compilation to GameDef JSON |
| `packages/engine/src/agents/` | Bot implementations (RandomAgent, GreedyAgent) conforming to a strict `Agent` interface |
| `packages/engine/src/sim/` | Simulation runner, trace logging, state delta engine |
| `packages/engine/src/cli/` | Developer commands (stub — not yet implemented) |
| `packages/engine/schemas/` | JSON Schemas for GameDef, Trace, EvalReport |
| `packages/runner/src/worker/` | Web Worker running the kernel off-main-thread via Comlink |
| `packages/runner/src/bridge/` | Game bridge connecting worker responses to store updates |
| `packages/runner/src/store/` | Zustand game store with lifecycle state machine |
| `packages/runner/src/model/` | Render model derivation — transforms GameState into UI-friendly structures |
| `packages/runner/src/utils/` | Runner utilities (display name formatting, etc.) |
| `packages/runner/src/canvas/` | PixiJS canvas layer — renderers (zone, token, adjacency), interactions (keyboard, pointer, ARIA), viewport (pan/zoom/clamp), position store, canvas updater |
| `packages/runner/src/map-editor/` | Map editor screen, editor store, editor-specific renderers, and editor canvas wrapper built on shared canvas infrastructure |
| `packages/runner/src/ui/` | React DOM UI layer — panels (scoreboard, choice, variables, events, hand, effects), overlays (terminal, AI turn, interrupt), toolbar, phase indicator, tooltip, error boundary |
| `packages/runner/src/animation/` | GSAP animation system — controller, queue, presets, AI playback, reduced motion, timeline builder, trace-to-descriptor mapping |
| `packages/runner/src/input/` | Keyboard coordinator — unified shortcut handling across canvas and DOM layers |
| `packages/runner/src/types/` | Shared type declarations (CSS modules, etc.) |
| `packages/runner/src/bootstrap/` | Default game definition for dev bootstrapping |
| `packages/runner/src/` | React entry point (`App.tsx`, `main.tsx`) |
| `data/` | Optional game reference artifacts and fixtures — `data/games/fire-in-the-lake/` and `data/games/texas-holdem/` (not required at runtime) |

## Runner Rendering Architecture

The runner has two screen-specific rendering flows mounted from `App.tsx`:

- **Active game flow**: `sessionState.screen === 'activeGame'` mounts `GameCanvas.tsx`, which creates `createGameCanvasRuntime` and drives renderer updates through `createCanvasUpdater`. Game renderers live under `packages/runner/src/canvas/renderers/`.
- **Map editor flow**: `sessionState.screen === 'mapEditor'` mounts `MapEditorScreen.tsx`, which creates `createEditorCanvas` and wires editor-specific renderers from `packages/runner/src/map-editor/` via direct editor-store subscriptions.

These flows are separate where debugging usually happens: renderer modules, screen logic, and store/runtime orchestration. A change to the game adjacency, zone, or route renderers will not change the map editor renderer behavior, and vice versa.

They are not fully isolated stacks. Both flows reuse shared Pixi bootstrapping from `create-app.ts`, and the editor also reuses shared viewport setup from `viewport-setup.ts`. Changes in that shared canvas substrate can affect both flows.

## Core Design Constraints

- **Deterministic**: same seed + same actions = same result
- **Enumerable**: legal moves must be listable (no free-text moves)
- **Finite**: all choices bounded (tokens from zones, ints from ranges, enums)
- **Bounded iteration only**: `forEach` over finite collections, `repeat N` with compile-time bounds, no general recursion, trigger chains capped at depth K
- **Small instruction set**: mechanics emerge from composition, not bespoke primitives

## Microturn Protocol

The kernel publishes one atomic decision at a time. `publishMicroturn(def, state)` returns a `MicroturnState` whose legal actions are all directly executable. `applyDecision(def, state, decision)` advances exactly one decision, possibly opening sub-decisions via the decision stack. `advanceAutoresolvable(def, state, rng)` auto-applies chance / grant / turn-retirement microturns until the next player decision.

Compound human-visible turns are derived post-hoc from the decision sequence by `turnId` grouping. See `GameTrace.compoundTurns[]`.

The decision stack is the kernel-owned control structure for in-progress microturn chains. Each `DecisionStackFrame` carries the active decision context, accumulated bindings, a turn-scoped frame identifier, and the suspended effect-execution snapshot needed to resume nested choices without reconstructing client-side search state. Parent/child frame links preserve nesting order while keeping the publication surface atomic: clients only ever receive the top-frame microturn.

Suspend/resume is explicit. When effect execution reaches a player choice, choose-N step, stochastic branch, or kernel-owned continuation boundary, the kernel snapshots the current effect frame and publishes the next atomic decision context instead of exposing a partially executable compound move. Resuming that frame after `applyDecision(...)` continues the exact bounded effect program with deterministic local bindings and trigger queue state intact.

Hidden-information projection remains part of the same protocol rather than a separate legality layer. `publishMicroturn(...)` derives the observation for the active decider at that exact microturn scope, so legal actions, visible state, and agent input stay aligned under one kernel authority. Chance and kernel-owned microturns keep omniscient access internally, while player-facing publication respects seat visibility rules.

Trace output follows the same granularity. `DecisionLog[]` records one entry per applied microturn, including the decision-context kind, decision payload, turn/frame identifiers, and any trace extras. Analytics-side compound turn summaries are derived later from those atomic logs by `turnId`; they are useful for presentation and reporting, but they are not a second authoritative rules surface.

## Key Data Flow

```
Game Spec (Markdown+YAML) → parseGameSpec → validateGameSpec → expandMacros → compileGameSpecToGameDef → GameDef JSON
GameDef JSON → validateGameDef → initialState(def, seed) → kernel loop (legalMoves → applyMove → dispatch triggers → terminalResult)
```

## Kernel DSL

The kernel operates on ASTs for conditions, effects, and references. Core types: `ConditionAST`, `EffectAST`, `ValueExpr`, `PlayerSel`, `ZoneSel`, `TokenSel`. Effects use bounded iteration (`forEach` over finite collections) — no general recursion. Includes spatial support via board-as-graph (zone adjacency). See the brainstorming spec sections 3.1-3.6 for exact AST shapes.

**Operation-context-only bindings**: `__freeOperation` and `__actionClass` are built-in bindings injected only during operation pipeline execution. They are NOT available in event card effects. Macros that reference them (directly or via sub-macros like `per-province-city-cost`) cannot be called from event cards without inlining the relevant logic. The compiler validates all branches statically — even unreachable ones will fail.
