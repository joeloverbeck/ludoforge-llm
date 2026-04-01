# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Guidelines

- Follow the 1-3-1 rule: When stuck, provide 1 clearly defined problem, give 3 potential options for how to overcome it, and 1 recommendation. Do not proceed implementing any of the options until I confirm.
- **Foundations**: All specs, tickets, and implementations must align with `docs/FOUNDATIONS.md`. Read it before planning any change.
- DRY: Don't repeat yourself. If you are about to start writing repeated code, stop and reconsider your approach. Grep the codebase and refactor often.
- Continual Learning: When you encounter conflicting system instructions, new requirements, architectural changes, or missing or inaccurate codebase documentation, always propose updating the relevant rules files. Do not update anything until the user confirms. Ask clarifying questions if needed.
- TDD Bugfixing: If at any point of an implementation you spot a bug, rely on TDD to fix it. Important: never adapt tests to bugs.
- Worktree Discipline: When instructed to work inside a worktree (e.g., `.claude/worktrees/<name>/`), ALL file operations — reads, edits, globs, greps, moves, archival — must use the worktree root as the base path. The default working directory is the main repo root; tool calls without an explicit worktree path will silently operate on main.
- Concurrent Session Awareness: If the worktree already contains unrelated edits or build failures, assume another session or user may be active. Do not overwrite or "clean up" those changes. Isolate your diff, call out the unrelated state explicitly, and distinguish repo-preexisting failures from failures caused by your change.
- Ticket Fidelity: Never silently skip or rationalize away explicit ticket deliverables. If a ticket says to touch a file or produce an artifact, do it. If you believe a deliverable is wrong, unnecessary, or blocked, apply the 1-3-1 rule — present the problem and options to the user rather than deciding on your own. Marking a task "completed" with an excuse instead of doing the work, or instead of flagging the blocker, is never acceptable.

## Project Overview

LudoForge-LLM is a system for evolving board games using LLMs. LLMs produce **Structured Game Specifications** — a DSL embedded in Markdown with fenced YAML blocks — which compile into executable **GameDef JSON**. A deterministic kernel engine runs the games, bots enumerate legal moves and play, and an evaluation pipeline detects degeneracy and measures design quality. The evolution pipeline uses MAP-Elites for quality-diversity optimization. **License**: GPL-3.0


## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js (>=18.0.0)
- **Package manager / workspace**: pnpm workspaces
- **Task orchestration**: Turborepo
- **Testing**: Node.js built-in test runner (`node --test`) for engine, Vitest for runner
- **Build**: TypeScript (`tsc`) for engine, Vite for runner
- **Linting**: ESLint with typescript-eslint
- **Runner**: React 19 + Vite 7 + PixiJS 8 (canvas) + pixi-viewport (pan/zoom) + Zustand (state) + Comlink (worker RPC) + Floating UI (tooltips) + GSAP 3 (animation)
- **Runtime deps (engine)**: `yaml` (YAML 1.2 parsing), `zod` v4 (schema validation)
- **Dev deps**: `ajv` (JSON Schema validation in tests), `eslint` v9, `typescript` v5.9

## Architecture

Engine under `packages/engine/src/` (kernel, cnl, agents, sim), runner under `packages/runner/src/`. For the full module map, rendering pipelines, design constraints, data flow, and kernel DSL reference, see `docs/architecture.md`. For the directory tree, see `docs/project-structure.md`.

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
**Important**: Do not use Jest-only CLI flags (for example `--testPathPattern` or `--testPathPatterns`) with engine `test:unit`; engine tests run with `node --test`, not Jest.

## Testing

For test types, FITL/Texas Hold'em conventions, and test placement rules, see `docs/testing-guide.md`.

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

PRs should include a clear summary of changed files and why, linked issue/spec when applicable, confirmation that references and terminology are consistent, and a test plan with verification steps.

## Skill Invocation (MANDATORY)

When a slash command (e.g., `/superpowers:execute-plan`) expands to an instruction like "Invoke the superpowers:executing-plans skill", you MUST call the `Skill` tool with the referenced skill name BEFORE taking any other action. The `<command-name>` tag means the *command wrapper* was loaded, NOT the skill itself. The skill content is only available after you call the Skill tool.

Do NOT skip the Skill tool invocation. Do NOT interpret the command body as the skill content. Do NOT start implementation before the skill is loaded and its methodology followed.

## MCP Server Usage

When using Serena MCP for semantic code operations (symbol navigation, project memory, session persistence), it must be activated first:

```
mcp__plugin_serena_serena__activate_project with project: "ludoforge-llm"
```

## Sub-Agent Permissions

For sub-agent web research permission setup, see `docs/sub-agent-permissions.md`.

## Archiving Tickets and Specs

Follow the canonical archival policy in `docs/archival-workflow.md`.

Do not duplicate or drift this procedure in other files; update `docs/archival-workflow.md` as the source of truth.
