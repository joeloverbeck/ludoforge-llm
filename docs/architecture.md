# Architecture

Engine source modules are under `packages/engine/src/`, with a separate runner package under `packages/runner/`:

| Directory | Purpose |
|-----------|---------|
| `packages/engine/src/kernel/` | Pure, deterministic game engine — state init, legal move enumeration, condition eval, effect application, trigger dispatch, terminal detection, spatial queries, derived values |
| `packages/engine/src/cnl/` | Game Spec parsing (Markdown + YAML blocks, YAML 1.2 strict), validation, macro expansion (including board generation), compilation to GameDef JSON |
| `packages/engine/src/agents/` | Policy-agent runtime, diagnostics, and factory helpers conforming to a strict `Agent` interface |
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

## Runtime Ownership

`GameDefRuntime` mixes two ownership classes:

- `sharedStructural`: runtime artifacts that are pure functions of the compiled `GameDef` and may be reused across arbitrarily many runs
- `runLocal`: mutable memo state that must start clean for each run

The current runtime contract is:

| Member | Ownership | Notes |
|---|---|---|
| `adjacencyGraph` | `sharedStructural` | Pure function of `def.zones` |
| `runtimeTableIndex` | `sharedStructural` | Pure function of `def` |
| `zobristTable.seed` / `fingerprint` / `seedHex` / `sortedKeys` | `sharedStructural` | Structural Zobrist metadata |
| `zobristTable.keyCache` | `runLocal` | Lazy memo table reset at each run boundary |
| `alwaysCompleteActionIds` | `sharedStructural` | Compiled once from `def` |
| `firstDecisionDomains` | `sharedStructural` | Compiled once from `def` |
| `ruleCardCache` | `sharedStructural` | Lazily populated, but keyed only by bounded structural inputs under one compiled `GameDef` |
| `compiledLifecycleEffects` | `sharedStructural` | Compiled once from `def` |

`forkGameDefRuntimeForRun(...)` is the run-boundary guard. It preserves every `sharedStructural` reference and resets only `zobristTable.keyCache`. Callers may safely reuse a compiled runtime across many runs only through that ownership contract.

### Lifetime Classes

Spec 143 classifies live engine support structures with three lifetime classes:

- `persistent-authoritative`: part of `GameState` or other authoritative replay-relevant state
- `run-local-structural`: reusable within one run, but bounded independently of decision count
- `decision-local-transient`: valid only for the current publication / preview / witness-search scope and must be discarded once that scope completes

The authoritative audit below converts Spec 143's starter table into a path-backed contract. Where the live code still lacks an explicit drop-at-scope-exit seam, that gap is called out directly so follow-on tickets can target the real owner boundary.

### Authoritative Classification

#### `GameDefRuntime` structural tables

| Structure | Source | Confirmed class | Lifecycle start | Lifecycle end | Canonical identity status | Heap evidence |
|---|---|---|---|---|---|---|
| `adjacencyGraph` | `packages/engine/src/kernel/gamedef-runtime.ts:17-21,61-67` | `run-local-structural` | Built once in `createGameDefRuntime(...)` from `def.zones` | Ends when the owning `GameDefRuntime` is dropped; preserved across `forkGameDefRuntimeForRun(...)` | compact | not in top-N; classification from code reading |
| `runtimeTableIndex` | `packages/engine/src/kernel/gamedef-runtime.ts:20-21,61-68` | `run-local-structural` | Built once in `createGameDefRuntime(...)` from `def` | Ends when the owning `GameDefRuntime` is dropped; preserved across `forkGameDefRuntimeForRun(...)` | compact | not in top-N; classification from code reading |
| `alwaysCompleteActionIds` | `packages/engine/src/kernel/gamedef-runtime.ts:27-29,61-70` | `run-local-structural` | Compiled once in `createGameDefRuntime(...)` | Ends when the owning `GameDefRuntime` is dropped; preserved across `forkGameDefRuntimeForRun(...)` | compact | not in top-N; classification from code reading |
| `firstDecisionDomains` | `packages/engine/src/kernel/gamedef-runtime.ts:29-30,61-70` | `run-local-structural` | Compiled once in `createGameDefRuntime(...)` | Ends when the owning `GameDefRuntime` is dropped; preserved across `forkGameDefRuntimeForRun(...)` | compact | not in top-N; classification from code reading |
| `ruleCardCache` | `packages/engine/src/kernel/gamedef-runtime.ts:31-38,61-72`; `packages/engine/src/kernel/condition-annotator.ts:397-430` | `run-local-structural` | Map allocated in `createGameDefRuntime(...)`; lazily populated from bounded structural keys (`action.id`, `actionClass`, `eventCard.id`) | Ends when the owning `GameDefRuntime` is dropped; preserved across `forkGameDefRuntimeForRun(...)` | compact | not in top-N; classification from code reading |
| `compiledLifecycleEffects` | `packages/engine/src/kernel/gamedef-runtime.ts:37-38,61-72`; `packages/engine/src/kernel/phase-lifecycle.ts:352-364` | `run-local-structural` | Compiled once in `createGameDefRuntime(...)` | Ends when the owning `GameDefRuntime` is dropped; preserved across `forkGameDefRuntimeForRun(...)` | compact | not in top-N; classification from code reading |

