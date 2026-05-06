# 156PREVOBSUTMET-005: Inner-frontier scoreContributions parity

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/completion-guidance-choice.ts` (return per-option contributions), `policy-agent.ts` (`traceCandidatesForFrontier` populates real contributions), new tests
**Deps**: `archive/tickets/156PREVOBSUTMET-001.md`

## Problem

Spec 156 Gap 6: every `chooseOne` / `chooseNStep` candidate trace has `scoreContributions: []` even when `selectBestCompletionChooseOneValue` matched a completion-scope consideration and produced a non-zero score. Today's `traceCandidatesForFrontier` (`policy-agent.ts:62-75`) hard-codes the empty array. The action-selection trace was raised to per-term breakdown by Spec 145; the inner-frontier trace was not. With multiple completion-scope considerations declared (e.g., `preferPatronageMode` + a future `preferHighPopulationTarget`), an operator cannot see which one dominated — the trace shows the final score but no path back to the rule that produced it.

This ticket fixes the asymmetry: `selectBestCompletionChooseOneValue` (and the chooseN sibling `buildCompletionChooseCallback`) returns per-option contribution breakdowns alongside the chosen value. `traceCandidatesForFrontier` reads them and emits real `scoreContributions[]` arrays under verbose tier. Spec 158 will rename the involved evaluator from `completion`-scope to `microturn`-scope; this ticket lands the contribution-return shape that survives the rename.

## Assumption Reassessment (2026-05-06)

1. `selectBestCompletionChooseOneValue` lives in `packages/engine/src/agents/completion-guidance-choice.ts` and is invoked from `pickAgentGuidedChooseOneDecision` (`policy-preview.ts:394-415`). Its current return shape is `{ value: unknown } | undefined`. The new shape is `{ value, scoreContributionsByOption: Map<OptionStableKey, ScoreContribution[]> } | undefined`.
2. `buildCompletionChooseCallback` is the chooseN sibling. Same change shape.
3. `traceCandidatesForFrontier` (`policy-agent.ts:62-75`) is the single call site populating the inner-frontier candidate trace. The empty-array hardcode at line 71 is replaced by a real lookup.
4. `evaluateConsideration` already supports a per-term diagnostic callback (visible at `policy-eval.ts:633-635`: `(contribution) => candidate.scoreContributions.push({ termId: considerationId, contribution })`). The chooser will use the same callback shape.
5. F#8 (Determinism): contribution iteration order is the consideration-id order in `profile.use.considerations`, deterministic.
6. Spec 158 will rename `selectBestCompletionChooseOneValue` to `selectBestMicroturnOption` and shift from `scopes: [completion]` to `scopes: [microturn]`. The contribution-return shape this ticket adds is forward-compatible — the rename is a mechanical move.

## Architecture Check

1. Returning contributions from the chooser keeps the contribution-derivation co-located with the score-derivation: a single pass over considerations produces both. Alternative (re-evaluate considerations at trace-emit time) duplicates work and risks contribution-vs-score divergence.
2. Engine-agnostic: contributions are keyed by `(termId, contribution)` over generic consideration ids. Same code path for FITL, Texas Hold'em, any future game.
3. No backwards-compatibility shims. The chooser's return shape changes in one commit, all callers updated, fixture trace JSON re-blessed.

## What to Change

### 1. Chooser API — `packages/engine/src/agents/completion-guidance-choice.ts`

`selectBestCompletionChooseOneValue` returns `{ value, scoreContributionsByOption } | undefined`:

```ts
export interface CompletionChoiceWithContributions {
  readonly value: unknown;
  readonly scoreContributionsByOption: ReadonlyMap<string, readonly ScoreContribution[]>;
}

