# TEXHOLKERPRIGAMTOU-028: Legality Surface Parity Hardening + Runtime Smoke Harness API Refinement

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-025
**Blocks**: none

## 1) What needs to change / be added

1. Expand parity verification between `legalMoves`, `legalChoices`, and `applyMove` with a systematic matrix focused on binding-sensitive and control-flow-heavy effects.
2. Add shared parity fixtures/helpers so new effect features must declare parity coverage by default.
3. Refine runtime smoke harness policy API to reduce misuse risk:
- harness-managed RNG progression by default
- optional advanced policy state hook without forcing callers to manually thread RNG
4. Keep harness and parity tooling test-layer only; do not add game-specific kernel branches.
5. Add failure diagnostics that pinpoint the surface and divergence step when parity breaks.

## 2) Invariants that should pass

1. Legality surfaces agree on action legality and decision progression for equivalent inputs.
2. Divergences are caught by tests with deterministic repro context.
3. Smoke harness policy behavior is deterministic and harder to misuse.
4. New games can onboard parity/smoke checks without bespoke boilerplate.
5. Kernel/compiler remain game-agnostic and free of test-specific policy logic.

## 3) Tests that should pass

1. Unit: expanded legality-surface parity matrix covering binding export/import and nested control-flow.
2. Unit: harness API tests for default RNG management and custom policy hooks.
3. Integration: at least one Texas and one non-Texas smoke suite using refined harness API.
4. Integration: negative parity fixture proving divergence diagnostics include surface + step + action context.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
