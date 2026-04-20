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

## Legal Move Admission Contract

Legal move enumeration now enforces constructibility as part of legality instead of treating it as a client-side follow-up concern.

- **Admission verdicts**: decision-sequence admission distinguishes `satisfiable`, `unsatisfiable`, `unknown`, and `explicitStochastic`.
- **Published move shapes**:
  - complete move: fully bound and immediately executable
  - stochastic move: admitted with a kernel-owned stochastic continuation and no completion certificate
  - incomplete template: admitted only when paired with a kernel-produced completion certificate
- **Mixed deterministic-to-stochastic paths**: when a deterministic prefix is required to reach a later stochastic boundary, legal-move publication materializes that prefix first so the public move is the stochastic continuation itself rather than a pre-stochastic template.
- **Unknown is not public legality**: `unknown` admission states are rejected before publication. Clients never receive an incomplete move that still depends on uncertified search.
- **Certificate side channel**: `enumerateLegalMoves(...)` returns admitted moves plus a kernel-internal `certificateIndex` keyed by move identity. The engine and simulator consume this side channel, but the runner worker bridge strips it before the structured-clone boundary so it does not become part of the public worker contract.

### Agent Fallback

Agents still attempt their normal bounded retry/completion flow first. If a published incomplete template exhausts its retry budget without producing a completion or stochastic continuation, the agent materializes the precomputed certificate instead of doing new search. Certificate materialization is deterministic and does not advance RNG beyond the already-consumed retry attempts.

### Admission Search Shape

The satisfiability classifier performs a bounded DFS over the remaining decision frontier. It records per-invocation memo entries and nogoods so repeated subproblems are short-circuited deterministically. When a satisfiable path is found, the classifier emits the canonical completion certificate for that path; when a stochastic boundary is encountered, it emits the `explicitStochastic` verdict. If a deterministic prefix is needed to reach that boundary, publication materializes the prefix before exposing the move.

## Key Data Flow

```
Game Spec (Markdown+YAML) → parseGameSpec → validateGameSpec → expandMacros → compileGameSpecToGameDef → GameDef JSON
GameDef JSON → validateGameDef → initialState(def, seed) → kernel loop (legalMoves → applyMove → dispatch triggers → terminalResult)
```

## Kernel DSL

The kernel operates on ASTs for conditions, effects, and references. Core types: `ConditionAST`, `EffectAST`, `ValueExpr`, `PlayerSel`, `ZoneSel`, `TokenSel`. Effects use bounded iteration (`forEach` over finite collections) — no general recursion. Includes spatial support via board-as-graph (zone adjacency). See the brainstorming spec sections 3.1-3.6 for exact AST shapes.

**Operation-context-only bindings**: `__freeOperation` and `__actionClass` are built-in bindings injected only during operation pipeline execution. They are NOT available in event card effects. Macros that reference them (directly or via sub-macros like `per-province-city-cost`) cannot be called from event cards without inlining the relevant logic. The compiler validates all branches statically — even unreachable ones will fail.
