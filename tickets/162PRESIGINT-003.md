# 162PRESIGINT-003: chooseN frontier trace — unknownPreviewRefs, selectionReason union, coverage block, POLICY_PREVIEW_SIGNAL_UNAVAILABLE advisory

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `policy-agent.ts`, `policy-preview-inner.ts`, `policy-preview-inner-choosenstep.ts`
**Deps**: `archive/tickets/162PRESIGINT-002.md`

## Problem

After 002 lands, `PolicyEvaluationCandidate.unknownPreviewRefs` is populated for chooseN frontier candidates whenever a preview-option ref is unavailable. The trace surface still hardcodes `unknownPreviewRefs: []` at `policy-agent.ts:86` and `:299`, and the `selectionReason` union at the same lines is fixed to `'gated'`. There is no `coverage` block on `previewUsage`, no `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory, and no way for an analyst inspecting the trace to know that all root-option drives at a microturn yielded no usable signal.

This ticket completes Phase 1 (observability without YAML change) per spec §8: chooseN frontier candidate trace populates `unknownPreviewRefs` from the candidate's tracking map; the `selectionReason` union extends with `tiebreakAfterPreviewNoSignal` and `fallbackExplicit` (the latter reserved — actual firing condition lands with 005); a `PolicyPreviewCoverage` block lands on `previewUsage`; and the advisory fires at decision-record time, deterministically ordered.

## Assumption Reassessment (2026-05-09)

1. **Hardcoded `unknownPreviewRefs: []`.** Verified at `policy-agent.ts:86` (chooseStructuralFrontierDecision verbose trace) and `:299` (guidedChoice fallback path). Both are reachable for chooseN frontier candidates.
2. **`selectionReason` is a string-literal type.** At `policy-agent.ts:87, 300` it is set to `'gated'`. The full union (`'gated' | 'scored' | 'tiebreak'`) lives in the trace type module — confirm location during implementation; spec §5.3 names the existing variants.
3. **`previewUsage` shape.** Verified at `policy-preview-inner.ts:81` (`outcomeBreakdown`) and `policy-preview-inner-choosenstep.ts:83, 104`. The new `coverage` block is additive — does not replace `outcomeBreakdown`.
4. **Advisory infrastructure.** Spec §14 Open Question 3 names two placement options: existing `agentDecision.advisories[]` (creating if absent) vs sibling `policyQualityAdvisories[]` on the run-level trace. Verify the existing trace shape during implementation; default to whichever is consistent with `Appendix: Determinism Proofs vs. Profile-Quality Witnesses` in `docs/FOUNDATIONS.md` (advisory is policy-quality, not determinism). Decision is in scope for this ticket.
5. **`fallbackExplicit` requires Phase 2 to fire.** This ticket adds the union variant only; the firing condition (selected candidate's score includes a `previewFallback.onUnavailable.constant` contribution) needs the runtime change in 005. Reserving the variant in Phase 1 keeps the trace shape stable across phase boundaries.
6. **Determinism is sacred.** Advisory ordering MUST be deterministic — emit at decision-record time using the same canonical iteration order the rest of the trace already uses (`canonicalOrder`, `frontier` map order). No wall-clock, no hash-set iteration.

## Architecture Check

1. **Phase 1 is independently mergeable.** No YAML change, no compiler change. Profiles compile and run identically; trace gains observability fields. This isolates the trace-shape diff from the contract-shape diff (004).
2. **`fallbackExplicit` reserved in the union but not yet fired.** Adding the variant now means the trace type is stable when 005 lands; if we deferred the variant to 005 we would need a second trace-type bump. Reserve-now-fire-later is cheaper than a two-step type evolution.
3. **Coverage block additive.** `outcomeBreakdown` already enumerates `unknownDepthCap`, `unknownHidden`, etc. (`policy-preview-inner.ts:147,173-174`). The new `coverage` block exposes roll-up counts derived from the per-ref status map — additive, derivable, redundant in principle but useful in trace consumption (an analyst should not have to reduce `outcomeBreakdown` to know whether all roots were unavailable).
4. **Engine-agnostic.** Advisory `code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE'` is a generic policy-pipeline signal. No game-specific identifiers.
5. **Foundation #20 alignment.** Foundation #20 mandates `tiebreakAfterPreviewNoSignal` selection-reason and the advisory emission. This ticket implements both.

