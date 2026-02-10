# Repository Guidelines

## Project Structure & Module Organization
This repository is currently specification-first.
- `specs/`: canonical implementation specs (`00` roadmap through `14` evolution pipeline).
- `brainstorming/`: early design references and exploratory notes.
- `README.md`: short project summary.
- `CLAUDE.md`: implementation constraints, planned architecture, and testing expectations.

When code is scaffolded, follow the planned layout in `CLAUDE.md`:
`src/kernel`, `src/cnl`, `src/agents`, `src/sim`, `src/cli`, plus top-level `schemas/` and `test/`.

## Build, Test, and Development Commands
At present, most contributions are Markdown/spec edits. Useful commands:
- `rg --files`: list tracked files quickly.
- `rg "Spec [0-9]+" specs/`: find spec references.
- `git log --oneline`: review recent commit style.

Post-scaffold (planned TypeScript workflow):
- `npm run build`: compile TypeScript with `tsc`.
- `npm test`: run full test suite (via prebuilt output).
- `npm run typecheck`: run `tsc --noEmit`.

## Coding Style & Naming Conventions
For documentation updates:
- Use concise Markdown with clear headings and short sections.
- Keep spec filenames numeric and ordered (example: `specs/08b-game-spec-compiler.md`).
- Preserve deterministic terminology (`GameDef`, `GameSpecDoc`, `GameTrace`) exactly.

For future TypeScript code (as defined in project docs):
- strict TypeScript, immutable state updates, side-effect-free kernel logic.
- prefer feature/domain-oriented modules over broad utility dumps.

## Testing Guidelines
Current work should include consistency checks:
- verify cross-spec references and dependency links.
- ensure roadmap and individual specs do not conflict.

After scaffolding, place tests under `test/unit`, `test/integration`, and `test/e2e`; run with `npm test` or targeted `node --test dist/test/unit/<file>.js`.

## Commit & Pull Request Guidelines
Follow the existing commit pattern visible in history:
- `docs: add Spec 12 — CLI`
- `docs: refine Spec 00 dependency graph`

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