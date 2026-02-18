# Spec 35-00: Frontend Implementation Roadmap

**Status**: ACTIVE
**Created**: 2026-02-16
**Scope**: Browser-based game runner — implementation order, dependencies, priorities, milestones

---

## Overview

This roadmap governs implementation of the browser-based game runner (Specs 35–42). The runner lets humans play ANY game compiled through the LudoForge pipeline, with AI opponents, effect-trace-driven animations, and data-driven visuals.

Design document: `brainstorming/browser-based-game-runner.md`
Technology decisions: Appendix A of the same document.

Spec 35 is completed and archived at `archive/specs/35-monorepo-restructure-build-system.md`.
Spec 36 is completed and archived at `archive/specs/36-game-kernel-web-worker-bridge.md`.
Spec 37 is completed and archived at `archive/specs/37-state-management-render-model.md`.
Spec 38 is completed and archived at `archive/specs/38-pixijs-canvas-foundation.md`.
Spec 39 is completed and archived at `archive/specs/39-react-dom-ui-layer.md`.

---

## Spec Registry

| Spec | Title | Priority | Complexity | Dependencies |
|------|-------|----------|------------|--------------|
| 35 | Monorepo Restructure & Build System | P0 | M | None |
| 36 | Game Kernel Web Worker Bridge (completed) | P0 | M | 35 |
| 37 | State Management & Render Model (completed) | P0 | L | 36 |
| 38 | PixiJS Canvas Foundation (completed) | P0 | L | 37 |
| 39 | React DOM UI Layer (completed) | P1 | L | 37, 38 |
| 40 | Animation System | P1 | L | 38 |
| 41 | Board Layout Engine | P1 | M | 38 |
| 42 | Per-Game Visual Config & Session Mgmt | P2 | M | 38, 39 |

Priority key: P0 = critical path, P1 = required for playable experience, P2 = polish/enhancement.
Complexity key: S = small, M = medium, L = large.

---

## Dependency Graph

```
35 (Monorepo)
 └──> 36 (Worker Bridge)
       └──> 37 (State / RenderModel)
             ├──> 38 (PixiJS Canvas)        ← critical path continues
             │     ├──> 40 (Animation)       ← parallel with 41
             │     ├──> 41 (Board Layout)    ← parallel with 40
             │     └──┐
             │        └──> 42 (Visual Config + Session)
             └──> 39 (React DOM UI)          ← parallel with 38
                   └──> 42 (Visual Config + Session)
```

### Critical Path

```
35 → 36 → 37 → 38 → { 40, 41 }
```

Specs 40 and 41 are on parallel branches of the critical path. The earliest milestone gate (F2: Playable Board) requires 35–39.

### Parallel Implementation Opportunities

| After completing... | These can run in parallel |
|---------------------|--------------------------|
| Spec 37 (State) | Spec 38 (Canvas) AND Spec 39 (DOM UI) |
| Spec 38 (Canvas) | Spec 40 (Animation) AND Spec 41 (Board Layout) |
| Spec 38 + 39 | Spec 42 (Visual Config & Session) |

---

## Milestones

### Milestone F1: Foundation (Specs 35–37)

**Gate criteria**:
- [x] Monorepo builds with `pnpm turbo build`
- [x] Existing engine tests pass via `pnpm -F @ludoforge/engine test`
- [x] Kernel runs in Web Worker, Comlink RPC is typed and functional
- [x] Effect trace enabled by default — `applyMove()` returns `effectTrace` for animation pipeline
- [x] `playSequence()` batch execution verified with 10+ move sequences
- [x] `enumerateLegalMoves()` exposes move enumeration warnings to UI layer
- [x] `WorkerError` error taxonomy implemented with structured error codes
- [x] Zustand store receives state updates from worker
- [x] `deriveRenderModel()` is unit-tested for zones/tokens/actions/choices/terminal/metadata projections via synthetic fixtures
- [x] Hidden information filtering verified (owner-only zones, reveal grants)

**Outcome**: Engine is restructured as a monorepo package. The state pipeline (Worker → Store → RenderModel) is proven end-to-end.

### Milestone F2: Playable Board (Specs 38–39)

**Gate criteria**:
- [x] PixiJS renders zones and tokens from RenderModel for any compiled game
- [x] pixi-viewport provides pan/zoom with board clamping
- [x] Zone click-to-select interaction works
- [x] Action toolbar displays grouped legal moves
- [x] Multi-step choice UI with breadcrumb/progress and back/cancel
- [x] Numeric input for parameterized choices (slider with min/max)
- [x] Player hand panel shows owner-visible zone contents
- [x] Variables display panel (global + per-player)
- [x] Phase/turn indicator with active player highlight
- [x] Can complete a full game of Texas Hold'em against AI opponents
- [ ] Can render FITL board (even without graph layout — manual or default positions)