## What to Change

### 1. Extend `selectionReason` union

Locate the trace type module (likely `policy-agent-trace.ts` or `policy-evaluation-core.ts` — confirm during implementation). Extend `CandidateSelectionReason`:

```ts
type CandidateSelectionReason =
  | 'gated'
  | 'scored'
  | 'tiebreak'
  | 'tiebreakAfterPreviewNoSignal'  // NEW — Phase 1 firing
  | 'fallbackExplicit';              // NEW — reserved; fires from 005
```

### 2. Populate `unknownPreviewRefs` for chooseN frontier candidates

In `policy-agent.ts`:
- `traceCandidatesForFrontier` (line 74) — replace the hardcoded `unknownPreviewRefs: []` with the candidate's actual `unknownPreviewRefs` map content. Plumb the per-candidate `PolicyEvaluationCandidate` into the trace builder if not already available. Convert the `Map<string, PolicyPreviewUnavailabilityReason>` into the array shape the trace already declares (likely `readonly { refId: string; reason: PolicyPreviewUnavailabilityReason }[]` — confirm during implementation).
- `chooseStructuralFrontierDecision` guidedChoice path (line 280-310) — same treatment for the candidates in `input.microturn.legalActions.map(...)`.

### 3. Classify `selectionReason` at trace-build time

Per spec §5.3:
- A candidate's `selectionReason` is `tiebreakAfterPreviewNoSignal` when (a) the consideration set requested at least one `preview.option.*` ref, (b) every requested ref across **every legal candidate** at this microturn was `unavailable`, and (c) the candidate is the `selectedStableMoveKey` (chosen via stable tie-break).
- Otherwise existing classification: `gated` for non-selected, `scored` for selected when score-driven, `tiebreak` for tied-then-broken on non-preview-driven score.
- `fallbackExplicit` does not fire in this ticket — leave a guarded branch that returns false today; 005 will populate the firing condition.

### 4. Add `PolicyPreviewCoverage` block to `previewUsage`

In the `previewUsage` type (`policy-preview-inner.ts:81` and chooseNStep variants `:75, 96`), add:

```ts
type PolicyPreviewCoverage = {
  readonly requestedRefCount: number;
  readonly evaluatedRootOptionCount: number;
  readonly readyRootOptionCount: number;
  readonly unavailableRootOptionCount: number;
  readonly allRootsUnavailable: boolean;
  readonly selectedByTieBreakerBecausePreviewUnavailable: boolean;
};
```

Compute the rollup at the point the driver returns its `PolicyPreviewTraceOutcome`/`previewUsage` payload — derive from the per-ref status map already produced in 002.

### 5. Emit `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory

Define the advisory shape per spec §5.3:

```ts
type PolicyPreviewSignalUnavailableAdvisory = {
  readonly code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE';
  readonly profileId: string;
  readonly seatId: string;
  readonly decisionKind: 'chooseOne' | 'chooseNStep';
  readonly decisionKey: string;
  readonly requestedRefs: readonly string[];
  readonly evaluatedRootOptionCount: number;
  readonly unavailableRootOptionCount: number;
  readonly unavailabilityBreakdown: Readonly<Record<PolicyPreviewUnavailabilityReason, number>>;
  readonly selectedStableMoveKey: string;
  readonly selectionReason: 'tiebreakAfterPreviewNoSignal';
};
```

**Trigger**: at decision-record time (i.e., in `chooseStructuralFrontierDecision`/guided-choice paths after the candidate trace is built), if `coverage.allRootsUnavailable === true` AND a microturn-scope consideration referenced one or more `preview.option.*` refs, emit one advisory.

**Placement**: per spec Open Question 3, choose between `agentDecision.advisories[]` (per-decision) and `policyQualityAdvisories[]` (run-level). Recommended: per-decision `agentDecision.advisories[]`, because it travels with the decision-level trace and is easier to correlate during replay. Document the choice inline.

**Deterministic ordering**: insert into `advisories` after candidate trace, before `selectedStableMoveKey`. Keep the same iteration order across replays.

### 6. Existing tests update