export const selectBestCompletionChooseOneValue = (
  context: ChooserContext,
  request: ChooseOneRequest,
  options: ChooserOptions,
): CompletionChoiceWithContributions | undefined => {
  // existing per-option scoring loop, but capture contributions per option:
  const scoreContributionsByOption = new Map<string, ScoreContribution[]>();
  for (const option of request.options) {
    const contributions: ScoreContribution[] = [];
    let score = 0;
    for (const considerationId of profile.use.considerations) {  // deterministic order
      const contribution = evaluation.evaluateConsideration(
        considerations,
        considerationId,
        optionContext(option),
        (c) => contributions.push({ termId: considerationId, contribution: c }),
      );
      score += contribution;
    }
    scoreContributionsByOption.set(stableKeyFor(option), contributions);
    // existing best-pick comparison...
  }
  return { value: bestOption.value, scoreContributionsByOption };
};
```

`buildCompletionChooseCallback` (chooseN) gets the analogous treatment.

### 2. Trace emit — `packages/engine/src/agents/policy-agent.ts`

`traceCandidatesForFrontier` (lines 62-75) is rewritten:

```ts
const traceCandidatesForFrontier = (
  traceLevel: PolicyDecisionTraceLevel,
  frontier: readonly FrontierCandidate[],
  scoreContributionsByOption: ReadonlyMap<string, readonly ScoreContribution[]> | undefined,
): PolicyEvaluationMetadata['candidates'] => traceLevel === 'verbose'
  ? frontier.map((candidate) => ({
      actionId: candidate.decision.kind === 'actionSelection' ? String(candidate.decision.actionId) : candidate.decision.kind,
      stableMoveKey: candidate.stableMoveKey,
      score: candidate.score,
      prunedBy: [],
      scoreContributions: [...(scoreContributionsByOption?.get(candidate.stableMoveKey) ?? [])],
      previewRefIds: [],
      unknownPreviewRefs: [],
      selectionReason: 'gated',  // ticket 001 default; ticket 003 doesn't apply to inner frontier
    }))
  : [];