These are the concrete members behind Spec 143's starter-table row "GameDefRuntime structural tables". They are reusable within one run and across repeated runs of the same compiled definition because their retained population is bounded by the compiled `GameDef`, not by decision count.

#### `zobristTable.keyCache`

- Structure: `packages/engine/src/kernel/zobrist.ts:215-229`; runtime owner `packages/engine/src/kernel/gamedef-runtime.ts:22-26,84-95`
- Confirmed class: `run-local-structural`
- Lifecycle start: `createZobristTable(...)` allocates `keyCache`; every forked run gets a fresh `new Map()` from `forkGameDefRuntimeForRun(...)`
- Lifecycle end: explicit reset at the run boundary in `forkGameDefRuntimeForRun(...)`; otherwise ends when the forked runtime is dropped
- Canonical identity status: compact. Keys are encoded Zobrist features, not oversized serialized replay payloads
- Heap-snapshot evidence: direct top-N match in [reports/spec-143-heap-snapshot.md](/home/joeloverbeck/projects/ludoforge-llm/reports/spec-143-heap-snapshot.md) with representative retained size growth from `1.11 MiB` at turn `0` to `1.97 MiB` at turn `3`

This remains the first clearly runtime-owned growing top-N retainer in the 001 capture. The audit confirms the intended class and the existing run-boundary reset owner.

#### Token-state index

- Structure: `packages/engine/src/kernel/token-state-index.ts:13-68`
- Confirmed class: `run-local-structural`
- Lifecycle start: `getTokenStateIndex(...)` lazily builds and memoizes the index in a module-level `WeakMap` keyed by `state.zones`
- Lifecycle end: explicit invalidation via `invalidateTokenStateIndex(...)`, or implicit collection when the keyed `state.zones` object becomes unreachable
- Canonical identity status: compact. Entries are keyed by `token.id` and contain direct live-token location data rather than serialized decision payloads
- Heap-snapshot evidence: not in 001 top-N; classification from code reading and bounded-by-live-token-count shape

The current contract is acceptable for Spec 143's class boundary: retention tracks the live `GameState.zones` object, not the total number of decisions processed over the run.

#### Policy preview and evaluation contexts

- Structure: `packages/engine/src/agents/policy-preview.ts:202-343,357-489`; owner creation `packages/engine/src/agents/policy-runtime.ts:113-148`
- Confirmed class: `decision-local-transient`
- Lifecycle start: `createPolicyPreviewRuntime(...)` allocates a preview-local `cache`; each preview outcome allocates a `metricCache` and lazily a `victorySurface`
- Lifecycle end: no explicit drop hook today; the preview/runtime providers are reclaimed only when the owning policy-runtime provider object becomes unreachable
- Canonical identity status: compact. The main cache is keyed by `candidate.stableMoveKey`, not by serialized state snapshots
- Heap-snapshot evidence: not in 001 top-N; classification from code reading

This matches the spec's intended scope, but the drop rule is currently object-lifetime-only rather than an explicit scope-exit seam. That missing owner boundary is a `143BOURUNMEM-004` target.

#### ChooseN `probeCache` and `legalityCache`

- Structure: `packages/engine/src/kernel/choose-n-session.ts:276-317,321-349,370-530`
- Confirmed class: `decision-local-transient`
- Lifecycle start: `createChooseNSession(...)` allocates both caches empty for one chooseN interaction
- Lifecycle end: `isSessionValid(...)` declares the session stale when the worker-local revision changes; comments at `281-283` state the caches are cleared when the session is discarded. No explicit `clear()` helper exists in this module yet
- Canonical identity status: compact enough for the current audit. Keys are selection fingerprints, not whole replay payloads
- Heap-snapshot evidence: not in 001 top-N; 001 also recorded a causal toggle showing `probeCache` is not the primary remaining driver

The class assignment is confirmed, but the drop rule is still documented-by-convention rather than enforced by a dedicated scope owner. That enforcement gap belongs to `143BOURUNMEM-004`.

#### `DecisionStackFrame` live fields

- Structure: `packages/engine/src/kernel/microturn/types.ts:205-212`
- Confirmed class: split ownership
- Lifecycle start: root and child frames are created in `packages/engine/src/kernel/microturn/apply.ts:297-327` and `415-458`; choose-one frame snapshots are created in `packages/engine/src/kernel/microturn/publish.ts:737-760`
- Lifecycle end: child frames are popped with `decisionStack?.slice(0, -1)` in `packages/engine/src/kernel/microturn/apply.ts:635-643`; full stacks are cleared at microturn completion / turn retirement in `packages/engine/src/kernel/microturn/apply.ts:71-75,659-663`
- Heap-snapshot evidence: not in 001 top-N; classification from code reading plus prior investigation notes captured in Spec 143

