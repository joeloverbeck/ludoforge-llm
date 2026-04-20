# 138ENUTIMTEM-002: Extend decision-sequence classifier with emitViableHeadSubset mode

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (extension + result shape)
**Deps**: `archive/tickets/138ENUTIMTEM-001.md`

## Problem

Per Spec 138 Goal G1 and Design §D1–D3, the existing `classifyDecisionSequenceSatisfiability` already traverses the full decision tree and proves whether ≥1 head option is completable — but it only returns a scalar verdict (`'satisfiable' | 'unsatisfiable' | 'unknown'`) and discards the per-option data. To close the enumerate-vs-sampler information asymmetry that underlies the seed-1002 and seed-1010 failures, the classifier must surface the satisfiable subset of the first `chooseN` head when the caller opts in. This is the foundational deliverable that 138ENUTIMTEM-003 builds on.

## Assumption Reassessment (2026-04-19)

1. `packages/engine/src/kernel/decision-sequence-satisfiability.ts:17` exports `DecisionSequenceSatisfiabilityResult` as `{ classification, warnings }`. Confirmed during spec reassessment.
2. `packages/engine/src/kernel/decision-sequence-satisfiability.ts:22` exports `DecisionSequenceSatisfiabilityOptions`. Confirmed.
3. The existing classifier's head-level early-exit is at line 191–193 (`if (outcome === 'satisfiable') { branchOutcome = 'satisfiable'; return false; }`). Disabling it only when `emitViableHeadSubset` is true preserves default-caller performance.
4. `DEFAULT_MOVE_ENUMERATION_BUDGETS.maxDecisionProbeSteps === 128`. Confirmed in `packages/engine/src/kernel/move-enumeration-budgets.ts:12`. I0 measurement showed the full traversal for seeds 1002/1010 stayed under this budget; no budget raise is required for Phase 1.
5. `MoveParamScalar` is imported from `./types.js` in the current file. Confirmed.
6. Only `classifyMoveDecisionSequenceAdmissionForLegalMove` (in `move-decision-sequence.ts`) currently calls `classifyDecisionSequenceSatisfiability`. New callers (via 138ENUTIMTEM-003) will call `classifyDecisionSequenceSatisfiability` directly for the subset-extraction path.

## Architecture Check