Tests that read `previewUsage` may need to assert the new `coverage` block exists. Replay-identity tests (`spec-160-*-replay-identity.test.ts`, `spec-161-*-replay-identity.test.ts`) MUST continue to pass byte-identical replay because `coverage` is deterministic.

### 7. New architectural-invariant tests

Create `packages/engine/test/agents/preview-integrity/preview-coverage-rollup.test.ts` (T3 from spec §9.1):

```ts
// @test-class: architectural-invariant
```

- Construct a synthetic chooseN frontier where N root options drive and K resolve to `ready` refs. Run preview, read `previewUsage.coverage`. Assert `readyRootOptionCount === K`, `unavailableRootOptionCount === N - K`, `allRootsUnavailable === (K === 0)`, `selectedByTieBreakerBecausePreviewUnavailable === (K === 0 && requestedRefs.length > 0)`.

Create `packages/engine/test/agents/preview-integrity/preview-advisory-deterministic-order.test.ts` (T4 from spec §9.1):

```ts
// @test-class: architectural-invariant
```

- Replay-twice harness — run a preview-collapsing scenario twice. Assert advisory order identical, advisory content byte-identical, full trace JSON byte-identical.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify — `traceCandidatesForFrontier`, guided-choice frontier candidate trace, advisory emission, `selectionReason` classification)
- `packages/engine/src/agents/policy-preview-inner.ts` (modify — `previewUsage` extended with `coverage` block; rollup derivation)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (modify — same `coverage` extension, rollup derivation)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify if `CandidateSelectionReason` lives here; otherwise touch the trace-type module)
- `packages/engine/test/agents/preview-integrity/preview-coverage-rollup.test.ts` (new)
- `packages/engine/test/agents/preview-integrity/preview-advisory-deterministic-order.test.ts` (new)

## Out of Scope

- `previewFallback` YAML/compiler. Owned by 004.
- Runtime `evaluateConsideration` consuming `previewFallback` and `fallbackExplicit` selectionReason firing. Owned by 005. This ticket leaves the `fallbackExplicit` branch present-but-unreachable.
- ARVN seed 1000 convergence-witness. Owned by 006.
- Cookbook update. Owned by 006.
- Fixture migration. Owned by 004.

## Acceptance Criteria

### Tests That Must Pass

1. T3: `preview-coverage-rollup.test.ts` — coverage rollup matches per-ref status map.
2. T4: `preview-advisory-deterministic-order.test.ts` — replay-identical advisory emission.
3. Architectural-invariant: when a chooseN frontier produces `coverage.allRootsUnavailable === true` and a consideration requests a `preview.option.*` ref, exactly one advisory emits and `selectionReason` for the selected candidate is `tiebreakAfterPreviewNoSignal`.
4. Architectural-invariant: chooseNStep candidates' `unknownPreviewRefs` (in trace) is non-empty whenever the per-option ref status map contains `unavailable` entries.
5. Existing FITL canary golden tests still pass.
6. Existing replay-identity tests still pass byte-identical.
7. Existing suite: `pnpm turbo build && pnpm turbo test`.

### Invariants

1. Advisory order is deterministic and replay-identical.
2. `coverage` block is additive on `previewUsage`; `outcomeBreakdown` shape is unchanged.
3. `fallbackExplicit` selectionReason is defined in the union but never fires in this ticket (no `previewFallback` runtime path yet).
4. `INNER_PREVIEW_HARD_CAP === 256` unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/preview-integrity/preview-coverage-rollup.test.ts` (new) — coverage rollup correctness across the per-ref status map, T3 from spec §9.1.
2. `packages/engine/test/agents/preview-integrity/preview-advisory-deterministic-order.test.ts` (new) — replay-identity for advisory emission, T4 from spec §9.1.
3. Possibly minor updates in `policy-preview-inner-fitl-canary-golden.test.ts` and `policy-preview-inner-choosenstep-fitl-canary-golden.test.ts` to assert presence of `coverage` block (depending on assertion strictness).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test --test-name-pattern preview-integrity`
3. `pnpm -F @ludoforge/engine test` (full engine suite)
4. `pnpm turbo test` (full repo)
5. `pnpm turbo typecheck`
