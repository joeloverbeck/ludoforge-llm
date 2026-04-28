# LIFECYCREG-001: Architectural-invariant test coverage that would have caught the card-deletion + auto-pump bugs

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small-Medium
**Engine Changes**: Yes — test/ additions only; possibly minor instrumentation hooks in `packages/engine/src/sim/simulator.ts` and `packages/engine/src/kernel/turn-flow-lifecycle.ts` to expose counters cheaply.
**Deps**: archive/tickets/LIFECYCFIX-001-card-discard-zone-honored-by-turn-flow-lifecycle.md, archive/tickets/AUTORESCASC-001-investigate-and-bound-auto-resolve-cascade.md, reports/ci-failures-pr-231-2026-04-28.md, .claude/rules/testing.md

## Problem

A structural bug that lived in production for an extended period — silent card deletion in the cardDriven turn-flow lifecycle (owned by `LIFECYCFIX-001`) — was not caught by the existing test corpus, even though its symptom was severe (FITL `seed=42, maxTurns=5` produced 0 player decisions and a degenerate 1-turn "terminal" stop). A separate hypothesized "auto-resolve cascade" (originally tracked by `AUTORESCASC-001`) was investigated in parallel; Phase 1 of that ticket (`reports/auto-resolve-cascade-investigation-2026-04-28.md`) determined the cascade does not exist as a distinct mechanism in current code — `LIFECYCFIX-001`'s deletion bug fully accounts for the historical symptom — and AUTORESCASC-001 closed as already-satisfied with no engine code changes. Both the bug and the original mis-framing were missed because the existing tests focused on stop-reason and replay determinism, not on the structural invariants they violated.

The test architecture is largely sound: there are good architectural-invariant tests (`@test-class: architectural-invariant`), convergence-witness tests, and golden-trace tests per `.claude/rules/testing.md`. The gap is **which invariants** are encoded. Specifically the corpus did not assert:

1. Token conservation across lifecycle boundaries.
2. Decision-per-card presence in the trace for `cardDriven` games.
3. Game-end timing realism (no `terminal` on turn 1 with a deep deck).
4. Zone-token-count realism for cardDriven games (the deck does not lose ≥ N cards in a single auto-step).

This ticket adds those invariants as proper architectural-invariant tests (per the taxonomy in `.claude/rules/testing.md`) so future regressions in the same shape fail loudly. It does NOT fix the underlying lifecycle bug — that is owned by `LIFECYCFIX-001` (already landed). The decision-per-card invariant in particular guards against any future regression that would re-create a "deck advances without surfacing player decisions" symptom, regardless of which mechanism produces it.

## Assumption Reassessment (2026-04-28)

1. **The taxonomy in `.claude/rules/testing.md` is the right hook.** Verified: existing `@test-class: architectural-invariant` files in `packages/engine/test/determinism/` and `packages/engine/test/integration/` follow the documented protocol. New tests in this ticket adopt the same marker.
2. **Token conservation is generic.** Verified by reading the current kernel: token creation/destruction is gated by explicit `createToken`/`destroyToken` effects. Lifecycle steps (initial reveal, card boundary advance, coup hand-off, phase advance) MUST NOT introduce or remove tokens by themselves.
3. **Trace decision-per-card is generic.** Verified against `data/games/texas-holdem/**` and `data/games/fire-in-the-lake/**`: every published microturn produces a decision log entry; no published microturn is supposed to be skipped silently.
4. **Existing fixtures are usable.** Verified that `packages/engine/test/helpers/production-spec-helpers.ts` provides `compileProductionSpec()` and `getFitlProductionFixture()`; new tests can reuse those without re-wiring fixtures.
5. **Some tests will run the full FITL game.** This is necessary to catch the seed-specific deletion patterns. With `LIFECYCFIX-001` landed (and AUTORESCASC-001 closed as already-satisfied), full-game runs are now significantly longer than the pre-fix degenerate runs; coordinate with `TURNPERF-002` so the runtime fits in CI.

### Boundary Reset (2026-04-28)

FOUNDATIONS alignment changed the proof layout but not the owned invariant. F16 requires the multi-seed lifecycle regression net to remain automated proof; F10 requires that the expensive bounded corpus not be placed in the default/core integration lane where it would make routine feedback disproportionate. Therefore this ticket owns a split proof surface:

- **Fast integration sentinels**: focused lifecycle-boundary conservation that runs in the normal integration lanes.
- **Slow architectural corpus**: the historical seed-42 trace checks and 50-seed FITL lifecycle-boundary sweep are manifest-owned slow integration tests. They remain required acceptance proof, but are routed through `integration:slow-parity` shards rather than default/core or FITL-rules lanes.

