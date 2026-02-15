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

Active development. The core engine (kernel, compiler, agents, simulator) is implemented and tested. The primary test-case game is **Fire in the Lake (FITL)** — a 4-faction COIN-series wargame being encoded as a fully playable GameSpecDoc.

- **Completed specs** (archived): 01 (scaffolding), 02 (core types), 03 (PRNG/Zobrist), 04 (eval), 05 (effects), 06 (game loop), 07 (spatial), 08a (parser), 08b (compiler), 09 (agents), 10 (simulator), plus FITL specs 16-24
- **Active specs**: 25 (FITL mechanics infrastructure, in progress), 26-31 (FITL operations, events, AI, E2E)
- **Not yet started**: 11 (evaluator/degeneracy), 12 (CLI), 13 (mechanic bundle IR), 14 (evolution pipeline)
- Design spec: `brainstorming/executable-board-game-kernel-cnl-rulebook.md`

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js (>=18.0.0)
- **Testing**: Node.js built-in test runner (`node --test`)
- **Build**: `tsc` (TypeScript compiler)
- **Linting**: ESLint with typescript-eslint
- **Runtime deps**: `yaml` (YAML 1.2 parsing), `zod` (schema validation)
- **Dev deps**: `ajv` (JSON Schema validation in tests), `eslint`, `typescript`

## Architecture

Five source modules under `src/`, plus supporting directories:

| Directory | Purpose |
|-----------|---------|
| `src/kernel/` | Pure, deterministic game engine — state init, legal move enumeration, condition eval, effect application, trigger dispatch, terminal detection, spatial queries, derived values |
| `src/cnl/` | Game Spec parsing (Markdown + YAML blocks, YAML 1.2 strict), validation, macro expansion (including board generation), compilation to GameDef JSON |
| `src/agents/` | Bot implementations (RandomAgent, GreedyAgent) conforming to a strict `Agent` interface |
| `src/sim/` | Simulation runner, trace logging, state delta engine |
| `src/cli/` | Developer commands (stub — not yet implemented) |
| `schemas/` | JSON Schemas for GameDef, Trace, EvalReport (top-level, not under `src/`) |
| `data/` | Optional game reference artifacts and fixtures (not required at runtime) |

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
# Build
npm run build                        # TypeScript compilation (tsc)
npm run clean                        # Remove dist/ for fresh build

# Test (runs against compiled JS in dist/)
npm test                             # Auto-builds via pretest, then unit + integration
npm run test:unit                    # Unit tests only
npm run test:integration             # Integration tests only
npm run test:e2e                     # E2E tests only
npm run test:all                     # Unit + integration + e2e

# Single test file (run against dist/)
node --test dist/test/unit/kernel.test.js

# Lint & Typecheck
npm run lint                         # ESLint
npm run lint:fix                     # ESLint with autofix
npm run typecheck                    # tsc --noEmit
```

## Project Structure

```
src/
  kernel/          # Deterministic game engine
  cnl/             # Parser, validator, compiler
  agents/          # Bot implementations
  sim/             # Simulator and trace
  cli/             # CLI commands (stub)
schemas/           # JSON Schema artifacts
data/              # Optional game reference data
specs/             # Numbered implementation specs
tickets/           # Active implementation tickets
archive/           # Completed tickets, specs, brainstorming, reports
brainstorming/     # Design documents
test/
  unit/            # Individual functions, utilities
  integration/     # Cross-module interactions
  e2e/             # Full pipeline (Game Spec -> compile -> run -> eval)
  fixtures/        # Test fixture files (GameDef JSON, spec Markdown, golden outputs)
  performance/     # Benchmarks
  memory/          # Memory leak detection
```

### Testing Requirements

- **Determinism tests**: same seed + same move sequence = identical final state hash
- **Property tests** (quickcheck style): applyMove never produces invalid var bounds, tokens never duplicate across zones, legalMoves pass preconditions, no crash on random play for N turns
- **Golden tests**: known Game Spec -> expected JSON, known seed trace -> expected output
- **FITL game-rule tests**: compile `data/games/fire-in-the-lake/*.md` via `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`. Do NOT create separate fixture files for FITL profiles, events, or special activities. Foundation fixtures (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`) are kept for engine-level testing with minimal setups.

## Coding Conventions

- **Immutability**: Always create new objects, never mutate. Use spread operators or immutable update patterns.
- **File size**: 200-400 lines typical, 800 max. Many small files over few large files.
- **Organization**: By feature/domain, not by file type.
- **Error handling**: Always handle errors with descriptive messages. Use Zod for input validation at system boundaries.
- **Kernel purity**: The `kernel/` module must be pure and side-effect free. All state transitions return new state objects.
- **Deterministic terminology**: Use `GameDef`, `GameSpecDoc`, `GameTrace` exactly as defined.
- **Schema synchronization**: Keep schema/type changes synchronized across `src/kernel/`, `schemas/`, and tests.

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
   - `**Status**: COMPLETED` - Fully implemented
   - `**Status**: REJECTED` - Decided not to implement
   - `**Status**: DEFERRED` - Postponed for later
   - `**Status**: NOT IMPLEMENTED` - Started but abandoned

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
