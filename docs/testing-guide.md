# Testing Guide

## Test Types

- **Determinism tests**: same seed + same move sequence = identical final state hash
- **Property tests** (quickcheck style): applyMove never produces invalid var bounds, tokens never duplicate across zones, legalMoves pass preconditions, no crash on random play for N turns
- **Golden tests**: known Game Spec -> expected JSON, known seed trace -> expected output

## FITL Game-Rule Tests

- Compile `data/games/fire-in-the-lake/*.md` via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Do NOT create separate fixture files for FITL profiles, events, or special activities. Foundation fixtures (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`) are kept for engine-level testing with minimal setups.
- **Event-selector tests**: when legality depends on broad map predicates such as "any city", "supported spaces", or "outside Saigon", neutralize the relevant support/opposition slice first and then apply explicit overrides. Do not assume untouched production defaults outside the spaces under direct assertion.
- **Event fidelity details**: treat rules phrases such as `piece`, `place`, and `toward Passive Support` / `toward Passive Opposition` as implementation constraints, not shorthand. Cover Base-as-piece cases, Rule 1.4.1 sourcing, stacking caps, and passive-target routing explicitly when relevant.
- **Fidelity cross-checks**: `archive/specs/29-fitl-event-card-encoding.md` is acceptable as a historical cross-check for suspicious placeholder cards, but rules reports, playbook guidance, and `docs/fitl-event-authoring-cookbook.md` are the source of truth.

## Texas Hold'em Tests

Compile `data/games/texas-holdem/*.md` similarly. Texas Hold'em serves as the engine-agnosticism validation game — tests should confirm that no FITL-specific logic leaks into the kernel.

## Test Placement

- Engine tests: `packages/engine/test/` (`unit`, `integration`, `e2e`, `memory`, `performance`)
- Runner tests: `packages/runner/test/` (`canvas/`, `model/`, `store/`, `utils/`, `worker/`)
- Run targeted tests when possible (e.g., `node --test packages/engine/dist/test/unit/<file>.test.js`)
- If running `node --test` directly, run `pnpm turbo build` first so `packages/engine/dist/` is up to date
- For runner changes, run at least `pnpm -F @ludoforge/runner test`
- Use `pnpm turbo test --force` to bypass Turbo cache for a guaranteed fresh run