1. In-place extension of the existing classifier avoids creating a parallel module (Foundation #5 — one rules protocol). No new `kernel/template-viability-classifier.ts` — the existing module already owns decision-sequence satisfiability.
2. The opt-in flag guarantees byte-identical behavior for every existing caller (Foundation #8 replay identity). The early-exit is disabled only when `emitViableHeadSubset: true`, which is a strictly new code path.
3. No new budget constant (`CLASSIFIER_MAX_PROBE_WORK` rejected by reassessment) — the extension reuses `MoveEnumerationBudgets.maxDecisionProbeSteps` and `maxParamExpansions`. Foundation #10 compliance is preserved without duplication.
4. The extension is pure (Foundation #11): signature `(baseMove, discoverChoices, options) → result`; no mutation of arguments or of `GameDefRuntime`.
5. No runner worker bridge impact — `DecisionSequenceSatisfiabilityResult` is engine-internal; the new optional field does not change the `LegalMoveEnumerationResult` shape consumed by the runner.

## What to Change

### 1. Extend `DecisionSequenceSatisfiabilityOptions`

Add the opt-in flag:
```ts
export interface DecisionSequenceSatisfiabilityOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly orderSelections?: (request: ChoicePendingRequest, selectableValues: readonly MoveParamValue[]) => readonly MoveParamValue[];
  readonly emitViableHeadSubset?: boolean;  // NEW
}
```

### 2. Extend `DecisionSequenceSatisfiabilityResult`

Add the optional result field:
```ts
export interface DecisionSequenceSatisfiabilityResult {
  readonly classification: DecisionSequenceSatisfiability;
  readonly warnings: readonly RuntimeWarning[];
  readonly viableHeadSubset?: readonly MoveParamScalar[];  // NEW: populated iff emitViableHeadSubset && first request.kind === 'pending' && request.type === 'chooseN'
}
```

### 3. Extend `classifyDecisionSequenceSatisfiability` algorithm

When `emitViableHeadSubset: true`:
- After the initial `classifyFromMove(baseMove)` reaches the first pending choice request, capture its identity. If `request.kind !== 'pending' || request.type !== 'chooseN'`, skip subset extraction — return `viableHeadSubset: undefined` and proceed with default (scalar) behavior.
- For the head `chooseN` only, disable the early-exit at the `visit` callback (do not set `branchOutcome = 'satisfiable'; return false`). Instead, accumulate each option's classification and add the option's value to `viableHeadSubset` when the downstream classification is `'satisfiable'` OR `'unknown'` (conservative fail-open matching the existing `isMoveDecisionSequenceAdmittedForLegalMove` policy).
- For downstream decisions below the head, keep the existing first-success early-exit — the subset only needs head-level granularity.
- If budget is exhausted mid-head-enumeration, emit a `RuntimeWarning` with code `MOVE_ENUM_DECISION_PROBE_SUBSET_INCOMPLETE` and return `classification: 'unknown'` with whatever partial subset was accumulated.
- Option values MUST be collected in canonical `nextDecision.options` order (Foundation #8 determinism).

### 4. Wire through `move-decision-sequence.ts` convenience wrappers

`classifyMoveDecisionSequenceSatisfiability` currently wraps `classifyDecisionSequenceSatisfiability`. Add a plumbing option to let callers pass `emitViableHeadSubset` through. Existing callers (`isMoveDecisionSequenceAdmittedForLegalMove`, `classifyMoveDecisionSequenceAdmissionForLegalMove`) do NOT opt in — their behavior is unchanged.

### 5. Unit test (T1 from spec)

Under `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` (existing file — extend), add three test cases:

- Minimal hand-authored GameDef with one action `marchMini` whose head is `chooseN{min:1, max:1, options:3}`. Option 0 leads to completable path; option 1 raises `CHOICE_RUNTIME_VALIDATION_FAILED` at a downstream step; option 2 resolves to `illegal`. Assert `classification === 'satisfiable'` and `viableHeadSubset` equals `[option0Value]` in canonical order.
- Second fixture where all three options are dead-ends. Assert `classification === 'unsatisfiable'` and `viableHeadSubset === []`.
- Third fixture where head is `chooseOne` (not `chooseN`). Assert `classification === 'satisfiable'` and `viableHeadSubset === undefined` (no head-subset extraction applies).

File-top marker: `// @test-class: architectural-invariant` (this property holds across every legitimate kernel evolution, not a seed/profile-specific trajectory — matches Spec 137's distillation guidance).

## Files to Touch

- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify — wrapper plumbing)
- `packages/engine/src/kernel/types-core.ts` (modify — add new runtime warning code to shared contract)
- `packages/engine/src/kernel/schemas-core.ts` (modify — add new runtime warning code to schema source)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate)
- `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` (modify — add T1 cases)

## Out of Scope

- No changes to `prepare-playable-moves.ts` (deferred to 138ENUTIMTEM-003).
- No deletion of `noPlayableMoveCompletion`, `NoPlayableMovesAfterPreparationError`, or related symbols (deferred to 138ENUTIMTEM-004).
- No changes to the enumeration path in `legal-moves.ts` — per Design §D4 the admission filter continues to call the scalar-verdict path without `emitViableHeadSubset`.
- No caching or memoization — caching decision is gated in 138ENUTIMTEM-005.

## Acceptance Criteria

### Tests That Must Pass

1. T1 unit tests (new) all pass: three-option minimal fixture returns correct subset; three-dead-end fixture returns empty subset; chooseOne fixture returns undefined subset.
2. All existing `classifyDecisionSequenceSatisfiability` callers continue to produce byte-identical verdicts (no opt-in, no behavior change).
3. `pnpm -F @ludoforge/engine build` followed by `node --test dist/test/unit/kernel/decision-sequence-satisfiability.test.js` passes.
4. `pnpm turbo build test lint typecheck` green.

### Invariants

1. Calling `classifyDecisionSequenceSatisfiability` without `emitViableHeadSubset` produces results byte-identical to pre-ticket behavior.
2. When `viableHeadSubset` is present, its length equals the number of head options whose downstream classification was `'satisfiable'` or `'unknown'` (conservative inclusion).
3. Option values in `viableHeadSubset` appear in the same order as in `nextDecision.options` (canonical kernel emission order — Foundation #8).
4. Budget-exhaustion during subset extraction emits `MOVE_ENUM_DECISION_PROBE_SUBSET_INCOMPLETE` and returns `classification: 'unknown'` with the partial subset.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` — three new cases for T1 (viable-subset capture, empty subset, non-chooseN head).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/kernel/decision-sequence-satisfiability.test.js`
3. `pnpm turbo build test lint typecheck`

## Outcome

- Completed: 2026-04-19
- Implemented opt-in `emitViableHeadSubset` support in `packages/engine/src/kernel/decision-sequence-satisfiability.ts` and plumbed the wrapper option through `packages/engine/src/kernel/move-decision-sequence.ts`.
- Added T1 unit coverage in `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` for satisfiable chooseN head capture, empty subset, and non-chooseN head behavior.
- Added `MOVE_ENUM_DECISION_PROBE_SUBSET_INCOMPLETE` to the shared runtime warning contract and regenerated the impacted engine schema artifacts.
- ticket corrections applied: `pnpm -F @ludoforge/engine test:unit --test-name-pattern="decision-sequence-satisfiability" -> pnpm -F @ludoforge/engine build && node --test dist/test/unit/kernel/decision-sequence-satisfiability.test.js`; `owned file list limited to classifier/wrapper/test -> shared warning contract + generated schemas also updated for the new warning code`
- verification set: `pnpm -F @ludoforge/engine build`, `node --test dist/test/unit/kernel/decision-sequence-satisfiability.test.js`, `pnpm turbo build test lint typecheck`
