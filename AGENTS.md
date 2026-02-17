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
- `src/`: TypeScript source modules (`kernel`, `cnl`, `agents`, `sim`, `cli`).
- `schemas/`: JSON schema artifacts (`GameDef`, `Trace`, `EvalReport`).
- `test/`: `unit`, `integration`, `e2e`, plus `fixtures`, `memory`, and `performance`.
- `specs/`: canonical numbered implementation specs.
- `tickets/`: active implementation tickets.
- `archive/`: completed or retired `tickets`, `specs`, `brainstorming`, and reports.
- `docs/`, `brainstorming/`, `README.md`, `CLAUDE.md`: design context and constraints.

## Build, Test, and Development Commands
Primary workflow commands:
- `pnpm run build`: compile TypeScript with `tsc`.
- `pnpm run clean`: remove `dist/`.
- `pnpm run lint`: run ESLint.
- `pnpm run lint:fix`: run ESLint with autofix.
- `pnpm run typecheck`: run `tsc --noEmit`.
- `pnpm test`: run unit + integration tests (via compiled output in `dist/`).
- `pnpm run test:all`: run unit + integration + e2e tests.
- `pnpm run test:unit`: run only unit tests.
- `pnpm run test:integration`: run only integration tests.
- `pnpm run test:e2e`: run only e2e tests.

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
- keep schema/type changes synchronized across `src/kernel`, `schemas/`, and tests.

## Testing Guidelines
For docs/spec/ticket changes:
- verify cross-spec references and dependency links.
- ensure roadmap and individual specs do not conflict.

For code changes:
- place tests in the relevant `test/` domain (`unit`, `integration`, `e2e`, `memory`, or `performance`).
- run targeted tests when possible (example: `node --test dist/test/unit/<file>.test.js`).
- if running `node --test` directly, run `pnpm run build` first so `dist/` is up to date.
- run at least `pnpm test` before finalizing; use `pnpm run test:all` when behavior spans CLI/pipeline flows.

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

When asked to archive a ticket, spec, brainstorming document, or report:

1. **Edit the document** to mark its final status at the top:
   - `**Status**: ✅ COMPLETED` or `**Status**: COMPLETED` - Fully implemented
   - `**Status**: ❌ REJECTED` or `**Status**: REJECTED` - Decided not to implement
   - `**Status**: ⏸️ DEFERRED` or `**Status**: DEFERRED` - Postponed for later
   - `**Status**: 🚫 NOT IMPLEMENTED` or `**Status**: NOT IMPLEMENTED` - Started but abandoned

2. **Add an Outcome section** at the bottom (for completed items):
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