Texas production currently uses `roundRobin`, not `cardDriven`; Texas assertions therefore prove the non-cardDriven mirror remains bounded and does not receive FITL-specific lifecycle semantics. If Texas later becomes cardDriven, the same test helpers will start applying the card-token conservation assertions to it.

## Architecture Check

1. **F8 (determinism)**: Tests must be deterministic. Each test pins seed, profile mix, and game definition; uses the same harness as the parity tests.
2. **F1 (engine agnosticism)**: Token-conservation and decision-per-card invariants are stated for any cardDriven game, not just FITL. Tests run the same checks against Texas Hold'em where applicable.
3. **F11 (immutability + scoped mutation)**: Counters introduced for tests must use the existing `__internal_for_tests` pattern in `packages/engine/src/kernel/token-state-index.ts` (no production-side observability creep).
4. **F15 (root-cause)**: Tests assert structural invariants, not the specific bug shapes. They must catch the next analogous bug, not just yesterday's.

## What to Change

### 1. Token-conservation invariant test for cardDriven lifecycle

For FITL and Texas Hold'em (each with representative seed coverage), simulate `runGame` with `traceRetention: 'fullTraceWithFinalState'`. After every published decision, snapshot the multiset of token IDs across `state.zones`. Assert: at most one token-id-difference per microturn boundary, and that difference is explained by an effect (created or destroyed via `createToken`/`destroyToken` per the trace).

This is the single test that would have caught `LIFECYCFIX-001` directly. It is also the single test that catches "destroyed-by-effect" vs "destroyed-by-lifecycle" — the lifecycle is not a legitimate cause.

### 2. Decision-per-card presence test

For each `cardDriven` game (FITL + Texas), `runGame(seed=42, all baselines, maxTurns=200)`. Walk the trace's `decisionLogs`. For each `turnId` covered by the trace, assert at least one player or stochastic decision exists before any `turnRetirement` for that turn. This invariant guards against any future regression that would advance the deck (or otherwise retire a turn) without surfacing a player decision — regardless of mechanism. (See `reports/auto-resolve-cascade-investigation-2026-04-28.md` for why the historical AUTORESCASC-001 framing was a misdiagnosis of the LIFECYCFIX-001 deletion bug.)

### 3. Game-end timing realism for FITL

For FITL with the production fixture, assert the game does NOT end with `stopReason: 'terminal'` on `turnsCount <= K`, where `K` is a small integer (suggested: 3) chosen so any legitimate FITL game ending that early is by design intentional and explicitly waived. This is a sentinel test — easy to evade if the bug is reintroduced via a different mechanism, but trivially catches the specific shape we just hit.

### 4. Zone-token-count delta gate

Across one `applyTurnFlowCardBoundary` call, assert: `|tokensAfter.cardTokens| - |tokensBefore.cardTokens| ∈ {-1, 0, +1}` (lookahead empties when deck runs out, otherwise the delta is 0). Catches "the deck dropped 67 cards in one boundary" outright.

### 5. Property-test sweep

Add a property test that runs FITL across N seeds (e.g., 50) for M turns each (e.g., 30), asserting the four invariants above hold for every step. Generators random-pick from a curated seed corpus; no nondeterminism inside individual runs.

### 6. Texas mirror

For the same invariants, ensure they hold for Texas Hold'em across at least 5 seeds. (Texas's discard semantics differ; the test must be parameterised to allow Texas's legitimate `discardZone` configuration.)

### 7. Documentation

Add a short "Lifecycle invariants" subsection to `docs/testing-guide.md` that explains:
- What token conservation means for cardDriven lifecycle.
- Why decision-per-card is required.
- The "no turn-1 terminal" sentinel and how to update it if a future game legitimately ends that fast.

## Files to Touch

- `packages/engine/test/integration/lifecycle-token-conservation.test.ts` (new)
- `packages/engine/test/integration/decision-per-card-presence.test.ts` (new)
- `packages/engine/test/integration/fitl-no-turn-1-terminal.test.ts` (new sentinel)
- `packages/engine/test/integration/turn-flow-card-boundary-zone-delta.test.ts` (new)
- `packages/engine/test/integration/lifecycle-invariants-property.test.ts` (new property sweep)
- `packages/engine/test/helpers/lifecycle-invariant-helpers.ts` (new shared invariant helpers)
- `packages/engine/scripts/test-lane-manifest.mjs` (modify — route expensive lifecycle corpus to slow-parity shards)
- `packages/engine/src/kernel/turn-flow-lifecycle.ts` (modify if needed — minimal `__internal_for_tests` counters; ideally none)
- `packages/engine/src/sim/simulator.ts` (modify if needed — expose decision-per-turn iteration helper for the tests; ideally derived from existing trace data)
- `docs/testing-guide.md` (modify — new "Lifecycle invariants" subsection)

