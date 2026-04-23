# 141RUNCACHE-004: Helper path vs canonical run path equivalence witness

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — possibly extend `runVerifiedGame` return shape or add a sibling helper; new test file
**Deps**: `archive/tickets/141RUNCACHE-002.md`

## Problem

Spec 141 Design §6 declares entry-point equivalence as part of the run-boundary contract: any helper that claims to exercise authoritative runtime behavior must preserve the same observable semantics as the canonical run path for legality publication, microturn progression, turn-flow advancement, and repeated-run boundedness surfaces. Spec 141 Acceptance §4 and §5, together with the Required Changes → Verification bullets 3 and 4, require an automated witness.

Today only one direct kernel helper exists that bypasses `runGame` — `runVerifiedGame` in `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts`. It advances turns by calling `publishMicroturn` + `applyPublishedDecision` directly. It currently honors the fork contract (line 102), but no test proves its observable-semantic equivalence to `runGame` on the same corpus. Foundation 5 is satisfied today by imitation; this ticket converts it to proof.

This ticket subsumes two Spec 141 verification bullets:

- **Bullet 3**: "Add regression coverage for at least one custom helper path that does not call `runGame(...)`." — satisfied by the very existence of a parity witness that exercises `runVerifiedGame`.
- **Bullet 4**: "Add at least one repeated-run witness that compares a focused helper path against the canonical run path on the same corpus and asserts equivalent stop-surface behavior, not just 'no cache growth.'" — this is the core deliverable.

## Assumption Reassessment (2026-04-22)

1. `runGame` returns `GameTrace` (rich observable surface: `finalState.stateHash`, `stopReason`, `decisions`, `turnsCount`). Verified at `packages/engine/src/sim/simulator.ts`.
2. `runVerifiedGame` currently returns `number` (decision count). This is insufficient for stop-surface parity — the helper needs either (a) an extended return shape exposing `stopReason` + `finalState.stateHash`, or (b) a sibling helper for parity testing that returns comparable fields. Chosen approach lands in this ticket's implementation.
3. Both helpers use `createSeededChoiceAgents(playerCount)` for deterministic agents. Seed-for-seed equivalence is the right expectation; divergence would indicate a real protocol drift.
4. `runVerifiedGame` swallows certain kernel runtime errors (e.g., "no bridgeable continuations") and returns `0`. Parity assertion must either normalize this explicitly or exclude seeds that trigger the swallow path — document the handling.
5. 141RUNCACHE-002 (prerequisite) has already documented the run-boundary contract on both entry points; this ticket operationalizes the equivalence claim that the contract implies.

## Architecture Check

1. Foundation 5 (one rules protocol, many clients) — this ticket converts "different helpers happen to behave the same" into "different helpers are proven to behave the same". The protocol is the single source of truth.
2. Foundation 16 (testing as proof) — per-member classification (001) and forked-vs-fresh parity (003) prove the runtime ownership invariant; this ticket proves the orthogonal invariant that entry-point choice does not alter authoritative behavior.
3. Extending `runVerifiedGame`'s return shape (if chosen) does not leak game-specific logic; the extension is a structural diagnostic surface. Foundation 1 unaffected.
4. Per `.claude/rules/testing.md`, this is an **architectural-invariant** class test — the property holds across every legitimate trajectory, not one specific seed.

## What to Change

### 1. Decide the observable-surface strategy

Two options, pick one during implementation:

- **Option A — extend `runVerifiedGame`**: add an optional diagnostic output (e.g., a second function or a new parameter) that returns `{ decisionCount, stopReason, finalStateHash }` in addition to or instead of the bare decision count. Maintain the existing `runVerifiedGame` signature for current test callers by introducing a sibling `runVerifiedGameWithDiagnostics` or similar.
- **Option B — author a purpose-built parity helper**: create a new helper in `packages/engine/test/helpers/` that advances turns via `publishMicroturn`+`applyPublishedDecision` exactly as `runVerifiedGame` does, but returns the rich observable surface directly. Note the duplication explicitly and explain why option A was not chosen in the ticket outcome.

Recommendation: Option A, with a minimal extension. Keeping the parity path structurally identical to the in-use `runVerifiedGame` is the point — adding a sibling helper dilutes the "same protocol" claim.

### 2. New test: helper vs canonical parity

Create `packages/engine/test/integration/helper-vs-canonical-parity.test.ts`:

```ts
// @test-class: architectural-invariant

// For each (game, seed) in the corpus:
//   canonical = runGame(def, seed, agents, maxTurns, playerCount, options, sharedRuntime)
//   helper    = runVerifiedGameWithDiagnostics(def, seed, playerCount, maxTurns, sharedRuntime)
// Assert (after normalizing early-return seeds):
//   canonical.stopReason === helper.stopReason  (or documented equivalence relation)
//   canonical.finalState.stateHash === helper.finalStateHash
//   canonical.decisions.length === helper.decisionCount
```

Both runs share the same `sharedRuntime` across the corpus sweep — this exercises the repeated-run dimension of the claim and subsumes Verification bullet 3.

### 3. Normalize `runVerifiedGame` swallow path

`runVerifiedGame` swallows non-HASH_DRIFT kernel runtime errors and returns `0`. Two options in the parity test:

- Exclude seeds that trigger the swallow path (document criterion).
- Have `runGame` compare against an expected-early-return marker when the helper swallowed.

The canonical handling should match the actual protocol: if `runGame` would return a non-terminal stop reason on the same (def, seed), the helper's swallow is equivalent. If not, the swallow itself is the drift and the test must fail. Implementer decides during authoring — document the rationale in a test comment.

### 4. Cover both games

FITL and Texas — same compile helpers as 141RUNCACHE-003. Use a small representative corpus (4-6 seeds per game).

## Files to Touch

- `packages/engine/test/integration/helper-vs-canonical-parity.test.ts` (new)
- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` (modify — if Option A: add diagnostic-returning sibling)

## Out of Scope

- Classification/annotation — 141RUNCACHE-001.
- API contract JSDoc — 141RUNCACHE-002.
- Forked-vs-fresh parity — 141RUNCACHE-003.
- Removing `runVerifiedGame` or refactoring it to call `runGame` — the helper's direct-kernel-loop shape is the point of parity testing.
- Extending parity to agents with non-deterministic policy — the witness uses `createSeededChoiceAgents` and stays within the determinism envelope.

## Acceptance Criteria

### Tests That Must Pass

1. New helper-vs-canonical parity test passes on FITL and Texas corpora.
2. Existing `zobrist-incremental-property-*` tests that use `runVerifiedGame` remain green — the Option A extension must not break current call sites.
3. Existing determinism and integration suites: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. For every `(def, seed, agents, maxTurns)` tuple in the corpus, `runGame` and the diagnostic-returning helper variant produce equivalent stop-surface observations (`stopReason`, `finalStateHash`, `decisionCount`) — up to the documented swallow-path normalization.
2. The invariant holds under shared-runtime reuse across the corpus — this is the repeated-run dimension that Spec 141 specifically calls out.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/helper-vs-canonical-parity.test.ts` (new) — architectural-invariant; exercises Spec 141 Design §6 entry-point equivalence.
2. `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` (modify, if Option A) — add sibling helper with richer return shape.

### Commands

1. `pnpm -F @ludoforge/engine test` (targeted — includes the new integration test)
2. `pnpm turbo test` (full suite)
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
