# 138ENUTIMTEM-003: Wire guided chooser into prepare-playable-moves with tripwire and replay-identity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/prepare-playable-moves.ts`, new runtime warning code
**Deps**: `tickets/138ENUTIMTEM-002.md`

## Problem

Per Spec 138 Goals G2–G3 and Design §D5, with 138ENUTIMTEM-002 landed the existing classifier now exposes the viable subset of the first `chooseN` head. This ticket closes the enumerate-vs-sampler information asymmetry: `preparePlayableMoves` calls the subset-extraction mode for pending-completion templates and wraps `attemptTemplateCompletion`'s chooser so that the head selection is restricted to verified-viable options. Once wired, the `pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP = 3 + 7 = 10` retry loop becomes a tripwire — any residual miss is a kernel bug surfaced via a new `GUIDED_COMPLETION_UNEXPECTED_MISS` runtime warning, not an accepted terminal state.

The ticket also covers Spec 138 Investigation I3 (consumer inventory — verify zero public-type changes for the runner worker bridge) and Tests T2, T4, T5.

## Assumption Reassessment (2026-04-19)

1. `packages/engine/src/agents/prepare-playable-moves.ts:218` defines `attemptTemplateCompletion`. Confirmed.
2. `attemptTemplateCompletion` reaches `evaluatePlayableMoveCandidate` at line 258 and passes a `choose` callback through `TemplateMoveCompletionOptions`. Confirmed — the head-restriction wrapper plugs into this existing seam.
3. `completeTemplateMove` (`move-completion.ts:194`) composes caller-provided `choose` with internal random sampling: when the caller's `choose` returns a value, it is used; when it returns `undefined`, internal random sampling kicks in. The guided wrapper returns a value only for the matching head-chooseN `decisionKey`, so downstream decisions continue to random-sample. Confirmed.
4. `decisionKey` uniquely identifies a choice request within a move (`packages/engine/src/kernel/decision-scope.ts` exports `DecisionKey`). Confirmed.
5. `RuntimeWarning` shape is `{ code: string, message: string, context: Record<string, unknown> }`. Confirmed in `packages/engine/src/kernel/types.ts`. Existing warning codes under `MOVE_COMPLETION_*` and `MOVE_ENUM_*` live in `prepare-playable-moves.ts` and `decision-sequence-satisfiability.ts` respectively.
6. Runner worker bridge (`packages/runner/src/worker/game-worker-api.ts`) consumes `LegalMoveEnumerationResult` but never touches `preparePlayableMoves` directly — agents run only inside the worker, which exposes `ClassifiedMove` via its clone-compat layer. Confirmed via Step 2 reassessment. No runner code touches engine internals added by this ticket.
7. `classifyDecisionSequenceSatisfiability` signature takes `(baseMove, discoverChoices, options)`. To call it from `prepare-playable-moves.ts` we also need a `discoverChoices` factory — `createMoveDecisionSequenceChoiceDiscoverer` at `packages/engine/src/kernel/move-decision-discoverer.ts` provides this, consuming `(def, state, runtime)`.

## Architecture Check

