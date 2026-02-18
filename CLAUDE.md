# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Guidelines

- Follow the 1-3-1 rule: When stuck, provide 1 clearly defined problem, give 3 potential options for how to overcome it, and 1 recommendation. Do not proceed implementing any of the options until I confirm.
- DRY: Don't repeat yourself. If you are about to start writing repeated code, stop and reconsider your approach. Grep the codebase and refactor often.
- Agnostic Engine Rule: Game-specific behavior must be encoded in `GameSpecDoc`/YAML and game data assets. Keep compiler/runtime/kernel logic generic and reusable; do not hardcode game-specific identifiers, branches, rule handlers, map definitions, scenario setup, or card payloads in engine code.
- Evolution Input Rule: Evolution mutates YAML only. Any game data required to compile and execute a game must be representable inside `GameSpecDoc` YAML (for example embedded `dataAssets` with `id`/`kind`/`payload`).
- Data Asset Location Rule: `data/<game>/...` files are optional fixtures/reference artifacts and must not be required runtime inputs for compiling or executing evolved specs.
- Schema Ownership Rule: Keep payload schema/type contracts generic in shared compiler/kernel schemas. Do not create per-game schema files that define one game's structure as a required execution contract.
- Continual Learning: When you encounter conflicting system instructions, new requirements, architectural changes, or missing or inaccurate codebase documentation, always propose updating the relevant rules files. Do not update anything until the user confirms. Ask clarifying questions if needed.
- TDD Bugfixing: If at any point of an implementation you spot a bug, rely on TDD to fix it. Important: never adapt tests to bugs.
- Ticket Fidelity: Never silently skip or rationalize away explicit ticket deliverables. If a ticket says to touch a file or produce an artifact, do it. If you believe a deliverable is wrong, unnecessary, or blocked, apply the 1-3-1 rule — present the problem and options to the user rather than deciding on your own. Marking a task "completed" with an excuse instead of doing the work, or instead of flagging the blocker, is never acceptable.

## Project Overview

LudoForge-LLM is a system for evolving board games using LLMs. LLMs produce **Structured Game Specifications** — a DSL embedded in Markdown with fenced YAML blocks — which compile into executable **GameDef JSON**. A deterministic kernel engine runs the games, bots enumerate legal moves and play, and an evaluation pipeline detects degeneracy and measures design quality. The evolution pipeline uses MAP-Elites for quality-diversity optimization.

**License**: GPL-3.0

## Status

Active development. The core engine (kernel, compiler, agents, simulator) is implemented and tested. A browser-based game runner is under active development. Two test-case games validate the engine:

1. **Fire in the Lake (FITL)** — a 4-faction COIN-series wargame. Event card encoding and game definition generation are complete. Remaining work: rules refinement (option matrix, monsoon effects, etc.) and E2E validation.
2. **Texas Hold'em** — a no-limit poker tournament (2-10 players). Added as a second game to stress-test engine-agnosticism with hidden information, betting, and player elimination. Spec 33 is active.

