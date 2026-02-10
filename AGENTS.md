# Repository Guidelines

## Project Structure & Module Organization
This repository contains both implementation code and design artifacts.
- `src/`: TypeScript source modules (`kernel`, `cnl`, `agents`, `sim`, `cli`).
- `schemas/`: JSON schema artifacts (`GameDef`, `Trace`, `EvalReport`).
- `test/`: `unit`, `integration`, `e2e`, plus `fixtures`, `memory`, and `performance`.
- `specs/`: canonical implementation specs (`00` roadmap through `14` evolution pipeline).
- `tickets/`: active implementation tickets.
- `archive/`: completed or retired `tickets`, `specs`, `brainstorming`, and reports.
- `brainstorming/`, `README.md`, `CLAUDE.md`: design context and constraints.

## Build, Test, and Development Commands
Primary workflow commands:
- `npm run build`: compile TypeScript with `tsc`.
- `npm run clean`: remove `dist/`.
- `npm run lint`: run ESLint.
- `npm run typecheck`: run `tsc --noEmit`.
- `npm test`: run unit + integration tests (via compiled output in `dist/`).
- `npm run test:all`: run unit + integration + e2e tests.
- `npm run test:unit`: run only unit tests.
- `npm run test:integration`: run only integration tests.
- `npm run test:e2e`: run only e2e tests.

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
- place tests in the relevant `test/` domain (`unit`, `integration`, or `e2e`).
- run targeted tests when possible (example: `node --test dist/test/unit/<file>.test.js`).
- run at least `npm test` before finalizing; use `npm run test:all` when behavior spans CLI/pipeline flows.

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

When asked to archive a ticket, spec, or brainstorming document:

1. **Edit the document** to mark its final status at the top:
   - `**Status**: ✅ COMPLETED` - Fully implemented
   - `**Status**: ❌ REJECTED` - Decided not to implement
   - `**Status**: ⏸️ DEFERRED` - Postponed for later
   - `**Status**: 🚫 NOT IMPLEMENTED` - Started but abandoned

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

4. **Delete the original** from `tickets/`, `specs/`, `brainstorming/`, or `reports/`
