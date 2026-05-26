# 198GAMECONFCORP-002: Cross-family architectural-invariant tests

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only (engine bugs surfaced are out of scope here, see Out of Scope)
**Deps**: `archive/tickets/198GAMECONFCORP-001.md`

## Problem

Foundation #16's conformance-corpus mandate is satisfied only when architectural invariants are *proven* across the corpus, not just declared. Today no automated test asserts that the agent-layer protocol (legality publication, plan-controller frontier authority, compile determinism, replay identity) holds uniformly on every corpus game. Author-discipline carries the contract piecemeal. This ticket adds the cross-family architectural-invariant test surface that proves the contract uniformly on FITL, Texas Hold'em, and the new perfect-info game from ticket 001.

## Assumption Reassessment (2026-05-26)

1. `packages/engine/test/architecture/` exists with ~10 architectural-invariant tests (verified via direct ls). The new file lands alongside them.
2. `packages/engine/test/architecture/cross-family-conformance.test.ts` does NOT exist (verified).
3. The `@test-class: architectural-invariant` marker is documented in `.claude/rules/testing.md:39` and used by existing tests in this directory.
4. After ticket 001 lands, three corpus games (FITL, Texas Hold'em, the new perfect-info game) are available for loading.
5. Existing tests already invoke the compiler, kernel, and agent layer for individual games — the helpers for loading and running corpus games are reusable; this ticket does not need to author new loading infrastructure from scratch (it should reuse what exists in `packages/engine/test/helpers/` or equivalent).

## Architecture Check

1. The test exercises the same kernel/agent/compiler protocols across all three corpus games — operationalizes Foundation #5 (one rules protocol, many clients).
2. Per-game invariant matrix is documented inside the test file itself, so future authors of new corpus games see exactly which invariants apply where (and why some games may not exercise some invariants — e.g., a corpus game without plan templates does not exercise plan-controller frontier authority).
3. Bounded fuzz uses seeded PRNG with deterministic replay (Foundation #8); the fuzz budget is bounded explicitly (Foundation #10) to keep CI lane time predictable.
4. No game-specific branching in the test code — invariants are stated generically and the per-game matrix lives as data, not code.

## What to Change

### 1. Add the new test file

Author `packages/engine/test/architecture/cross-family-conformance.test.ts` with `// @test-class: architectural-invariant` as the file-top class marker (per `.claude/rules/testing.md`).

### 2. Load each corpus game into a small fixture set

Reuse existing engine test helpers for compiling and instantiating each corpus game. The three games are: FITL, Texas Hold'em, and the new perfect-info game from ticket 001.

### 3. Per-game architectural invariants

For each corpus game, assert:

- **Compiler determinism** — compile the game twice and assert byte-identical compiled GameDef.
- **Legality publication** — every published microturn frontier is finite and contains only atomic decisions (Foundation #19, Foundation #18 publication contract).
- **Plan-controller frontier authority** (where the game has an agent profile with plan templates) — every plan-controller decision is in the published legal frontier.
- **Replay identity** — same `(GameDef, seed, actions)` produces canonically-identical state (Foundations #8, #16 — replay test, not hash-only comparison).

### 4. Cross-game property tests

For each corpus game, run a bounded fuzz: 20 random-seed games × ≤50 microturns each. Each fuzz game must terminate without unhandled engine errors. Use seeded PRNG so failures replay deterministically.

### 5. Per-game invariant matrix

Document inside the test file (as a comment block or a typed data structure adjacent to the per-game test loop) which invariants apply to which corpus game and why any do not apply (e.g., the new perfect-info game from ticket 001 may not exercise plan-controller frontier authority if its agent profile has no plan templates).

## Files to Touch

- `packages/engine/test/architecture/cross-family-conformance.test.ts` (new)
- Possibly: small helper file under `packages/engine/test/architecture/cross-family/` or `packages/engine/test/helpers/` (new — only if the existing helpers do not cover the per-game load/compile/run pattern needed by this test).

## Out of Scope

- Observer-safety invariants (ticket 003 — that test file is the home for selector/preview/posture/trace observer-scope assertions).
- Authoring-error negatives (ticket 004).
- Engine bug fixes — if the harness surfaces existing engine bugs, defer them to a follow-on spec (per spec §6 edge case). This ticket establishes the harness; it does not absorb arbitrary engine corrections.
- Per-game performance budgets / CI lane partitioning — if the bounded-fuzz runtime exceeds the CI lane budget at implementation time, file a follow-up to partition into a separate lane (spec §6 edge case acknowledges this risk).
- New corpus games beyond the three on-axis games (FITL, THX, ticket-001's perfect-info game).

## Acceptance Criteria

### Tests That Must Pass

1. `cross-family-conformance.test.ts` loads all three corpus games and runs each per-game invariant set without failure.
2. Bounded fuzz (20 games × ≤50 microturns) terminates for each corpus game.
3. Existing suite: `pnpm turbo test` — full regression check.

### Invariants

1. Per-game invariant matrix is documented inside the test file (which invariants apply where, with rationale for any skips).
2. The test contains no game-specific branching — invariants are generic; per-game applicability is data, not code (Foundation #1).
3. Bounded fuzz is seeded and replays deterministically (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/cross-family-conformance.test.ts` — primary deliverable. Asserts cross-family agent-layer contract on every corpus game.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/architecture/cross-family-conformance.test.js` — targeted run.
2. `pnpm turbo test` — full suite regression check.
3. `pnpm turbo lint && pnpm turbo typecheck` — pre-completion verification.

## Outcome

Completed: 2026-05-26

Implemented:

1. Added `packages/engine/test/architecture/cross-family-conformance.test.ts` with the required `// @test-class: architectural-invariant` marker.
2. The test loads the three Spec 198 corpus games: `generic-control`, `fire-in-the-lake`, and `texas-holdem`.
3. The test records a data-driven per-game invariant matrix in the test itself. `generic-control` and `texas-holdem` are recorded as not configuring plan templates; `fire-in-the-lake` is recorded as the plan-controller profile witness.
4. The test proves compile determinism, finite atomic microturn publication, replay identity via canonical serialized state, and 20 seeded bounded microturn walks per corpus game with a 50-microturn cap.
5. Plan-controller frontier authority is exercised through the compiled FITL agent catalog using `selectPlanControlledDecision` and a synthetic published frontier, proving the controller-selected decision is one of the supplied legal frontier decisions.

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/cross-family-conformance.test.js` — passed, 16 tests.
3. `pnpm turbo test` — passed; 5 tasks successful, engine default lane summary `174/174 files passed`.
4. `pnpm turbo lint` — passed; 2 tasks successful.
5. `pnpm turbo typecheck` — passed; 3 tasks successful.

Proof-lane adjustment:

1. The first targeted run hung after printing only `TAP version 13`; process inspection showed the `node --test` lane still alive with no child build process. With user approval, the lane was interrupted and isolated by `--test-name-pattern`.
2. The hang was isolated to `fire-in-the-lake replays...` while the replay walk invoked full `PolicyAgent` evaluation on each microturn. The final test uses deterministic published-frontier decisions for replay/fuzz and a separate FITL plan-controller authority assertion, preserving the ticket-owned invariants without turning the conformance harness into a heavy policy-quality run.

Deviations from draft plan:

1. No helper directory was needed; the test reused existing production-spec helpers and kernel/agent APIs.
2. Full `PolicyAgent` evaluation was removed from the replay/fuzz walk after hang triage. Plan-controller frontier authority remains covered by a focused FITL compiled-catalog assertion.