```

The caller (`chooseStructuralFrontierDecision` and the action-selection paths invoking `selectBestCompletionChooseOneValue`) threads the chooser's `scoreContributionsByOption` into the trace call. When the chooser was not invoked (e.g., random tiebreak path), pass `undefined` and the trace falls back to empty arrays.

### 3. Update call sites

- `pickAgentGuidedChooseOneDecision` (`policy-preview.ts:394-415`) — destructure the new return shape; today the chooser's contributions are discarded. Once Spec 159 lands, this call site is renamed.
- Any other consumer of `selectBestCompletionChooseOneValue` (e.g., `policy-agent.ts`'s direct chooser path) — update to the new shape.

### 4. Tests

`packages/engine/test/unit/agents/inner-frontier-score-contributions.test.ts` (new) — `architectural-invariant`. Construct a chooseOne with a single matched completion-scope consideration; assert the candidate trace's `scoreContributions: [{ termId: 'preferPatronageMode', contribution: 10 }]`; assert sum of contributions equals candidate score.

`packages/engine/test/unit/agents/inner-frontier-multi-consideration-contributions.test.ts` (new) — `architectural-invariant`. Construct a chooseOne with two matched considerations producing different contributions; assert both appear in `scoreContributions[]`; assert sum invariant.

`packages/engine/test/unit/agents/completion-guidance-choice-contributions.test.ts` (new) — direct unit test of the chooser's new return shape. Verifies `scoreContributionsByOption` map is populated for every legal option, even those not chosen.

## Files to Touch

- `packages/engine/src/agents/completion-guidance-choice.ts` (modify — return shape)
- `packages/engine/src/agents/policy-agent.ts` (modify — `traceCandidatesForFrontier` populates contributions)
- `packages/engine/src/agents/policy-preview.ts` (modify — `pickAgentGuidedChooseOneDecision` and chooseN sibling threading new return)
- `packages/engine/test/unit/agents/inner-frontier-score-contributions.test.ts` (new)
- `packages/engine/test/unit/agents/inner-frontier-multi-consideration-contributions.test.ts` (new)
- `packages/engine/test/unit/agents/completion-guidance-choice-contributions.test.ts` (new — or modify existing `completion-guidance-choice.test.ts`)
- `packages/engine/test/fixtures/trace/inner-frontier-contributions-fixture.json` (new — fixture supporting the integration golden)

## Out of Scope

- Renaming `selectBestCompletionChooseOneValue` to `selectBestMicroturnOption`. (Spec 158.)
- Migrating from `scopes: [completion]` to `scopes: [microturn]`. (Spec 158.)
- Synthetic-decision trace `scoreContributions` (different surface — inside `SyntheticDecisionTraceEntry`, populated when Spec 159's `policyGuided` chooses inner options). (Ticket 004 + Spec 159.)
- Removing the existing inner-frontier candidate trace fields (`prunedBy`, `previewRefIds`, `unknownPreviewRefs`). (Future cleanup.)

## Acceptance Criteria

### Tests That Must Pass

1. New: chooseOne with `preferPatronageMode` (weight 10) consideration matching `patronage` option produces `scoreContributions: [{ termId: 'preferPatronageMode', contribution: 10 }]` on the patronage candidate trace; sum of contributions equals candidate score.
2. New: chooseOne with two matching considerations produces both contributions in the candidate trace; sum invariant holds.
3. New: chooseOne where the chooser was not invoked (no completion-scope considerations declared) produces empty `scoreContributions[]` (no regression).
4. New: replay-identity — two runs produce byte-identical `scoreContributions[]` JSON.
5. Existing engine suite: `pnpm -F @ludoforge/engine test`.
6. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) For every inner-frontier candidate where the chooser fired, `Σ scoreContributions[].contribution` equals the candidate's final score (within F#8 integer-arithmetic exactness).
2. (architectural-invariant) For every inner-frontier candidate, every entry in `scoreContributions[]` has a `termId` matching a declared consideration id.
3. (architectural-invariant) `scoreContributionsByOption` map covers every legal option from the chooser's input request (no missing options).
4. (architectural-invariant) Replay-identity: `scoreContributions[]` is byte-identical across runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/inner-frontier-score-contributions.test.ts` (new) — `architectural-invariant`. Single-consideration sum invariant.
2. `packages/engine/test/unit/agents/inner-frontier-multi-consideration-contributions.test.ts` (new) — `architectural-invariant`. Multi-consideration breakdown.
3. `packages/engine/test/unit/agents/completion-guidance-choice-contributions.test.ts` (new) — `architectural-invariant`. Direct chooser API test.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/inner-frontier-score-contributions`
2. `pnpm -F @ludoforge/engine test:unit -- agents/inner-frontier-multi-consideration-contributions`
3. `pnpm -F @ludoforge/engine test:unit -- agents/completion-guidance-choice-contributions`
4. `pnpm turbo lint typecheck test`

## Outcome (2026-05-06)

Implemented. The live implementation keeps the owned behavior at the same trace/chooser seams but uses the existing unit-test families instead of adding a JSON fixture:

- `packages/engine/src/agents/completion-guidance-eval.ts` now exposes the same completion score with a deterministic `{ termId, contribution }` breakdown.
- `packages/engine/src/agents/completion-guidance-choice.ts` returns `scoreContributionsByOption` from both `selectBestCompletionChooseOneValue` and the chooseN callback path. The map keys match the existing inner-frontier `stableMoveKey` strings for `chooseOne` and `chooseNStep:add` decisions.
- `packages/engine/src/agents/policy-agent.ts` emits the mapped contributions in verbose inner-frontier candidate traces when the guided completion chooser fires; unguided structural fallback candidates still emit `scoreContributions: []`.
- `packages/engine/src/agents/policy-preview.ts` was adjusted only to unwrap the new chooser return shape; synthetic-decision trace scoring remains out of scope for ticket 004 / Spec 159.
- `packages/engine/test/unit/agents/completion-guidance-choice.test.ts` covers the direct chooser API, including chooseN map coverage for selected and unselected options.
- `packages/engine/test/unit/agents/policy-agent-microturn-evaluation.test.ts` covers emitted verbose inner-frontier candidate contributions with two completion-scope considerations and asserts the contribution sum equals the candidate score.

Verification command substitution: the ticket's focused `pnpm -F @ludoforge/engine test:unit -- agents/...` examples were stale for this package's Node test runner. The focused final lanes were `pnpm -F @ludoforge/engine build` followed by compiled `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/completion-guidance-choice.test.js` and `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-agent-microturn-evaluation.test.js`.

Final proof:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/completion-guidance-choice.test.js` — passed, 10 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-agent-microturn-evaluation.test.js` — passed, 5 tests.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm -F @ludoforge/engine test` — passed, default lane summary 64/64 files passed.
- `pnpm run check:ticket-deps` — passed for 2 active tickets and 2246 archived tickets.

Post-proof edit invalidation: this terminal patch transcribes the just-run proof and sets status only. It does not change implementation scope, acceptance criteria, command semantics, touched-file ownership, or dependency ownership, so the proof lanes above remain valid.