- **Completed specs** (archived): 01 (scaffolding), 02 (core types), 03 (PRNG/Zobrist), 04 (eval), 05 (effects), 06 (game loop), 07 (spatial), 08a (parser), 08b (compiler), 09 (agents), 10 (simulator), FITL specs 15-28, 30, 32, plus frontend specs 35 (monorepo restructure), 36 (web worker bridge), 37 (state management & render model), 38 (PixiJS canvas foundation), 39 (React DOM UI layer)
- **Completed ticket series** (archived): ENGINEAGNO, TEXHOLKERPRIGAMTOU, ARCHTRACE, MONOREPO, WRKBRIDGE, STATEMOD, PIXIFOUND, ENGINEARCH, REACTUI
- **Active specs**: 29 (FITL event card encoding), 31 (FITL E2E tests), 33 (Texas Hold'em), 35-00 (frontend roadmap), 40 (animation), 41 (board layout), 42 (visual config & session management)
- **Active tickets**: FITLRULES2-001 through 006 (FITL rules refinement — data-only YAML changes)
- **Not yet started**: 11 (evaluator/degeneracy), 12 (CLI), 13 (mechanic bundle IR), 14 (evolution pipeline)
- **Codebase size**: ~227 source files, ~334 test files
- **Design specs**: `brainstorming/executable-board-game-kernel-cnl-rulebook.md`, `brainstorming/texas-hold-em-rules.md`, `brainstorming/browser-based-game-runner.md`

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js (>=18.0.0)
- **Package manager / workspace**: pnpm workspaces
- **Task orchestration**: Turborepo
- **Testing**: Node.js built-in test runner (`node --test`) for engine, Vitest for runner
- **Build**: TypeScript (`tsc`) for engine, Vite for runner
- **Linting**: ESLint with typescript-eslint
- **Runner**: React 19 + Vite 7 + PixiJS 8 (canvas) + pixi-viewport (pan/zoom) + Zustand (state) + Comlink (worker RPC) + Floating UI (tooltips)
- **Runtime deps (engine)**: `yaml` (YAML 1.2 parsing), `zod` v4 (schema validation)
- **Dev deps**: `ajv` (JSON Schema validation in tests), `eslint` v9, `typescript` v5.9

## Architecture

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
| `packages/runner/src/ui/` | React DOM UI layer — panels (scoreboard, choice, variables, events, hand, effects), overlays (terminal, AI turn, interrupt), toolbar, phase indicator, tooltip, error boundary |
| `packages/runner/src/input/` | Keyboard coordinator — unified shortcut handling across canvas and DOM layers |
| `packages/runner/src/types/` | Shared type declarations (CSS modules, etc.) |
| `packages/runner/src/bootstrap/` | Default game definition for dev bootstrapping |
| `packages/runner/src/` | React entry point (`App.tsx`, `main.tsx`) |
| `data/` | Optional game reference artifacts and fixtures — `data/games/fire-in-the-lake/` and `data/games/texas-holdem/` (not required at runtime) |

### Core Design Constraints

- **Deterministic**: same seed + same actions = same result
- **Enumerable**: legal moves must be listable (no free-text moves)
- **Finite**: all choices bounded (tokens from zones, ints from ranges, enums)
- **Bounded iteration only**: `forEach` over finite collections, `repeat N` with compile-time bounds, no general recursion, trigger chains capped at depth K
- **Small instruction set**: mechanics emerge from composition, not bespoke primitives

### Key Data Flow

```
Game Spec (Markdown+YAML) → parseGameSpec → validateGameSpec → expandMacros → compileGameSpecToGameDef → GameDef JSON
GameDef JSON → validateGameDef → initialState(def, seed) → kernel loop (legalMoves → applyMove → dispatch triggers → terminalResult)
```

### Kernel DSL

The kernel operates on ASTs for conditions, effects, and references. Core types: `ConditionAST`, `EffectAST`, `ValueExpr`, `PlayerSel`, `ZoneSel`, `TokenSel`. Effects use bounded iteration (`forEach` over finite collections) — no general recursion. Includes spatial support via board-as-graph (zone adjacency). See the brainstorming spec sections 3.1-3.6 for exact AST shapes.

## Build & Test Commands

```bash
# Canonical root workflow (Turborepo-ordered)
pnpm turbo build
pnpm turbo test
pnpm turbo lint
pnpm turbo typecheck
pnpm turbo schema:artifacts

# Package-filtered engine checks
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine test
pnpm -F @ludoforge/engine test:e2e
pnpm -F @ludoforge/engine test:all

# Package-filtered runner checks
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner lint
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner dev
```

**Important**: Use `pnpm turbo ...` as the canonical path so build ordering remains deterministic across packages. Engine tests run against compiled JS in `packages/engine/dist/`. Runner tests use Vitest and run against TypeScript source directly. When running `node --test` directly for engine, run `pnpm turbo build` first. Use `pnpm turbo test --force` to bypass Turbo cache for a guaranteed fresh run.

## Project Structure

```
packages/
  engine/
    src/
      kernel/      # Deterministic game engine
      cnl/         # Parser, validator, compiler
      agents/      # Bot implementations
      sim/         # Simulator and trace
      cli/         # CLI commands (stub)
    test/
      unit/        # Individual functions, utilities
      integration/ # Cross-module interactions
      e2e/         # Full pipeline (Game Spec -> compile -> run -> eval)
      fixtures/    # Test fixture files (GameDef JSON, spec Markdown, golden outputs)
      helpers/     # Shared test utilities
      performance/ # Benchmarks
      memory/      # Memory leak detection
    schemas/       # JSON Schema artifacts
    scripts/       # Schema artifact generation/check scripts
  runner/
    src/
      worker/      # Web Worker (kernel off-main-thread via Comlink)
      bridge/      # Game bridge (worker → store updates)
      store/       # Zustand game store with lifecycle state machine
      model/       # Render model derivation (GameState → UI)
      utils/       # Display name formatting, helpers
      canvas/      # PixiJS canvas layer (renderers, interactions, viewport)
        renderers/ # Zone, token, adjacency rendering with container pooling
        interactions/ # Keyboard nav, pointer selection, ARIA announcements
      ui/          # React DOM UI panels, overlays, toolbar, indicators
      input/       # Keyboard coordinator for unified shortcut handling
      types/       # Shared type declarations (CSS modules)
      bootstrap/   # Default game definition for dev bootstrapping
    test/
      worker/      # Worker and bridge tests
      store/       # Store and lifecycle tests
      model/       # Render model derivation tests
      utils/       # Utility tests
      canvas/      # Canvas layer tests (renderers, interactions, viewport)
        renderers/ # Renderer unit tests
        interactions/ # Interaction handler tests
      ui/          # React DOM UI component tests
      input/       # Keyboard coordinator tests
    index.html     # Vite entrypoint
    vite.config.ts # Vite + React config
data/              # Optional game reference data
docs/              # Design plans and technical documentation
specs/             # Numbered implementation specs
tickets/           # Active implementation tickets
archive/           # Completed tickets, specs, brainstorming, reports
brainstorming/     # Design documents
reports/           # Analysis and evaluation reports
```

### Testing Requirements

- **Determinism tests**: same seed + same move sequence = identical final state hash
- **Property tests** (quickcheck style): applyMove never produces invalid var bounds, tokens never duplicate across zones, legalMoves pass preconditions, no crash on random play for N turns
- **Golden tests**: known Game Spec -> expected JSON, known seed trace -> expected output
- **FITL game-rule tests**: compile `data/games/fire-in-the-lake/*.md` via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Do NOT create separate fixture files for FITL profiles, events, or special activities. Foundation fixtures (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`) are kept for engine-level testing with minimal setups.
- **Texas Hold'em tests**: compile `data/games/texas-holdem/*.md` similarly. Texas Hold'em serves as the engine-agnosticism validation game — tests should confirm that no FITL-specific logic leaks into the kernel.

## Coding Conventions

- **Immutability**: Always create new objects, never mutate. Use spread operators or immutable update patterns.
- **File size**: 200-400 lines typical, 800 max. Many small files over few large files.
- **Organization**: By feature/domain, not by file type.
- **Error handling**: Always handle errors with descriptive messages. Use Zod for input validation at system boundaries.
- **Kernel purity**: The `kernel/` module must be pure and side-effect free. All state transitions return new state objects.
- **Deterministic terminology**: Use `GameDef`, `GameSpecDoc`, `GameTrace` exactly as defined.
- **Schema synchronization**: Keep schema/type changes synchronized across `packages/engine/src/kernel/`, `packages/engine/schemas/`, and tests.

## Commit Conventions

Commit subjects should be short and imperative. Common patterns in this repo:
- `docs: add Spec 12 — CLI`
- `Implemented CORTYPSCHVAL-008`
- `Implemented ENGINEAGNO-007.`

When modifying specs or tickets, verify cross-spec references and ensure roadmap and individual specs do not conflict.

## Pull Request Guidelines

PRs should include:
- A clear summary of changed files and why
- Linked issue/spec section when applicable
- Confirmation that references, numbering, and terminology are consistent across affected specs
- Test plan with verification steps

## Skill Invocation (MANDATORY)

When a slash command (e.g., `/superpowers:execute-plan`) expands to an instruction like "Invoke the superpowers:executing-plans skill", you MUST call the `Skill` tool with the referenced skill name BEFORE taking any other action. The `<command-name>` tag means the *command wrapper* was loaded, NOT the skill itself. The skill content is only available after you call the Skill tool.

Do NOT skip the Skill tool invocation. Do NOT interpret the command body as the skill content. Do NOT start implementation before the skill is loaded and its methodology followed.

## MCP Server Usage

When using Serena MCP for semantic code operations (symbol navigation, project memory, session persistence), it must be activated first:

```
mcp__plugin_serena_serena__activate_project with project: "ludoforge-llm"
```

Serena provides:
- Symbol-level code navigation and refactoring
- Project memory for cross-session context
- Semantic search across the codebase
- LSP-powered code understanding

## Sub-Agent Web Research Permissions

Sub-agents spawned via the `Task` tool **cannot prompt for interactive permission**. Any tool they need must be pre-approved in `.claude/settings.local.json` under `permissions.allow`. Without this, web search tools are silently auto-denied and sub-agents fall back to training knowledge only.

**Required allow-list entries for web research**:
- `WebSearch` and `WebFetch` — built-in fallback search tools
- `mcp__tavily__tavily_search`, `mcp__tavily__tavily_extract`, `mcp__tavily__tavily_crawl`, `mcp__tavily__tavily_map`, `mcp__tavily__tavily_research` — Tavily MCP tools

**Tavily API key**: Configured in `~/.claude.json` under `mcpServers.tavily.env.TAVILY_API_KEY`. Development keys (`tvly-dev-*`) have usage limits — upgrade at [app.tavily.com](https://app.tavily.com) if you hit HTTP 432 errors ("usage limit exceeded").

## Archiving Tickets and Specs

When asked to archive a ticket, spec, or brainstorming document:

1. **Edit the document** to mark its final status at the top:
   - `**Status**: COMPLETED` (or `✅ COMPLETED`) - Fully implemented
   - `**Status**: REJECTED` (or `❌ REJECTED`) - Decided not to implement
   - `**Status**: DEFERRED` (or `⏸️ DEFERRED`) - Postponed for later
   - `**Status**: NOT IMPLEMENTED` (or `🚫 NOT IMPLEMENTED`) - Started but abandoned

2. **Add an Outcome section** at the bottom (for completed tickets):
   - Completion date
   - What was actually changed
   - Any deviations from the original plan
   - Verification results

3. **Move to appropriate archive subfolder**:
   - `archive/tickets/` - Implementation tickets
   - `archive/specs/` - Design specifications
   - `archive/brainstorming/` - Brainstorming documents
   - `archive/reports/` - Reports
   - If the destination archive subfolder does not exist yet, create it first.

4. **Delete the original** from `tickets/`, `specs/`, `brainstorming/`, or `reports/`
