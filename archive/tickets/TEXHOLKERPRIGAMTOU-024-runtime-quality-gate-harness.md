# TEXHOLKERPRIGAMTOU-024: Game-Agnostic Runtime Quality Gate Harness (Multi-Policy Smoke + Invariants)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-022
**Blocks**: none

## 0) Assumption Reassessment (2026-02-16)

Current repository state differs from the original ticket framing:

1. A Texas smoke/invariant integration test already exists at `test/integration/texas-runtime-bootstrap.test.ts`, including deterministic seed windows and runtime invariants (card conservation, chip conservation, non-negative stacks).
2. Existing Texas smoke execution currently uses a single hardcoded move policy (`moves[0]` / first-legal), so policy breadth and reusable orchestration are missing.
3. There is no shared game-agnostic runtime smoke harness in `test/helpers` for policy execution + invariant composition across games.
4. There is no dedicated harness self-test fixture validating deterministic policy behavior and invariant plug-in wiring.
5. There is no dedicated negative harness fixture asserting invariant failure diagnostics shape/context.
6. Dependency `TEXHOLKERPRIGAMTOU-022` is already completed and archived at `archive/tickets/TEXHOLKERPRIGAMTOU-022-explicit-phase-transition-semantics.md`.

## 0.1) Updated Scope (Corrected)

1. Introduce a generic integration-test harness in test-layer helpers (not kernel) for runtime smoke gates over compiled `GameSpecDoc` games.
2. Support deterministic move-selection policies in the harness:
- first-legal
- seeded-random legal
- policy-driven selector callback
3. Provide a shared invariant core in harness execution:
- no runtime errors/stalls before terminal in configured step window
- deterministic replay for same seed + policy
- optional generic numeric bounds checks from `GameDef` variable contracts
4. Allow per-game invariant plug-ins (for example Texas chip/card conservation) to remain in integration tests, preserving engine agnosticism.
5. Migrate Texas smoke gate loop from ad-hoc inline logic to the harness and execute multiple policies/seeds to broaden path coverage.
6. Add harness-focused integration tests:
- conformance/determinism wiring
- negative invariant failure diagnostics

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

## 4) Architecture Rationale

This direction is more robust than the current ad-hoc Texas-only loop:

1. It removes duplicated smoke-loop mechanics from per-game test files and centralizes deterministic policy execution semantics.
2. It preserves strict engine agnosticism by keeping policy/invariant orchestration in test helpers rather than kernel runtime branches.
3. It scales to additional games without introducing game-specific coupling in compiler/kernel code.
4. It keeps invariants composable: core runtime safety checks shared once, game invariants layered as plug-ins close to game tests.

## Outcome

- Completion date: 2026-02-16
- Implemented:
  - Added reusable game-agnostic runtime smoke harness at `test/helpers/runtime-smoke-harness.ts` with deterministic policies (`first-legal`, `seeded-random-legal`, and callback selector policy), deterministic replay checks, bounded numeric var checks, and invariant plug-in diagnostics.
  - Added harness integration coverage at `test/integration/runtime-smoke-harness.test.ts`, including deterministic policy/invariant conformance and negative invariant failure diagnostics.
  - Migrated Texas smoke window checks in `test/integration/texas-runtime-bootstrap.test.ts` to the harness with multi-policy execution and Texas-specific invariants in test layer.
  - Added regression unit test `8b` in `test/unit/kernel/legal-choices.test.ts` for `commitResource.actualBind` propagation from `let` scope.
  - Fixed kernel binding propagation bug exposed by new smoke policies:
    - `src/kernel/legal-choices.ts` now preserves effect-produced bindings during discovery traversal and mirrors `let` exported-binding semantics.
    - `src/kernel/effect-dispatch.ts` now preserves `bindings` in exported `applyEffect`/`applyEffects` results.
- Deviations from original wording:
  - Texas smoke min-move thresholds are policy-specific (instead of one shared threshold) to reflect valid shorter terminal paths under seeded-random policy while still enforcing meaningful coverage.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