Field-level classification:

| Field | Class | Reason |
|---|---|---|
| `frameId`, `parentFrameId`, `turnId`, `context` | `persistent-authoritative` | Required to resume the exact in-progress microturn chain and therefore part of authoritative continuation state while the stack is live |
| `effectFrame` | `persistent-authoritative` | Suspended execution snapshot needed to continue deterministic effect execution |
| `accumulatedBindings` | split: root-frame continuation payload is `persistent-authoritative`; duplicated child-frame copies are `decision-local-transient` | Root bindings are needed to rebuild/continue the active move; child-frame duplication is not authoritative and was already identified by Spec 143 as removable transient overhead |

The audit therefore confirms the starter-table "split" verdict rather than collapsing the whole frame to one class.

#### Granted-operation and decision-preview helper state

- Structure: granted-operation preview path in `packages/engine/src/agents/policy-preview.ts:380-472`
- Confirmed class: `decision-local-transient`
- Lifecycle start: helper state is allocated only while `tryApplyGrantedOperationPreview(...)` evaluates one preview candidate
- Lifecycle end: no dedicated drop site; values are retained only through the enclosing preview outcome cached by the current preview runtime
- Canonical identity status: compact. The helper retains direct move/score/margin values rather than oversized serialized state blobs
- Heap-snapshot evidence: not in 001 top-N; classification from code reading

This is preview-scope helper state, not authoritative game state. Its current retention boundary is the enclosing preview runtime rather than an explicit "decision finished" drop hook, so the scope-boundary work also belongs to `143BOURUNMEM-004`.

### Audit Gaps From 001

#### Parsed GameSpec tree and `sourceMap.byPath`

- Structure: `packages/engine/src/cnl/load-gamespec-source.ts:45-78`; `packages/engine/src/cnl/compose-gamespec.ts:57-150`; `packages/engine/src/cnl/parser.ts:31-133`; `packages/engine/src/cnl/source-map.ts:1-9`
- Confirmed class: `run-local-structural`
- Lifecycle start: `loadGameSpecBundleFromEntrypoint(...)` loads markdown sources, composes them, and retains `sources`, `parsed.doc`, `parsed.sourceMap`, and diagnostics in the returned bundle
- Lifecycle end: no explicit release seam; these structures remain live as long as the loaded bundle or downstream compiled holders retain them
- Canonical identity status: not a canonical-identity issue. This is baseline compile/load scaffolding rather than decision-local serialization
- Heap-snapshot evidence: direct top-N match in 001 as the largest retained region, but flat between the `0`-turn control and `3`-turn capture

This gap is real and large, but the evidence says it is static compile/load baseline cost, not the long-run decision-count growth driver behind Spec 143's motivating OOM. It is therefore documented here so the taxonomy stays aligned with 001, but it is not a `143BOURUNMEM-003` or `143BOURUNMEM-004` owner by default.

#### V8 / module contexts around staged CNL loading and compilation

- Structure: representative evidence mapped from 001 to the staged CNL load/compile path rooted at `packages/engine/src/cnl/load-gamespec-source.ts:45-78` and `packages/engine/src/cnl/compose-gamespec.ts:57-150`
- Confirmed class: `run-local-structural`
- Lifecycle start: module initialization plus staged parse/compose/compile work for the loaded GameSpec bundle
- Lifecycle end: no engine-level drop hook; ends only when the process or module graph is released
- Canonical identity status: not a canonical-identity issue inside engine-owned runtime helpers
- Heap-snapshot evidence: direct top-N match in 001, with effectively flat representative retained size between the control and 3-turn capture

This row is intentionally conservative: the snapshot can prove the population exists, but not a one-to-one engine object boundary for every retained V8 context. The important contract point is that 001 did not show this region as the growing decision-count retainer. It is baseline process overhead adjacent to staged loading/compilation, not evidence against the runtime lifetime classes above.

## Key Data Flow

```
Game Spec (Markdown+YAML) → parseGameSpec → validateGameSpec → expandMacros → compileGameSpecToGameDef → GameDef JSON
GameDef JSON → validateGameDef → initialState(def, seed) → kernel loop (legalMoves → applyMove → dispatch triggers → terminalResult)
```

## Kernel DSL

The kernel operates on ASTs for conditions, effects, and references. Core types: `ConditionAST`, `EffectAST`, `ValueExpr`, `PlayerSel`, `ZoneSel`, `TokenSel`. Effects use bounded iteration (`forEach` over finite collections) — no general recursion. Includes spatial support via board-as-graph (zone adjacency). See the brainstorming spec sections 3.1-3.6 for exact AST shapes.

**Operation-context-only bindings**: `__freeOperation` and `__actionClass` are built-in bindings injected only during operation pipeline execution. They are NOT available in event card effects. Macros that reference them (directly or via sub-macros like `per-province-city-cost`) cannot be called from event cards without inlining the relevant logic. The compiler validates all branches statically — even unreachable ones will fail.