**Outcome**: Any compiled game is playable through the browser runner with basic visuals. Human can make moves, AI opponents respond, game reaches terminal state.

### Milestone F3: Polished Experience (Specs 40–42)

**Gate criteria**:
- [ ] Effect trace drives GSAP timeline animations (token movement, creation, destruction, property changes)
- [ ] Phase transition banners animate
- [ ] Card animations (deal, flip, burn) work
- [ ] Animation speed control (1x, 2x, 4x, pause, skip)
- [ ] AI turn playback with configurable detail level
- [ ] Board auto-layouts from zone adjacency graph via ForceAtlas2
- [ ] Table-only mode for games without adjacency (e.g., Texas Hold'em)
- [ ] Token stacking within zones with expand-on-click
- [ ] Visual config YAML loads and enhances presentation
- [ ] Game selection screen lists available games
- [ ] Pre-game configuration (players, human/AI, seed)
- [ ] Save/load game via Dexie.js
- [ ] Replay mode (step-forward, step-backward, speed control)
- [ ] Event log panel with clickable, filterable entries

**Outcome**: Full browser-based game runner with animations, auto-layout, visual customization, and session management.

---

## Integration Points with Existing Engine

### Existing artifacts consumed by the runner

| Artifact | Source | Consumer |
|----------|--------|----------|
| `GameDef` JSON | `compileGameSpecToGameDef()` in `packages/engine/src/cnl/` | Worker bridge (Spec 36) loads GameDef to initialize kernel |
| `GameState` | `initialState()` in `packages/engine/src/kernel/` | Zustand store (Spec 37) holds current state |
| `Move` / `LegalMovesResult` | `legalMoves()` in `packages/engine/src/kernel/` | DOM UI (Spec 39) renders action toolbar |
| `ChoiceRequest` (pending / complete / illegal) | `legalChoices()` in `packages/engine/src/kernel/` | DOM UI (Spec 39) renders progressive choice UI |
| `EffectTraceEntry[]` | `applyMove()` with `{ trace: true }` in `packages/engine/src/kernel/` | Animation system (Spec 40) drives GSAP timelines |
| `TerminalResult` | `terminalResult()` in `packages/engine/src/kernel/` | DOM UI (Spec 39) displays game end state |
| `GameSpecDoc` metadata | Parsed from Markdown+YAML | Game selection screen (Spec 42) displays game info |

### No changes required to existing engine code

The runner is a pure consumer of the kernel's public API. No modifications to `packages/engine/src/kernel/`, `packages/engine/src/cnl/`, `packages/engine/src/agents/`, or `packages/engine/src/sim/` are required. The monorepo restructure (Spec 35) moved existing code into `packages/engine/` without changing interfaces.

### Future engine specs that may affect the runner

| Engine Spec | Impact on Runner |
|-------------|-----------------|
| Spec 11 (Evaluator) | Runner could display degeneracy scores post-game |
| Spec 12 (CLI) | CLI and runner share GameDef loading — potential shared utility |
| Spec 14 (Evolution) | Evolution pipeline output could feed game selection screen |

---

## Ticket Generation Strategy

Each spec will generate implementation tickets following the project's existing pattern (e.g., `MONOREPO-001`, `WRKBRIDGE-001`, etc.). Tickets are created when a spec becomes the active implementation target — not pre-created for all specs.

Suggested ticket series prefixes:

| Spec | Ticket Prefix |
|------|---------------|
| 35 | MONOREPO |
| 36 | WRKBRIDGE |
| 37 | STATEMOD |
| 38 | PIXIFOUND |
| 39 | REACTUI |
| 40 | ANIMSYS |
| 41 | BOARDLAY |
| 42 | VISCONF |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| @pixi/react v8 too immature | Medium | Medium | Imperative fallback ready. Don't depend on React reconciler for perf-critical canvas updates. |
| Monorepo restructure breaks CI | Low | High | Run full test suite before and after restructure. Keep git history with `git mv`. |
| Large GameDef structured clone overhead | Low | Low | GameDef loaded once at init. State objects <10KB — structured clone is fast. |
| ForceAtlas2 layout quality poor for specific games | Medium | Low | Per-game visual config can override positions. Compute once, cache. |
| Bundle size exceeds target | Low | Medium | Tree-shake PixiJS v8. Monitor with `vite-bundle-visualizer`. |