1. The guided chooser composes with the existing `choose` seam on `TemplateMoveCompletionOptions` rather than introducing a parallel sampler. Foundation #5 — one rules protocol: classifier verdict and sampler selection converge via the shared `choose` callback.
2. The new warning code `GUIDED_COMPLETION_UNEXPECTED_MISS` is a diagnostic, not a stop condition. The simulator continues; if no other legal move converges, the existing `noLegalMoves` path handles termination. Foundation #14 — no compatibility shims: the warning replaces the role of `noPlayableMoveCompletion` without keeping both paths alive.
3. The test-only flag (per Spec 138 T4) introduces a `disableGuidedChooser?: boolean` option on `PreparePlayableMovesOptions` that routes `attemptTemplateCompletion` through the pre-spec uniform sampler. This is scaffolding for the replay-identity gate — it has no production caller, is gated behind the test options type, and is exercised only by T4.
4. Determinism (Foundation #8): the guided chooser selects from the subset in the same canonical order `nextDecision.options` already defines. When random sampling would have landed on a non-subset option, the guided callback substitutes the next subset option in canonical order using the same RNG cursor — seeds whose uniform draw would have found a viable option first remain byte-identical.
5. Foundation #11 immutability: the helper is pure. `GameDefRuntime` is passed through unchanged; no runtime mutation introduced by this ticket (caching is deferred to 138ENUTIMTEM-005).

## What to Change

### 1. Add `GUIDED_COMPLETION_UNEXPECTED_MISS` warning code

In `packages/engine/src/agents/prepare-playable-moves.ts`, define the new code as a string literal used in the warning emit. No enum change required — warning codes are strings in `RuntimeWarning`.

### 2. Add a `disableGuidedChooser` option (test-only flag)

Extend `PreparePlayableMovesOptions`:
```ts
export interface PreparePlayableMovesOptions {
  readonly pendingTemplateCompletions?: number;
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly actionIdFilter?: Move['actionId'];
  readonly disableGuidedChooser?: boolean;  // TEST-ONLY: for T4 replay-identity
}
```

Production code paths (PolicyAgent, GreedyAgent) do not set this; default remains `false`/guided.

### 3. Build the guided chooser in `attemptTemplateCompletion`

When the pending-completion branch is entered (i.e., after `viability.viable && !viability.complete && viability.stochasticDecision === undefined` falls through to `attemptTemplateCompletion`), before the retry loop:
- If `disableGuidedChooser` is true, skip subset extraction and proceed with the existing uniform sampler (this is the pre-spec path, preserved for T4).
- Otherwise, call `classifyDecisionSequenceSatisfiability(move, createMoveDecisionSequenceChoiceDiscoverer(def, state, runtime), { budgets: resolveMoveEnumerationBudgets(), emitViableHeadSubset: true })`.
- If the result has a non-empty `viableHeadSubset`, build a guided `choose` callback:
  ```ts
  const guidedChoose = (request) => {
    if (request.type === 'chooseN' && request.decisionKey === headDecisionKey) {
      // Return a scalar value; completeTemplateMove wraps in array for chooseN
      return /* first subset option */;
    }
    return options.choose?.(request);  // fall through to caller-provided
  };
  ```
  Compose this with any caller-provided `choose` (caller wins for non-head decisions; the guided wrapper owns only the head `decisionKey`).
- If `viableHeadSubset` is empty or undefined, fall through to the uniform sampler (either the classifier returned `'unsatisfiable'` — the move shouldn't have been admitted; or the head is not a `chooseN` — no subset to guide from).

### 4. Randomized selection within the subset

For determinism (G6), when the caller's RNG cursor would have produced a selection index within the full head options array, translate that index into a subset index via modular projection: `subsetIndex = cursorIndex % subset.length`. This preserves deterministic RNG consumption while ensuring only subset options are selected. Use the existing `nextInt` utility from `packages/engine/src/kernel/prng.ts` on a forked RNG to select the subset index, keeping the parent RNG state matching the pre-spec uniform sampler on first viable hit.

### 5. Tripwire warning on retry-budget exhaustion

When `attemptTemplateCompletion` reaches `rejection === 'drawDeadEnd'` final iteration AND the guided chooser was active AND `viableHeadSubset` was non-empty, push a warning:
```ts
warnings.push({
  code: 'GUIDED_COMPLETION_UNEXPECTED_MISS',
  message: 'Guided completion exhausted retry budget despite non-empty viable head subset — kernel classifier vs. sampler disagreement detected.',
  context: {
    actionId: String(move.actionId),
    stateHash: String(state.stateHash),
    attemptCount: templateCompletionAttempts,
    subsetSize: viableHeadSubset.length,
  },
});
```
This warning propagates through the existing `warnings` array on the `TemplateCompletionTrace`.

### 6. Tests T2, T4, T5

**T2 — Sampler convergence invariant** under `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts` (new file):
- For every `(def, state)` in a representative corpus (minimal fixture from 002 + both I1 fixtures from 001), assert: when `classifyDecisionSequenceSatisfiability` returns non-empty `viableHeadSubset`, `attemptTemplateCompletion` with guided chooser converges to `playableComplete` or `playableStochastic` within the existing retry budget.
- File-top marker: `// @test-class: architectural-invariant`.

**T4 — Replay-identity over passing corpus** under `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` (new file):
- For each seed in FITL 1000–1019 (arvn and vc): run `runGame` twice — once with `disableGuidedChooser: true` (pre-spec uniform path), once with guided. For every seed where the guided run performs zero head-restriction (i.e., no legal move reached the pending-completion branch), assert `trace.finalState.stateHash` is byte-identical between the two runs.
- Seeds where guided restriction occurred must be documented: the test skips replay-identity assertion but asserts both runs terminate under an allowed stop reason.
- File-top marker: `// @test-class: architectural-invariant`.

**T5 — Guided-miss tripwire warning** under `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (existing — extend):
- Hand-construct a `(def, state, move)` tuple where `viableHeadSubset` is non-empty. Inject a guided `choose` callback that deliberately returns `undefined` for the head (forcing the sampler to miss). Run `attemptTemplateCompletion` with retry budget exhausted and assert the `warnings` array contains a `GUIDED_COMPLETION_UNEXPECTED_MISS` entry with the expected `{actionId, stateHash, attemptCount, subsetSize}` shape.
- File-top marker: `// @test-class: architectural-invariant`.

### 7. I3 consumer inventory verification

Before merging, re-verify via grep that `prepare-playable-moves.ts` has no external consumers in `packages/runner/**` or outside the `agents/` and `kernel/` engine modules. Runner clone-compat tests (`packages/runner/test/worker/clone-compat.test.ts`) must continue to pass without modification. Document the verification result in the PR description.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)
- `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts` (new — T2)
- `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` (new — T4)
- `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (modify — add T5)

## Out of Scope

- No deletion of `noPlayableMoveCompletion`, `NoPlayableMovesAfterPreparationError`, or `DegeneracyFlag.NO_PLAYABLE_MOVE_COMPLETION` — Foundation 14 atomic cut is 138ENUTIMTEM-004.
- No runner worker bridge changes (confirmed zero-touch by I3).
- No caching on `GameDefRuntime` (deferred to 138ENUTIMTEM-005).
- No changes to `classifyDecisionSequenceSatisfiability` beyond what 138ENUTIMTEM-002 landed.
- No changes to agent policy YAML or policy-profile weights.

## Acceptance Criteria

### Tests That Must Pass

1. T2 integration test passes: guided chooser converges within existing retry budget for every fixture in the corpus.
2. T4 determinism test passes: replay-identity holds for every seed where guided restriction did not occur.
3. T5 unit test passes: `GUIDED_COMPLETION_UNEXPECTED_MISS` warning emitted with expected shape.
4. FITL arvn seeds 1002 and 1010 terminate under an allowed stop reason (not `noPlayableMoveCompletion`) when run through `runGame` with guided chooser active.
5. All existing policy-agent / greedy-agent / prepare-playable-moves tests continue to pass.
6. `pnpm turbo build test lint typecheck` green.

### Invariants

1. With `disableGuidedChooser: true`, `attemptTemplateCompletion` produces byte-identical trace output to pre-ticket HEAD (replay identity, test-flag-gated).
2. With guided chooser active, no seed in FITL 1000–1019 emits `GUIDED_COMPLETION_UNEXPECTED_MISS` — if it does, that is a classifier-vs-sampler bug signal and CI must surface it.
3. `viableHeadSubset` selection within the guided chooser is deterministic: same RNG + same subset → same option chosen.
4. The guided wrapper returns `undefined` for any request that is not the matching head `decisionKey`, preserving caller-provided and downstream-random behavior for all other decisions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts` (new) — T2 convergence invariant.
2. `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` (new) — T4 replay identity over passing corpus.
3. `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (modify) — add T5 tripwire warning case.

### Commands

1. `pnpm -F @ludoforge/engine test:unit --test-name-pattern="prepare-playable-moves"`
2. `pnpm -F @ludoforge/engine test:e2e` (integration + determinism)
3. `pnpm turbo build test lint typecheck`
4. `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 20 --players 4 --evolved-seat arvn --max-turns 200` (manual: confirm seeds 1002 and 1010 no longer hit `noPlayableMoveCompletion`)
