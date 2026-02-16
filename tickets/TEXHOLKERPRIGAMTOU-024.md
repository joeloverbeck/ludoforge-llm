# TEXHOLKERPRIGAMTOU-024: Game-Agnostic Runtime Quality Gate Harness (Multi-Policy Smoke + Invariants)

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-022
**Blocks**: none

## 1) What needs to change / be added

1. Introduce a reusable, game-agnostic integration test harness for runtime smoke gates over compiled GameSpecDoc games.
2. Support deterministic move-selection policies to broaden path coverage, for example:
- first-legal policy
- seeded-random legal policy
- policy-driven selector (for example max numeric decision when available)
3. Allow per-game invariant plug-ins, with a shared invariant core:
- no runtime errors/stalls in configured step window
- token/card conservation checks when applicable
- resource/chip conservation checks when applicable
- non-negative bounded variable checks
4. Migrate Texas smoke quality gate test to this harness while keeping Texas-specific invariants in test layer (not kernel runtime).
5. Keep harness generic so additional games can onboard with minimal boilerplate.

## 2) Invariants that should pass

1. Runtime smoke gate can be applied to multiple games without engine changes.
2. Smoke execution remains deterministic for each seed + policy configuration.
3. Core invariants fail fast and produce clear diagnostics when violated.
4. Gate coverage is materially broader than single-policy first-legal execution.
5. Game-specific invariants remain defined in tests/GameSpec context, not in kernel behavior.

## 3) Tests that should pass

1. Integration: harness self-test with a small conformance fixture proving policy determinism and invariant wiring.
2. Integration: Texas smoke suite using at least two policies and deterministic seeds.
3. Integration: Texas invariants (chip conservation, card conservation, non-negative stacks) pass under all configured policies.
4. Integration: negative fixture test proving harness reports invariant failures with actionable context.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