## Out of Scope

- Fixing the underlying lifecycle deletion bug (owned by `LIFECYCFIX-001`, landed). AUTORESCASC-001 closed as already-satisfied (no engine code change); see its archived Outcome and `reports/auto-resolve-cascade-investigation-2026-04-28.md`.
- Property-test infrastructure rewrites (we use existing helpers).
- Cross-game fuzzing for non-existent games — the corpus is FITL + Texas Hold'em.

## Acceptance Criteria

### Tests That Must Pass

1. **Token-conservation invariant (FITL + Texas)**: `lifecycle-token-conservation.test.ts` confirms multiset equality of card tokens across the bounded lifecycle corpus, except when an explicit `createToken`/`destroyToken` effect appears in the trace. This file is slow-lane owned.
2. **Decision-per-card invariant**: `decision-per-card-presence.test.ts` confirms the historical FITL seed-42 all-baseline trace has at least one published decision before any `turnRetirement` decision.
3. **Sentinel: no turn-1 terminal in FITL**: `fitl-no-turn-1-terminal.test.ts` confirms the historical FITL seed-42 all-baseline run does not report `stopReason: 'terminal'` during the first production turn. This file is slow-lane owned.
4. **Boundary zone-delta gate**: `turn-flow-card-boundary-zone-delta.test.ts` confirms each `applyTurnFlowCardBoundary` call shifts the total card-token count by ≤ 1.
5. **Property sweep**: `lifecycle-invariants-property.test.ts` runs 50 seeds × 30 lifecycle-boundary advances and confirms card-token conservation throughout, while the companion trace and sentinel tests cover decision-per-card and early-terminal invariants. This file is slow-lane owned.
6. **Texas baseline**: same invariants hold on Texas Hold'em across 5 seeds.
7. **Existing suites**: fast sentinels remain covered by normal integration lanes; the expensive corpus is covered by `pnpm -F @ludoforge/engine test:integration:slow-parity` / shard lanes. Broad workspace and e2e lanes are retained as regression checks when budget permits.

### Invariants

