# 145PREVCOMP-001: Bounded synthetic-completion driver and profile config

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `agents/policy-preview.ts`, `kernel/types-core.ts`, `kernel/schemas-core.ts`, `cnl/compile-agents.ts`, `cnl/validate-agents.ts`; doc update in `docs/agent-dsl-cookbook.md`
**Deps**: `archive/specs/145-bounded-synthetic-completion-preview.md`

## Problem

Per Spec 145 D1–D6, D8–D12: the agent-side preview pipeline currently rejects every `pendingAdmissible` action-selection candidate (`policy-preview.ts:172-180`, `failureReason: 'notDecisionComplete'`), so `preview.victory.currentMargin.self` resolves as `unresolved` for nearly every non-trivial FITL action and `coalesce` falls through to a candidate-invariant `feature.selfMargin`. This collapses `preferProjectedSelfMargin` to a constant offset and was the empirical driver of 173 of 196 ARVN evolved-seat decisions tying at score 0 in trace-1000.

This ticket replaces the rejection with a bounded synthetic-completion driver that resolves a candidate's compound turn through inner microturns using a configurable completion policy (`greedy` or `agentGuided`), within explicit `K_PREVIEW_DEPTH` and same-seat / same-turn fences. It also introduces the `preview.completion`, `preview.completionDepthCap`, and `preview.topK` profile config fields (the topK gate itself lands in `145PREVCOMP-002`; this ticket only validates and threads the field).

All driver-internal unit tests (boundedness, same-seat fence, stochastic surfacing, cache hit determinism, input-state immutability) attach to this ticket per Spec 145 §Testing — they exercise behavior introduced by the driver itself.

## Assumption Reassessment (2026-04-25)

1. `classifyPreviewCandidate` rejection branch verified at `packages/engine/src/agents/policy-preview.ts:172-180` (returns `failureReason: 'notDecisionComplete'` for any `pendingAdmissible` continuation other than `stochastic`).
2. `tryApplyPreview` calls `applyMove` with `{ advanceToDecisionPoint: false }` at `policy-preview.ts:416-422`; `advanceToDecisionPoint` is a real `ExecutionOptions` field at `kernel/types-core.ts:1648`.
3. `CompiledAgentPreviewConfig` lives at `kernel/types-core.ts:714-718` with current fields `mode`, `phase1?`, `phase1CompletionsPerAction?`. Phase-1 fields stay as currently-supported config (per Spec 145 D1; deletion is out of scope).
4. `selectChoiceOptionsByLegalityPrecedence` exported from `kernel/choice-option-policy.ts:33-48` (legal → unknown → other ordering, matching Spec 145 D4).
5. `selectBestCompletionChooseOneValue` and `buildCompletionChooseCallback` exported from `agents/completion-guidance-choice.ts:43,86` and do not recurse into `chooseDecision` (Spec 145 D10 verified).
6. `MicroturnState.kind` includes `actionSelection` and `stochasticResolve` discriminants (`kernel/microturn/types.ts:29-35`); `seatId` and `turnId` are real fields on `MicroturnState` (lines 281, 285).
7. `kernel/schemas-core.ts:962-963` validates `phase1` and `phase1CompletionsPerAction`; same file is the validation site for the new `completion` / `completionDepthCap` / `topK` fields.
8. Documented retirement of `decision.*` / `option.value` lives at `docs/agent-dsl-cookbook.md:127-144`; the positive recommendation to use `preview.*` refs lands in the "Preview Refs" section (lines 100-125 of the current cookbook).

## Architecture Check

