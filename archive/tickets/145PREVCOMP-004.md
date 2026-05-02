# 145PREVCOMP-004: Cross-game driver conformance and per-policy determinism

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/145PREVCOMP-001.md`

## Problem

Per Spec 145 §I4 and the post-`145PREVCOMP-001` review split: prove engine-agnosticism (F#1) and decision-granularity uniformity (F#19) of the driver by running the same `pickInnerDecision` greedy policy against production action-selection microturns: FITL Govern, FITL March, FITL Train, FITL Sweep, FITL Assault, and Texas Hold'em raise. Assert each production action witness returns a ready preview under depthCap=8 and produces a non-pre-move-equal `previewState.stateHash` (i.e., the driver actually moved state). Assert FITL March returns `depthCap` when the cap is lowered to 2, preserving the boundedness witness that `145PREVCOMP-001` originally named but only covered synthetically.

Plus the determinism witness: per Spec 145 D8 and the reassess-spec Addition #9, run the driver twice on identical inputs under BOTH `greedy` and `agentGuided` policies and assert byte-identical outcomes and `previewState.stateHash` values. The per-policy split matters because `agentGuided` invokes considerations-evaluation, a separate code path from greedy precedence selection.

## Assumption Reassessment (2026-04-25)

1. Test directory `packages/engine/test/integration/agents/` exists with 4 test files (per reassessment). Adding the new test here is consistent with naming convention.
2. FITL Govern, March, Train, Sweep, Assault, and Texas Hold'em raise actions are kernel-published action-selection microturns in the corresponding `data/games/<game>/` GameSpecDocs. No new fixtures required — the test uses production initial states plus pass-advanced FITL operation windows.
3. `K_PREVIEW_DEPTH = 8` per `145PREVCOMP-001`. Spec 145 D2 documents that FITL March is the deepest at 6 inner microturns; 8 leaves margin.
4. Both `greedy` and `agentGuided` pickers are deterministic over (microturn, policy) — verified architecturally in `145PREVCOMP-001` and now witnessed empirically here.
5. FOUNDATIONS-aligned reset (2026-04-25): live production probing showed Govern, March, Sweep, and Assault can complete through the driver while leaving victory margins unchanged in straightforward production states. F#1/F#19 require generic bounded microturn completion, not immediate victory-margin movement. The durable movement witness is therefore `previewState.stateHash`, while the depth bound is proven through ready outcomes at cap=8 plus the March `depthCap` witness at cap=2 because the runtime does not expose private driver depth.

## Architecture Check

1. **F#1 (Engine Agnosticism)** — the same `pickInnerDecision` function resolves microturns from FITL and Texas Hold'em without game-specific branching. This test is the F#1 conformance witness for the driver per Spec 145 §I4.
2. **F#8 (Determinism)** — byte-identical replay across two driver invocations on identical inputs, asserted under both pickers. The per-policy split closes the gap that a single-picker test would leave (see Spec 145 reassess-spec Addition #9).
3. **F#16 (Testing as Proof)** — F#1 and F#8 properties are now proven, not assumed.
4. **F#19 (Decision-Granularity Uniformity)** — the test exercises microturns from games with materially different turn structures; if any game's compound turn requires special handling in the driver, F#19 is violated and this test would fail.

## What to Change

### 1. New integration test file

`packages/engine/test/integration/agents/cross-game-driver-conformance.test.ts`

`@test-class: architectural-invariant`

Test cases:

#### Case A: FITL operation boundedness matrix

- Set up production FITL initial/pass-advanced states.
- Identify production FITL action-selection microturns for `Govern`, `March`, `Train`, `Sweep`, and `Assault`.
- Construct `PolicyPreviewCandidate` inputs for one candidate of each action.
- Invoke `getPreviewOutcome` (which internally invokes `driveSyntheticCompletion`) with `completionDepthCap: 8`.
- Assert for every action: `outcome.kind === 'ready'`; the post-drive `previewState.stateHash` differs from the pre-move `stateHash`.

#### Case B: FITL March depth-cap witness

Same setup as Case A but with `completionDepthCap: 2` for March. Assert `outcome.kind === 'unknown'` and `failureReason === 'depthCap'`.

#### Case C: Texas Hold'em raise conformance

- Set up minimal Texas Hold'em state.
- Identify a raise action-selection microturn.
- Same assertion shape as Case A.

This case proves engine-agnosticism: no FITL-specific identifiers appear in driver code.

#### Case D: Per-policy determinism (greedy)

- Set up a FITL Govern candidate (re-use Case A setup).
- Invoke driver twice with `policy: 'greedy'`, identical inputs.
- Assert: `outcome1 === outcome2 === 'ready'`; `previewState1.stateHash === previewState2.stateHash`.

#### Case E: Per-policy determinism (agentGuided)

- Same setup as Case D.
- Invoke driver twice with `policy: 'agentGuided'`.
- Assert: same byte-identity properties as Case D.

The split between Cases D and E is mandated by reassess Addition #9 — `agentGuided` invokes a separate considerations-evaluation code path from `greedy` and must be witnessed independently.

### 2. Test helpers

Re-use existing helpers from `packages/engine/test/helpers/`:
- `makeIsolatedInitialState` for state setup
- `loadGameDef` (or equivalent) for FITL and Texas Hold'em GameDef compilation
- Minimal candidate construction per existing `policy-preview` test patterns

Do NOT introduce new helpers for cases the existing helpers cover. If the existing helpers are insufficient (e.g., no Texas Hold'em fixture in `test/fixtures/games/`), extend a single helper file rather than creating per-case scaffolding.

## Files to Touch

- `packages/engine/test/integration/agents/cross-game-driver-conformance.test.ts` (new)
- Possibly `packages/engine/test/helpers/` (modify if Texas Hold'em fixture loading needs extension)
- `archive/specs/145-bounded-synthetic-completion-preview.md` (I4 proof-boundary correction; archived after Spec 145 completion)

## Out of Scope

- Driver implementation — `145PREVCOMP-001`.
- Top-K gate testing — `145PREVCOMP-002`.
- Profile audit and re-bless — `145PREVCOMP-003`.
- Performance assertions — `145PREVCOMP-006`.
- Stochastic-microturn cross-game witness — covered by the unit test in `145PREVCOMP-001` (synthetic stochastic coverage is sufficient for the surface property; cross-game stochastic is not a Spec 145 deliverable).

## Acceptance Criteria

### Tests That Must Pass

1. All five cases (A–E) in `cross-game-driver-conformance.test.ts` green, including the FITL operation boundedness matrix and March depth-cap witness.
2. `pnpm -F @ludoforge/engine test:integration` should include the new test; if the broad lane is blocked by an unrelated pre-existing slow parity file, record the direct failing file and keep the focused conformance proof as the ticket-owned witness.
3. `pnpm turbo lint` and `pnpm turbo typecheck` green.

### Invariants

1. The test file contains no FITL-specific or Texas-Hold'em-specific assertions outside game-specific case setup — the assertion shape is uniform across cases (F#1 by construction).
2. Cases D and E run the driver at least twice each with identical inputs and assert byte-identical state hashes (F#8).
3. All production completion cases assert ready outcomes at `completionDepthCap: 8`, and the March cap-lowered case asserts `depthCap` at `completionDepthCap: 2` (F#10).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/cross-game-driver-conformance.test.ts` (new) — `@test-class: architectural-invariant` for F#1 and F#8 properties of the driver.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`