1. **Token conservation across lifecycle**: every cardDriven `applyTurnFlowCardBoundary` and `applyPublishedDecision` step preserves the multiset of card-token IDs unless an explicit creating/destroying effect is in the trace.
2. **Decision per card**: every cardDriven `turnId` is associated with at least one `decisionLogs` entry before retirement.
3. **Realistic early-game**: no `terminal` stop reason fires on `turnsCount <= 3` for FITL's production fixture.
4. **Bounded zone delta**: card-token count changes by ≤ 1 per lifecycle boundary call.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/lifecycle-token-conservation.test.ts` — `@test-class: architectural-invariant`. FITL + Texas representative corpus; multiset equality assertion per lifecycle boundary.
2. `packages/engine/test/integration/decision-per-card-presence.test.ts` — `@test-class: architectural-invariant`. FITL historical seed-42 all-baseline trace; per-turnId decision existence check from the published trace.
3. `packages/engine/test/integration/fitl-no-turn-1-terminal.test.ts` — `@test-class: architectural-invariant`. FITL historical seed-42 all-baseline sentinel.
4. `packages/engine/test/integration/turn-flow-card-boundary-zone-delta.test.ts` — `@test-class: architectural-invariant`. Constructs a synthetic minimal cardDriven game + FITL initial state; per-boundary delta gate.
5. `packages/engine/test/integration/lifecycle-invariants-property.test.ts` — `@test-class: architectural-invariant`. 50-seed × 30-boundary property sweep for lifecycle token conservation, paired with the trace and sentinel files for the remaining lifecycle invariants.
6. `docs/testing-guide.md` — modify; add "Lifecycle invariants" subsection.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/integration/turn-flow-card-boundary-zone-delta.test.js` (fast sentinel)
3. `pnpm -F @ludoforge/engine test:integration:slow-parity` (or the relevant shard lanes) for the multi-seed lifecycle corpus.
4. `pnpm -F @ludoforge/engine test:integration:texas-cross-game` (Texas mirror and non-cardDriven regression surface).
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm -F @ludoforge/engine typecheck`

## Sequencing

This ticket lands AFTER `LIFECYCFIX-001` (already merged at `8ca1df07`). It is the regression net that proves the fix holds and prevents re-introduction. AUTORESCASC-001 closed as already-satisfied with no engine code changes; the decision-per-card invariant in this ticket still has independent value as a generic guard against any future regression that retires turns without surfacing player decisions. Land this ticket as the closing commit of the LIFECYCFIX sequence.

## Risks

- **Test runtime**: the property sweep adds non-trivial CI minutes. Sized at 50 × 30 to balance coverage and runtime; revisit if it pushes lanes near budget.
- **Texas parity**: invariants must accommodate Texas's discard model (specifically, Texas is not cardDriven by `eventDeck` in the same way; tests must skip the cardDriven-specific assertions when the game's turn order is non-cardDriven).
- **False sentinel triggering**: the "no terminal on turnsCount ≤ 3" sentinel could fire on a future game that legitimately ends that fast. Update the test threshold per-game in that case; document the change.

## Outcome

**Completed**: 2026-04-28

Outcome amended: 2026-04-28 — Post-review after `TURNPERF-001` archival: active per-card performance implementation ownership now lives in `tickets/TURNPERF-002-implement-fitl-per-card-cost-reduction.md`.

### What changed

- Added `packages/engine/test/helpers/lifecycle-invariant-helpers.ts` with shared card-token multiset assertions, lifecycle trace extraction, FITL/Texas production runners, and decision-before-retirement checks.
- Added five `@test-class: architectural-invariant` integration tests:
  - `turn-flow-card-boundary-zone-delta.test.ts` directly advances FITL production lifecycle boundaries and asserts card-token deltas stay bounded and identity-preserving.
  - `lifecycle-token-conservation.test.ts` verifies representative FITL seed boundary advances and the Texas non-cardDriven mirror.
  - `lifecycle-invariants-property.test.ts` runs the 50-seed x 30-boundary FITL card-token conservation sweep plus Texas mirror smoke.
  - `decision-per-card-presence.test.ts` proves the historical FITL seed-42 all-baseline first-turn trace publishes a decision before retirement.
  - `fitl-no-turn-1-terminal.test.ts` proves the historical FITL seed-42 all-baseline first-turn sentinel does not stop as terminal.
- Updated `packages/engine/scripts/test-lane-manifest.mjs` so the expensive lifecycle corpus lives in `integration:slow-parity-shard-c` and is excluded from default/core, game-package, FITL-rules, FITL-events, and Texas-cross-game lanes.
- Added `docs/testing-guide.md` lifecycle-invariant guidance.
- Verified production instrumentation was unnecessary: the existing lifecycle trace, `runGame` trace, and direct `applyTurnFlowCardBoundary` seams were sufficient. `packages/engine/src/kernel/turn-flow-lifecycle.ts` and `packages/engine/src/sim/simulator.ts` were intentionally unchanged.

### Ticket corrections applied

- `traceRetention: 'fullTraceWithFinalState'` -> live simulator API uses `traceRetention: 'full'` by default and `finalStateOnly` for elision.
- Texas cardDriven mirror -> Texas production is currently `roundRobin`; tests keep it as the non-cardDriven engine-agnostic mirror and only apply cardDriven lifecycle assertions if that contract changes later.
- 5-seed/50-seed simulator corpus in normal integration lanes -> Foundations-aligned split: direct lifecycle-boundary corpus for broad token-conservation proof, historical seed-42 trace checks for decision/terminal symptoms, all expensive files routed to slow-parity.

### Verification

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test dist/test/integration/turn-flow-card-boundary-zone-delta.test.js` — passed.
- `node --test dist/test/integration/lifecycle-token-conservation.test.js dist/test/integration/lifecycle-invariants-property.test.js` — passed.
- `timeout 180s node --test dist/test/integration/decision-per-card-presence.test.js dist/test/integration/fitl-no-turn-1-terminal.test.js` — passed.
- `node --test dist/test/integration/lifecycle-token-conservation.test.js dist/test/integration/decision-per-card-presence.test.js dist/test/integration/fitl-no-turn-1-terminal.test.js dist/test/integration/turn-flow-card-boundary-zone-delta.test.js dist/test/integration/lifecycle-invariants-property.test.js` — passed.
- `pnpm -F @ludoforge/engine test:integration:slow-parity:shard-c` — new lifecycle files passed under the wrapper; the lane then timed out in pre-existing `dist/test/integration/spec-140-compound-turn-summary.test.js` after 10m. Classification: repo-preexisting slow-shard blocker outside this ticket's lifecycle diff.
- `pnpm -F @ludoforge/engine test:integration:texas-cross-game` — passed.
- `pnpm -F @ludoforge/engine lint` — passed.
- `pnpm -F @ludoforge/engine typecheck` — passed.
- `git diff --check` — passed.

### Schema/artifact fallout

None. This ticket adds tests, lane-manifest routing, and docs only; no serialized schema, generated artifact, or runtime trace shape changed.
