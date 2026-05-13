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

## Lifecycle Invariants

- Card-driven lifecycle tests must prove card-token identity conservation across lifecycle boundaries. A card may move between deck, lookahead, played, discard, and leader zones, but lifecycle code must not create or delete card tokens without an explicit effect.
- Card-driven production traces must retain at least one player or stochastic decision before a turn retires. This guards against a deck or card boundary advancing without a published microturn.
- FITL has a sentinel against terminal stops during the first three production turns. If a future legitimate rules change can end that early, update the threshold and the test rationale in the same change.
- Cross-game mirrors should not force FITL card-driven semantics onto non-cardDriven games. Texas Hold'em remains the non-cardDriven guard that catches FITL-specific logic leaking into generic kernel paths.

## Texas Hold'em Tests

Compile `data/games/texas-holdem/*.md` similarly. Texas Hold'em serves as the engine-agnosticism validation game — tests should confirm that no FITL-specific logic leaks into the kernel.

## Test Placement

- Engine tests: `packages/engine/test/` (`unit`, `integration`, `e2e`, `memory`, `performance`, `perf`)
- Runner tests: `packages/runner/test/` (`canvas/`, `model/`, `store/`, `utils/`, `worker/`)
- Run targeted tests when possible (e.g., `node --test packages/engine/dist/test/unit/<file>.test.js`)
- If running `node --test` directly, run `pnpm turbo build` first so `packages/engine/dist/` is up to date
- For runner changes, run at least `pnpm -F @ludoforge/runner test`
- Use `pnpm turbo test --force` to bypass Turbo cache for a guaranteed fresh run

## Performance Lanes

- `pnpm -F @ludoforge/engine test:performance` runs `packages/engine/test/performance/**/*.test.ts`. This lane is part of the Engine Tests workflow as the `performance` matrix job.
- `pnpm -F @ludoforge/engine test:perf` runs `packages/engine/test/perf/**/*.test.ts`. This lane is intentionally separate from `test:performance` and is run by `.github/workflows/engine-perf.yml`.
- Perf witnesses may emit warning lines for historical wall-clock or corpus drift while still passing structural assertions. Treat those warnings as profiling signals, not automatic correctness failures, unless the test contains an explicit hard assertion for the current owner.
