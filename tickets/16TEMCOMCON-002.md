# 16TEMCOMCON-002: Add completion contract invariant tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — new test file under `packages/engine/test/unit/kernel/`; no source changes
**Deps**: `specs/16-template-completion-contract.md`

## Problem

Spec 132 landed the four-outcome completion contract, the anti-bias rule for optional `chooseN`, the RNG progression discipline on `drawDeadEnd`, and the client boundary (agents retry `drawDeadEnd`, never `structurallyUnsatisfiable`; worker treats non-`completed` as uncompletable). These properties are currently exercised by FITL seed regressions (seeds 11, 17, 1009) and the `move-completion-retry.test.ts` suite, but they are not asserted as standalone architectural invariants against isolated fixtures.

The gap matters for Foundation 16 (Testing as Proof) and Foundation 5 (One Rules Protocol): a future refactor could weaken the contract while passing all existing seed regressions, because seeds exercise the happy path, not the contract boundary. The most acute example is the `prepare-playable-moves.ts:299` `break` on `structurallyUnsatisfiable`. Removing it would silently re-introduce an agent retry loop on truly unsatisfiable templates — no existing test would catch that.

This ticket adds the six isolated invariant tests that map 1:1 to Spec 16 Contract §§1-4 and Required Invariants §§3, §5.

## Assumption Reassessment (2026-04-17)

1. `packages/engine/src/kernel/move-completion.ts` — `TemplateCompletionResult` union and `completeTemplateMove` export exist and behave as the spec describes. Confirmed by Explore agents during `/reassess-spec` on 2026-04-17.
2. `packages/engine/src/kernel/runtime-reasons.ts:20` — `CHOICE_RUNTIME_VALIDATION_FAILED` is defined and raised/caught in the completion layer. Confirmed.
3. `packages/engine/src/agents/prepare-playable-moves.ts:244-310` — retry loop breaks on `structurallyUnsatisfiable` (line 299) and extends budget for `drawDeadEnd`/`notViable` up to `NOT_VIABLE_RETRY_CAP = 7`. Confirmed.
4. Target test file `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` does not yet exist. New file.
5. Engine tests run via `node --test` against compiled JS in `packages/engine/dist/`; build required before running. Tests use Node's built-in `assert` and `test` APIs, not Jest. Confirmed by CLAUDE.md.
6. Existing reference test for anti-bias lives at `packages/engine/test/unit/kernel/move-completion-retry.test.ts:290-305` and may be reshaped into the new file or complemented — pattern is valid reference material.

## Architecture Check

1. **Foundation 16 — Testing as Proof**: each invariant test asserts a specific architectural property against a minimal synthetic fixture. Tests are isolated from FITL-specific setup; a failure in any one test points directly at the contract clause it enforces.
2. **Foundation 5 — One Rules Protocol**: test §6 (client boundary) is the minimum-viable enforcement of the simulator/agent/worker outcome-semantics agreement. It asserts the agent retry loop does NOT extend the retry budget for `structurallyUnsatisfiable`, locking in the current correct behavior of `prepare-playable-moves.ts:299`.
3. **Foundation 8 — Determinism**: test §5 (determinism) and test §4 (RNG progression) enforce the determinism invariant at the contract layer, independent of FITL seed regression outcomes.
4. **Engine-agnostic fixtures**: all fixtures are synthetic `GameDef` / `GameState` pairs constructed in-test. No FITL-specific data, no production `data/games/*` imports. This keeps the invariants portable to any future game.
5. **No semantic code change**: all source remains untouched; only a new test file is added. No backwards-compatibility shim or alias is introduced.

## What to Change

### 1. Create `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts`

New file with six tests, each targeting one contract clause. Each test uses minimal synthetic fixtures (tiny `GameDef` + `GameState`) and imports `completeTemplateMove`, `TemplateCompletionResult`, and `createRng` from their canonical kernel exports.

#### Test 1 — Outcome classification (Contract §1)

A fixture where a template's `chooseN` decision has `min = 3` but only 2 selectable options. Assert `result.kind === 'structurallyUnsatisfiable'`. Assert NOT `drawDeadEnd` — structural insufficiency must never be classified as a sampled dead-end.

#### Test 2 — Optional `chooseN` anti-bias (Contract §2)

A fixture where the template has an optional `chooseN` (`min = 0`, `max = 1`) with two options: one dead-end (selecting it trips `CHOICE_RUNTIME_VALIDATION_FAILED`) and one successful. Sweep 32 distinct seeds (`createRng(0n)`..`createRng(31n)`). For every seed, `completeTemplateMove` must return `kind: 'completed'` with a non-empty selection. The pattern at `packages/engine/test/unit/kernel/move-completion-retry.test.ts:290-305` is a valid reference; this ticket's test is labeled as a contract-invariant test, not a retry-behavior test.

#### Test 3 — Sampled vs structural dead-end classification (Contract §3)

Two fixtures in one test block:

- **Sampled**: a fixture where `CHOICE_RUNTIME_VALIDATION_FAILED` is raised after the completion layer selects from a sampled decision source (`random`, `stochastic`, or `guided`). Assert `result.kind === 'drawDeadEnd'`.
- **Structural**: a fixture where the same error is raised during structural resolution (empty options with `min > 0`, for example). Assert `result.kind === 'structurallyUnsatisfiable'`.

#### Test 4 — RNG progression on `drawDeadEnd` (Contract §4)

A fixture that deterministically produces a `drawDeadEnd`. Capture the input `rng` via canonical serialization, run `completeTemplateMove`, and assert the returned `rng` serializes to a distinct canonical string — proving the RNG is strictly advanced, not reset. Serialize using whatever canonical form the `Rng` type already exposes (verify export before writing).

#### Test 5 — Determinism (Invariant §3)

Call `completeTemplateMove` twice with identical `(def, state, move, rng)` tuples. Assert the two `TemplateCompletionResult` payloads are byte-identical via canonical JSON serialization (or deep structural equality if JSON is insufficient for `Rng`). Cover both a `completed` and a `drawDeadEnd` outcome branch.

#### Test 6 — Client boundary (Invariant §5, Foundation #5)

A fixture that forces `structurallyUnsatisfiable`. Invoke `prepareePlayableMoves` (or its equivalent exported entry from `packages/engine/src/agents/prepare-playable-moves.ts`) with an instrumented spy or counter that records completion-attempt calls. Assert the attempt count equals the pending-template-count **without** the `NOT_VIABLE_RETRY_CAP` extension — the retry budget MUST NOT be extended for `structurallyUnsatisfiable`. Equivalently: the loop at `prepare-playable-moves.ts:244-310` must break on the first structural rejection.

If `prepareePlayableMoves` does not expose an attempt counter, wire the test via a stub or recompose a minimal harness that imports the internal loop function. If no import surface exists, report the finding via the 1-3-1 rule before creating a test-only export.

## Files to Touch

- `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` (new)

## Out of Scope

- No changes to `packages/engine/src/kernel/move-completion.ts`, `packages/engine/src/kernel/runtime-reasons.ts`, or any other source file. This ticket is tests-only.
- No changes to `packages/engine/src/agents/prepare-playable-moves.ts`. The client-boundary test exercises existing behavior; it does not modify the retry loop.
- No changes to FITL data, visual-config, or runner code.
- No duplication of existing seed regressions (`seeds 11/17/1009`) — those remain the end-to-end witnesses.
- Doc-comments on `TemplateCompletionResult` / `completeTemplateMove` (covered by `16TEMCOMCON-001`).

## Acceptance Criteria

### Tests That Must Pass

1. All six new tests pass: `pnpm -F @ludoforge/engine test --test-name-pattern "completion contract invariants"` (exact pattern depends on naming chosen in implementation).
2. Existing suite: `pnpm -F @ludoforge/engine test` — no regression in any existing unit or integration test.
3. Referenced seed regressions continue to pass: seed 11 (`classified-move-parity.test.ts`), seed 17 (`fitl-policy-agent.test.ts`), seed 1009 (`fitl-events-sihanouk.test.ts` and `move-completion-retry.test.ts`).
4. `agentStuck` rejection tests continue to pass: `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts`.
5. Root quality gate: `pnpm turbo lint` and `pnpm turbo typecheck` pass.

### Invariants

1. **Isolated synthetic fixtures**: no test in this file imports from `data/games/fitl/` or any other game-specific production data source. All `GameDef` / `GameState` inputs are constructed in-test.
2. **Engine agnosticism (Foundation 1)**: test descriptions and assertions reference only generic DSL primitives (`chooseN`, `CHOICE_RUNTIME_VALIDATION_FAILED`, outcome kinds). No FITL terminology appears in the new file.
3. **Determinism is observable**: tests §4 and §5 assert determinism against canonical serialization, not heuristic equality.
4. **Client-boundary test exercises real code paths**: test §6 must invoke the actual retry loop in `prepare-playable-moves.ts`, not re-implement the loop semantics in a mock.
5. **No test-only exports leak semantic surface area**: if test §6 requires exposing an internal function from `prepare-playable-moves.ts`, the export is marked as test-only (e.g., via a `/** @internal */` JSDoc tag or placement in a `__test__` sub-module) and not consumed by any other production code.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` — new file, six invariant tests mapping 1:1 to Spec 16 Contract §§1-4 and Invariants §§3, §5. Each test is labeled in code with its Spec 16 contract-clause reference.

### Commands

1. `pnpm turbo build` — compile engine TypeScript so `node --test` can execute against `packages/engine/dist/`.
2. `pnpm -F @ludoforge/engine test` — run full engine unit suite including new invariants.
3. `pnpm turbo lint typecheck` — confirm the new file passes lint and type-check.
4. `pnpm turbo test` — root-level gate including `check:ticket-deps` and all workspace tests.
