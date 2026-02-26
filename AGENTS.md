# Repository Guidelines

## Coding Guidelines

- Follow the 1-3-1 rule: When stuck, provide 1 clearly defined problem, give 3 potential options for how to overcome it, and 1 recommendation. Do not proceed implementing any of the options until I confirm.
- DRY: Don't repeat yourself. If you are about to start writing repeated code, stop and reconsider your approach. Grep the codebase and refactor often.
- Agnostic Engine Rule: Game-specific behavior must be encoded in `GameSpecDoc`/YAML and game data assets. Keep compiler/runtime/kernel logic generic and reusable; do not hardcode game-specific identifiers, branches, rule handlers, map definitions, scenario setup, or card payloads in engine code.
- Evolution Input Rule: Evolution mutates YAML only. Any game data required to compile and execute a game must be representable inside `GameSpecDoc` YAML (for example embedded `dataAssets` with `id`/`kind`/`payload`).
- Data Asset Location Rule: `data/<game>/...` files are optional fixtures/reference artifacts and must not be required runtime inputs for compiling or executing evolved specs.
- Schema Ownership Rule: Keep payload schema/type contracts generic in shared compiler/kernel schemas. Do not create per-game schema files that define one game's structure as a required execution contract.
- Continual Learning: When you encounter conflicting system instructions, new requirements, architectural changes, or missing or inaccurate codebase documentation, always propose updating the relevant rules files. Do not update anything until the user confirms. Ask clarifying questions if needed.
- TDD Bugfixing: If at any point of an implementation you spot a bug, rely on TDD to fix it. Important: never adapt tests to bugs.
- Ticket Fidelity: Never silently skip or rationalize away explicit ticket deliverables. If a ticket says to touch a file or produce an artifact, do it. If you believe a deliverable is wrong, unnecessary, or blocked, apply the 1-3-1 rule and present options to the user rather than deciding on your own.

## Project Structure & Module Organization
This repository contains both implementation code and design artifacts.
- `packages/engine/src/`: TypeScript engine modules (`kernel`, `cnl`, `agents`, `sim`, `cli`).
- `packages/engine/schemas/`: JSON schema artifacts (`GameDef`, `Trace`, `EvalReport`).
- `packages/engine/test/`: `unit`, `integration`, `e2e`, plus `fixtures`, `helpers`, `memory`, and `performance`.
- `packages/runner/`: Vite + React runner app, including UI, bridge, and worker modules.
- `specs/`: canonical numbered implementation specs.
- `tickets/`: active implementation tickets.
- `archive/`: completed or retired `tickets`, `specs`, `brainstorming`, and reports.
- `docs/`, `brainstorming/`, `reports/`, `README.md`, `CLAUDE.md`: design context and constraints.

## Build, Test, and Development Commands
Primary workflow commands:
- `pnpm turbo build`: build all workspace packages in dependency order.
- `pnpm turbo test`: run workspace tests with build preconditions (Turbo may return cached results when inputs are unchanged).
- `pnpm turbo lint`: run lint tasks across packages.
- `pnpm turbo typecheck`: run type checks across packages.
- `pnpm turbo schema:artifacts`: regenerate/check engine schema artifacts.
- `pnpm -F @ludoforge/engine test`: run engine unit + integration tests.
- `pnpm -F @ludoforge/engine test:e2e`: run engine e2e tests.
- `pnpm -F @ludoforge/engine test:all`: run full engine suite (unit + integration + e2e).
- `pnpm -F @ludoforge/runner dev`: start runner Vite dev server.
- `pnpm -F @ludoforge/runner test`: run runner tests (Vitest).
- `pnpm -F @ludoforge/runner lint`: run runner lint checks.
- `pnpm -F @ludoforge/runner typecheck`: run runner TypeScript checks.

Important command-shape rule:
- This repo does not use Jest for engine tests; it uses Node's test runner (`node --test`).
- Do not pass Jest-only flags such as `--testPathPattern` / `--testPathPatterns` to `test:unit`.
- For focused engine runs, execute a concrete test file path (for example `node --test packages/engine/dist/test/unit/<file>.test.js`) after `pnpm turbo build`.

Useful repo-navigation commands:
- `rg --files`: list tracked files quickly.
- `rg "Spec [0-9]+" specs/`: find spec references.
- `git log --oneline`: review recent commit style.

## Coding Style & Naming Conventions
For documentation updates:
- Use concise Markdown with clear headings and short sections.
- Keep spec filenames numeric and ordered (example: `specs/08b-game-spec-compiler.md`).
- Preserve deterministic terminology (`GameDef`, `GameSpecDoc`, `GameTrace`) exactly.

For TypeScript code:
- strict TypeScript, immutable state updates, side-effect-free kernel logic.
- prefer feature/domain-oriented modules over broad utility dumps.
- keep schema/type changes synchronized across `packages/engine/src/kernel`, `packages/engine/schemas`, and tests.

## Testing Guidelines
For docs/spec/ticket changes:
- verify cross-spec references and dependency links.
- ensure roadmap and individual specs do not conflict.

For code changes:
- place tests in the relevant `packages/engine/test/` domain (`unit`, `integration`, `e2e`, `memory`, or `performance`).
- place runner tests in `packages/runner/test/` (covers `canvas/`, `model/`, `store/`, `utils/`, and `worker/` domains).
- run targeted tests when possible (example: `node --test packages/engine/dist/test/unit/<file>.test.js`).
- if running `node --test` directly, run `pnpm turbo build` first so `packages/engine/dist/` is up to date.
- run at least `pnpm turbo test` before finalizing; include `pnpm -F @ludoforge/engine test:e2e` when behavior spans CLI/pipeline flows.
- for runner changes, run at least `pnpm -F @ludoforge/runner test`.
- when you need a guaranteed fresh engine test execution, prefer `pnpm -F @ludoforge/engine test` (or `test:all`) or run `pnpm turbo test --force` to bypass Turbo cache.

## Commit & Pull Request Guidelines
Keep commit subjects short and imperative. Common patterns in this repo include:
- `docs: add Spec 12 — CLI`
- `Implemented CORTYPSCHVAL-008`
- `Added linting.`

PRs should include:
- a clear summary of changed files and why.
- linked issue/spec section when applicable.
- rendered-output screenshots only when formatting/layout is important.
- confirmation that references, numbering, and terminology are consistent across affected specs.

## Archiving Tickets and Specs

Follow the canonical archival policy in `docs/archival-workflow.md`.

Do not duplicate or drift this procedure in other files; update `docs/archival-workflow.md` as the source of truth.