1. **F#1 (Engine Agnosticism)** — driver lives in `agents/`, operates only on kernel-published microturn shapes (`kind`, `seatId`, `turnId`, `legalActions`); contains no game-specific identifiers. Cross-game conformance is proven by `145PREVCOMP-004`.
2. **F#5 (One Rules Protocol)** — driver invokes `applyPublishedDecision` and `publishMicroturn` from the kernel; no alternate legality oracle.
3. **F#8 (Determinism)** — driver is pure under (`def`, `startState`, `trustedMove`, `policy`, `depthCap`, `runtime`); pickers consult only `selectChoiceOptionsByLegalityPrecedence` (greedy) or `selectBestCompletionChooseOneValue` (agentGuided), both deterministic. Determinism witness in `145PREVCOMP-004`.
4. **F#10 (Bounded Computation)** — `K_PREVIEW_DEPTH = 8` and the same-seat fence cap iteration. Loop is iterative, not recursive.
5. **F#11 (Immutability)** — driver threads state through repeated `applyPublishedDecision` calls; `startState` is never mutated. Asserted by unit test in this ticket.
6. **F#12 (Compiler-Kernel Validation Boundary)** — new `preview.completion` / `preview.completionDepthCap` / `preview.topK` fields validated at compile time (string-literal enum + integer bounds) in `cnl/compile-agents.ts` and `cnl/validate-agents.ts`; runtime semantics live in the agent module.
7. **F#15 (Architectural Completeness)** — replaces the `notDecisionComplete` workaround with a complete driver per Spec 145's "single defect, three pointers" framing.
8. **F#19 (Decision-Granularity Uniformity)** — driver consumes microturns sequentially without fabricating a compound shape.

No backwards-compatibility shims introduced. Phase-1 fields remain supported as-is (Spec 145 D1).

## What to Change

### 1. New types in `kernel/types-core.ts`

Add adjacent to `CompiledAgentPreviewConfig`:

```ts
export type AgentPreviewCompletionPolicy = 'greedy' | 'agentGuided';

export interface CompiledAgentPreviewConfig {
  readonly mode: AgentPreviewMode;                          // existing
  readonly completion?: AgentPreviewCompletionPolicy;       // new — default 'greedy'
  readonly completionDepthCap?: number;                     // new — default K_PREVIEW_DEPTH (8)
  readonly topK?: number;                                   // new — default 4 (gate consumed by 145PREVCOMP-002)
  readonly phase1?: boolean;                                // existing — retained, unchanged
  readonly phase1CompletionsPerAction?: number;             // existing — retained, unchanged
}
```

Export `AgentPreviewCompletionPolicy` alongside `AgentPreviewMode`.

### 2. Schema validation in `kernel/schemas-core.ts`

Extend the agent preview schema block at lines ~960-965:

```ts
preview: z.object({
  mode: z.enum(['exactWorld', 'tolerateStochastic', 'disabled']),
  completion: z.enum(['greedy', 'agentGuided']).optional(),
  completionDepthCap: z.number().int().positive().optional(),
  topK: z.number().int().positive().optional(),
  phase1: z.boolean().optional(),
  phase1CompletionsPerAction: z.number().int().positive().optional(),
}),
```

Match the existing field-validation pattern; reject negative or non-integer values for the new bounds per F#12.

### 3. CNL compile + validate

In `cnl/compile-agents.ts` (currently destructures `mode, phase1, phase1CompletionsPerAction` at line 673), add destructuring and validation for `completion`, `completionDepthCap`, `topK`. Apply defaults: `completion = 'greedy'`, `completionDepthCap = 8`, `topK = 4`. Validation errors must use the same diagnostic-code convention as the existing Phase-1 checks at lines 716-732.

In `cnl/validate-agents.ts`, mirror the validation if it operates on raw authored YAML before compile; otherwise note the single-source validation in `compile-agents.ts`.

### 4. Driver and pickers in `agents/policy-preview.ts`

Add the constant and module-private helpers per Spec 145 D2–D4:

```ts
const K_PREVIEW_DEPTH = 8;

function driveSyntheticCompletion(
  def: GameDef,
  startState: GameState,
  trustedMove: TrustedExecutableMove,
  policy: AgentPreviewCompletionPolicy,
  depthCap: number,
  runtime: GameDefRuntime | undefined,
  agentGuidedDeps: AgentGuidedDeps | undefined,
): DriveResult { /* per Spec 145 D3 pseudocode */ }

function pickInnerDecision(
  microturn: MicroturnState,
  policy: AgentPreviewCompletionPolicy,
  agentGuidedDeps: AgentGuidedDeps | undefined,
): PublishedDecision | undefined { /* per Spec 145 D4 */ }

function finalizePreview(result: DriveResult, ...): PreviewOutcome { /* per Spec 145 D5 */ }
```