## Outcome

Completed 2026-04-25.

- Added `packages/engine/test/integration/agents/cross-game-driver-conformance.test.ts`, covering production FITL Govern, March, Train, Sweep, Assault, and Texas Hold'em raise through the shared policy preview runtime.
- `ticket corrections applied`: non-pre-move-equal `selfMargin` for every FITL witness -> non-pre-move-equal `previewState.stateHash`; exact private driver depth assertion -> ready outcomes at `completionDepthCap: 8` plus March `depthCap` at `completionDepthCap: 2`.
- Updated Spec 145 I4 to match the Foundations-aligned proof boundary: F#1/F#19 require generic bounded microturn completion, not immediate victory-margin movement.
- Test helper fallout: none; existing production spec helpers were sufficient.
- Schema/artifact fallout: none; test/spec/ticket-only change.
- Verification set: `pnpm -F @ludoforge/engine build`; `node dist/test/integration/agents/cross-game-driver-conformance.test.js` from `packages/engine`; `pnpm -F @ludoforge/engine test:integration` (new test passed; lane timed out later in `dist/test/integration/diagnose-parity-runGame.test.js` after 10m); direct rerun `node --test dist/test/integration/diagnose-parity-runGame.test.js` remained silent beyond the lane timeout and was classified as a pre-existing unrelated slow parity blocker; `pnpm turbo lint`; `pnpm turbo typecheck`.
