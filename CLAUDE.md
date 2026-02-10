# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LudoForge-LLM is a system for evolving board games using LLMs. LLMs produce **Structured Game Specifications** — a DSL embedded in Markdown with fenced YAML blocks — which compile into executable **GameDef JSON**. A deterministic kernel engine runs the games, bots enumerate legal moves and play, and an evaluation pipeline detects degeneracy and measures design quality. The evolution pipeline uses MAP-Elites for quality-diversity optimization.

**License**: GPL-3.0

## Status

Greenfield project. The design spec lives in `brainstorming/executable-board-game-kernel-cnl-rulebook.md`. No source code exists yet — that document is the canonical reference for all implementation decisions.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js
- **Testing**: Node.js built-in test runner (`node --test`)
- **Build**: `tsc` (TypeScript compiler)

## Planned Architecture

Five source modules under `src/`, plus a top-level `schemas/` directory:

| Directory | Purpose |
|-----------|---------|
| `src/kernel/` | Pure, deterministic game engine — state init, legal move enumeration, condition eval, effect application, trigger dispatch, terminal detection |
| `src/cnl/` | Game Spec parsing (Markdown → YAML blocks, YAML 1.2 strict), validation, macro expansion (including board generation), compilation to GameDef JSON |
| `src/agents/` | Bot implementations (RandomAgent, GreedyAgent, optional UCT/MCTS) conforming to a strict `Agent` interface |
| `src/sim/` | Simulation runner, trace logging, metrics computation, degeneracy flag detection |
| `src/cli/` | Developer commands: `spec:lint`, `spec:compile`, `run`, `eval`, `replay` |
| `schemas/` | JSON Schemas for GameDef, GameSpecDoc, Trace, EvalReport (top-level, not under `src/`) |

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

The kernel operates on ASTs for conditions, effects, and references. Core types: `ConditionAST`, `EffectAST`, `ValueExpr`, `PlayerSel`, `ZoneSel`, `TokenSel`. Effects use bounded iteration (`forEach` over finite collections) — no general recursion. Includes spatial support via board-as-graph (zone adjacency). See the brainstorming spec sections 3.1–3.6 for exact AST shapes.

## Build & Test Commands

These are the expected commands once the project is scaffolded:

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
npm run typecheck                    # tsc --noEmit
```

## Test Directory Structure

```
test/
  unit/           # Individual functions, utilities
  integration/    # Cross-module interactions
  e2e/            # Full pipeline (Game Spec → compile → run → eval)
  performance/    # Benchmarks
  memory/         # Memory leak detection
```

### Testing Requirements

- **Determinism tests**: same seed + same move sequence = identical final state hash
- **Property tests** (quickcheck style): applyMove never produces invalid var bounds, tokens never duplicate across zones, legalMoves pass preconditions, no crash on random play for N turns
- **Golden tests**: known Game Spec → expected JSON, known seed trace → expected output

## Coding Conventions

- **Immutability**: Always create new objects, never mutate. Use spread operators or immutable update patterns.
- **File size**: 200–400 lines typical, 800 max. Many small files over few large files.
- **Organization**: By feature/domain, not by file type.
- **Error handling**: Always handle errors with descriptive messages. Use Zod for input validation at system boundaries.
- **Kernel purity**: The `kernel/` module must be pure and side-effect free. All state transitions return new state objects.

## Coding Guidelines

Follow the 1-3-1 rule: When stuck, provide 1 clearly defined problem, give 3 potential options for how to overcome it, and 1 recommendation. Do not proceed implementing any of the options until I confirm.

## Skill Invocation (MANDATORY)

When a slash command (e.g., `/superpowers:execute-plan`) expands to an instruction like "Invoke the superpowers:executing-plans skill", you MUST call the `Skill` tool with the referenced skill name BEFORE taking any other action. The `<command-name>` tag means the *command wrapper* was loaded, NOT the skill itself. The skill content is only available after you call the Skill tool.

Do NOT skip the Skill tool invocation. Do NOT interpret the command body as the skill content. Do NOT start implementation before the skill is loaded and its methodology followed.

## MCP Server Usage

When using Serena MCP for semantic code operations (symbol navigation, project memory, session persistence), it must be activated first:

```
mcp__plugin_serena_serena__activate_project with project: "one-more-branch"
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
   - `**Status**: ✅ COMPLETED` - Fully implemented
   - `**Status**: ❌ REJECTED` - Decided not to implement
   - `**Status**: ⏸️ DEFERRED` - Postponed for later
   - `**Status**: 🚫 NOT IMPLEMENTED` - Started but abandoned

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

4. **Delete the original** from `tickets/`, `specs/`, `brainstorming/`, or `reports/`