`DriveResult` is the union from Spec 145 D3 (`completed | stochastic | depthCap | failed`).
`AgentGuidedDeps` is a private interface threading the existing `selectBestCompletionChooseOneValue` / `buildCompletionChooseCallback` references.

### 5. Replace rejection branch in `classifyPreviewCandidate`

At `policy-preview.ts:172-180`, the current condition rejects `pendingAdmissible` with continuation `decision` or `decisionSet`. After this ticket, return `playable` for both — drive happens in `getPreviewOutcome`. Keep the `inadmissible` rejection unchanged. Stochastic continuation continues to flow through `tryApplyPreview`'s RNG-divergence path.

### 6. Replace `tryApplyPreview` call in `getPreviewOutcome`

At `policy-preview.ts:361-392`, replace the `tryApplyPreview(trustedMove)` call with `finalizePreview(driveSyntheticCompletion(...))` per Spec 145 D5. Phase-1 fallback (`representativeTrustedMove`) is preserved verbatim — the driver consumes whichever `trustedMove` is selected.

Cache invariants preserved (D6): cache key remains `candidate.stableMoveKey`; outcome is deterministic given (state, move, policy, depthCap, runtime), all invariant within one preview-runtime instance.

### 7. New `PreviewOutcome` reasons

Add `'depthCap'` and `'noPreviewDecision'` to `PolicyPreviewUnavailabilityReason`. (`'gated'` is added in `145PREVCOMP-002`.)

### 8. Cookbook update

In `docs/agent-dsl-cookbook.md`, "Preview Refs" section (currently lines 100-125), add a positive recommendation paragraph: `preview.*` refs now resolve via the bounded synthetic-completion driver for action-selection candidates by default. Cross-link to "Retired For New Production Profiles" so readers do not fall back to retired refs.

### 9. Driver unit tests

Per Spec 145 §Testing, attach all driver-behavior unit tests to this ticket:
- **Boundedness**: depthCap=2 forces `depthCap` outcome on FITL March; depthCap=8 admits Govern, March, Train, Sweep, Assault.
- **Same-seat fence**: candidate granting a free operation to another seat stops driver at the seat boundary.
- **Stochastic surfacing**: candidate with inner stochastic microturn returns `kind: 'stochastic'`.
- **Cache hit determinism**: two `getPreviewOutcome` calls on same candidate within one runtime instance return same outcome; second call hits cache.
- **F#11 input-state immutability**: `startState.stateHash === preDriveStateHash` after driver returns.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `docs/agent-dsl-cookbook.md` (modify)
- `packages/engine/test/unit/agents/policy-preview-driver.test.ts` (new — driver unit tests)

## Out of Scope

- Top-K gate behavior in `policy-evaluation-core.ts` — covered by `145PREVCOMP-002`.
- Profile audit and golden re-bless — covered by `145PREVCOMP-003`.
- Cross-game integration test — covered by `145PREVCOMP-004`.
- Trace diagnostics extensions (`previewDriveDepth`, `previewGatedCount`) — covered by `145PREVCOMP-005`.
- Performance harness — covered by `145PREVCOMP-006`.
- Phase-1 plumbing deletion — explicitly Out of Scope per Spec 145 D1; would require its own spec.
- Default-policy switch from `greedy` to `agentGuided` — Spec 145 §Out Of Scope, deferred to empirical evaluation.

## Outcome (2026-04-25)

Implemented the bounded synthetic-completion preview driver and config surface:

- `classifyPreviewCandidate` now treats admissible pending `decision` / `decisionSet` continuations as playable instead of rejecting them as `notDecisionComplete`.
- `policy-preview.ts` now drives same-seat, same-turn inner `chooseOne` / `chooseNStep` microturns with bounded `greedy` or `agentGuided` completion, stops at stochastic boundaries without sampling, stops at other-seat / action-selection boundaries, and reports `depthCap` / `noPreviewDecision` preview reasons.
- The driver preserves the existing preview cache lifetime and now has synthetic unit coverage for depth cap, bounded chooseOne / chooseN completion, same-seat fence behavior, stochastic surfacing, cache reuse, and input-state immutability.
- `preview.completion`, `preview.completionDepthCap`, and `preview.topK` now compile into `CompiledAgentPreviewConfig` with defaults (`greedy`, `8`, `4`) and positive-integer / enum diagnostics. `topK` behavior remains deferred to `145PREVCOMP-002`; this ticket only validates and threads the field.
- `packages/engine/schemas/GameDef.schema.json` was regenerated for the compiled agent preview schema, and `Trace.schema.json` was regenerated for the new preview outcome reasons. `EvalReport.schema.json` was stable under the generator.
- `docs/agent-dsl-cookbook.md` now recommends bounded `preview.*` refs for action-selection projections instead of retired completion refs.

Live seam correction: the ticket pseudocode described the first driver step as a direct `applyMove(..., advanceToDecisionPoint: true)`. Current live action-selection microturns are authoritatively advanced by `applyPublishedDecision`; `applyTrustedMove` can still fail for incomplete action headers. The implementation preserves the existing `applyMove` dependency hook, then falls back to `applyPublishedDecision` for decision-backed action-selection candidates so the driver stays aligned with Foundations #5 and #19.

Review correction: the original ticket also named a production-backed FITL boundedness matrix (`March` with depthCap=2, and `Govern` / `March` / `Train` / `Sweep` / `Assault` with depthCap=8). This implementation did not land that production FITL matrix; it landed synthetic driver-internal coverage only. The production-backed FITL matrix is now explicitly owned by `tickets/145PREVCOMP-004.md`, alongside the cross-game conformance witness that already uses real FITL and Texas Hold'em action-selection microturns.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine schema:artifacts:check`
- `node --test dist/test/unit/agents/policy-preview-driver.test.js dist/test/unit/compile-agents-authoring.test.js`
- `pnpm -F @ludoforge/engine schema:artifacts`
- `pnpm -F @ludoforge/engine test:unit`
- `pnpm turbo lint`
- `pnpm turbo typecheck`

## Acceptance Criteria

### Tests That Must Pass

1. New driver unit tests in `packages/engine/test/unit/agents/policy-preview-driver.test.ts` (boundedness, fence, stochastic, cache, immutability) — all green.
2. Existing `policy-preview` test paths continue to pass; in particular, `complete` candidates still flow through unchanged behavior, and `inadmissible` candidates still reject.
3. `pnpm -F @ludoforge/engine test:unit` — full unit suite green (modulo intentional re-bless landing in `145PREVCOMP-003`).
4. `pnpm turbo lint` and `pnpm turbo typecheck` green.

### Invariants

1. `startState` is never mutated by `driveSyntheticCompletion` (input-state immutability — F#11).
2. Driver returns within `depthCap` iterations; no general recursion (F#10).
3. `pickInnerDecision` contains no game-specific identifiers (F#1; verified by inspection — full cross-game conformance landed in `145PREVCOMP-004`).
4. `preview.completion`, `preview.completionDepthCap`, `preview.topK` fields are validated at compile time; invalid values fail compilation with a CNL diagnostic (F#12).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-driver.test.ts` (new) — driver behavior matrix per §What to Change item 9. `@test-class: architectural-invariant` for boundedness, fence, immutability, cache; `@test-class: convergence-witness` only if a specific FITL trajectory is required for stochastic surfacing.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
5. `pnpm turbo test --force` (full suite at the end of the wave; expected failures from existing fixtures are addressed in `145PREVCOMP-003`)
