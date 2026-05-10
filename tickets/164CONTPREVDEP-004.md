# 164CONTPREVDEP-004: Deep-pass driver, trigger evaluation, state handoff, per-phase coverage, ARVN witness

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new module `policy-preview-inner-deepening.ts`, modifications to `policy-agent-inner-preview.ts`, `policy-preview-inner.ts`, `policy-eval.ts`, plus the advisory shape extension in `policy-evaluation-core.ts`
**Deps**: `archive/tickets/164CONTPREVDEP-003.md`

## Problem

After Tickets 001–003, the strategy dispatch seam exists and `continuedDeepening` profiles compile cleanly, but the `continuedDeepening` branch is still a no-op fallthrough. This ticket lands the actual feature:

- A new deep-pass driver consuming the broad pass's `DriveResult[]` and re-driving each root option with the incremental `Dd − Db` budget.
- Trigger evaluation (`allRequestedRefsDepthCapped`, `allReadyValuesUniform`) — deterministic, OR'd, evaluated per-microturn after the broad pass.
- Per-phase coverage rollup (`PolicyPreviewCoverage.broad` / `.deep`).
- The `unavailabilityBreakdown.afterDeepPass` field on the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory.
- Foundation #20 preservation: refs that remain `unavailable` after both phases continue to flow through the existing `unknownPreviewRefs` machinery.
- Convergence witness `@witness: spec-164-arvn-seed-1000-deep` proving that ARVN seed 1000 produces ready signal at deeply-nested chooseN ladders under `deep1024 + continuedDeepening`.

This is Phase 3 of the spec (§9), the load-bearing implementation phase.

## Assumption Reassessment (2026-05-09)

1. `DriveResult.state: GameState` (`policy-preview-inner.ts:198-205`) is the post-broad checkpoint suitable for resumption. Verified by reassessment.
2. `driveOption` (`policy-preview-inner.ts:318-422`) accepts an arbitrary `GameState` checkpoint; the deep driver passes `DriveResult.state` as starting state with no replay machinery.
3. `unknownPreviewRefs` tracking lives at `policy-evaluation-core.ts:1290-1311` (`resolvePreviewOptionRef`) with additional sites at lines 1595, 1648, 1654. Deep-pass `unavailable` statuses feed the same path.
4. `PolicyPreviewCoverage` lives at `policy-eval.ts:199-206`. The `broad`/`deep` blocks attach here; `PolicyPreviewPhaseCoverage` was added in Ticket 002.
5. The single ARVN witness (`spec-162-arvn-seed-1000-witness.test.ts:21`) records `EXPECTED_DEPTH_CAP_COUNTS = [8, 7, 5, 4]` — four affected decisions. The deep witness in this ticket asserts at least N of those four produce ready signal under deepening; N is empirically pinned during implementation.

## Architecture Check

1. **State handoff is mechanical (F#15)**: The deep driver re-invokes the existing `driveOption` with `DriveResult.state` as input — no new replay machinery, no state-snapshot infrastructure, no kernel changes. The driver's ability to accept arbitrary starting state is exactly the integration point the spec exploits.
2. **Foundation #20 preserved verbatim**: Refs that remain `unavailable` after both phases produce identical omitted-contribution behavior. Deep evidence is additive — `ready` status from the deep phase is consumed normally; the trace records phase provenance via per-phase coverage but selection reasons are uniform across strategies.
3. **Determinism preserved (F#8)**: Trigger evaluation consumes only `PreviewOptionRefStatus` maps and ref-id lists; no RNG, no observer ambiguity. State handoff is bit-deterministic. Replay-twice tests prove identity.
4. **Bounded computation (F#10)**: The deep driver consumes only the incremental `Dd − Db` budget per root option, never re-traversing broad steps. Total decisions traversed equal `broadDepth + (Dd − Db)`, not `broadDepth + Dd`.
5. **Engine-agnostic (F#1)**: All deep-driver code uses generic terms (`DriveResult`, `GameState`, `PreviewOptionRefStatus`) — no FITL or game-specific identifiers in the new module.

## What to Change

### 1. New module `policy-preview-inner-deepening.ts`

Create `packages/engine/src/agents/policy-preview-inner-deepening.ts`. Contents:

- Function `runDeepPass(broadRun, deepConfig, ...)` that:
  1. Iterates over the broad pass's per-root `DriveResult[]`.
  2. Evaluates the configured triggers against the broad results (see step 2 below).
  3. If no trigger fires: returns the broad run unchanged (fast path).
  4. If a trigger fires: invokes the inner driver (`driveOption` from `policy-preview-inner.ts`) per root option with `DriveResult.state` as input and `depthCap = Dd − Db` additional steps.
  5. Merges results: per-root `DriveResult` with deeper `state`, deeper `depth` (normalized to absolute = `Db + deepDepth`), and union of `syntheticDecisions`.
- Returns the merged run; downstream ref resolution runs against the merged result exactly as today.

The module exposes one public function. No exports outside what the creator function calls.

### 2. Trigger evaluation

In the same module, implement:

- `allRequestedRefsDepthCapped`: every requested `preview.option.*` ref across every broad-driven root option resolved to `unavailable` with reason `depthCap`.
- `allReadyValuesUniform`: every requested ref across every root option resolved to `ready` with identical values.

Triggers are OR'd. Evaluation is deterministic (consumes only the broad pass's resolved-ref maps).

### 3. Wire deep dispatch into the creator

In `packages/engine/src/agents/policy-agent-inner-preview.ts:222-256`, replace the no-op `continuedDeepening` branch (Ticket 003) with a call into `runDeepPass`. After the broad run returns, evaluate triggers; if fired, run the deep pass; populate the resulting `PolicyAgentInnerPreview` from the merged run.

The `chooseFrontierDecision` function (`policy-agent.ts:543`) remains unchanged.

### 4. Per-phase coverage rollup

Extend `PolicyPreviewCoverage` (`policy-eval.ts:199-206`) per spec §5.5:

```ts
type PolicyPreviewCoverage = {
  // existing fields unchanged
  readonly strategy: 'singlePass' | 'continuedDeepening';   // NEW
  readonly capClass: 'standard256' | 'deep1024';            // NEW
  readonly broad?: PolicyPreviewPhaseCoverage;              // NEW; iff continuedDeepening
  readonly deep?: PolicyPreviewPhaseCoverage;               // NEW; iff deep pass actually ran
};
```

`PolicyPreviewPhaseCoverage` was defined in Ticket 002. Populate the per-phase counters where the existing top-level fields are computed (in `policy-preview-inner.ts` or wherever the per-microturn coverage roll-up happens).

The existing top-level fields continue to summarize the *final merged* coverage.

### 5. Advisory `unavailabilityBreakdown.afterDeepPass`

Extend the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory shape with an additive `unavailabilityBreakdown.afterDeepPass: number` counting roots that remained `unavailable` after the deep pass. The advisory still fires iff every root remained unavailable after every executed phase.

### 6. Foundation #20 preservation

The deep driver feeds `unavailable` statuses through the existing `unknownPreviewRefs` machinery (`policy-evaluation-core.ts:1290-1311`). No special handling for "this came from deep" — the consideration's contribution is computed from the merged ref status. `selectionReason` variants `tiebreakAfterPreviewNoSignal` and `fallbackExplicit` apply uniformly.

### 7. Architectural-invariant tests

- `continued-deepening-cost-bounded.test.ts` — property test across the cap-class table: for every `(M, B, Db, Dd)` tuple that compiles, `totalCost ≤ CAP_CLASS_BUDGETS[capClass]` AND no integer overflow.
- `continued-deepening-foundation20-preserved.test.ts` — replays Spec 162's `preview-unavailable-not-silently-zero` harness with `strategy: continuedDeepening`. Refs unavailable after both phases produce identical omitted-contribution behavior.
- `continued-deepening-trigger-determinism.test.ts` — replay-twice harness; trigger evaluation yields identical results; merged trace is byte-identical.
- `continued-deepening-state-handoff.test.ts` — synthetic chooseN ladder asserting total decisions traversed equal `broadDepth + (Dd − Db)`.
- `cap-class-recorded-in-artifact.test.ts` — compiled profile carries `previewInner.capClass`; reproducibility-metadata serialization includes it. (Builds on Ticket 002's lowering.)
- `per-phase-coverage-rollup.test.ts` — `coverage.broad` and `coverage.deep` round-trip; broad-only run produces no `deep` block; both-fired run produces both blocks summing to the merged top-level fields.

### 8. Convergence-witness test

`arvn-seed-1000-deep-recovery.test.ts` under `packages/engine/test/policy-profile-quality/`:

- Header: `// @test-class: convergence-witness`, `// @witness: spec-164-arvn-seed-1000-deep`.
- Compiles the FITL ARVN production spec with the `arvn-evolved` profile mutated to `strategy: continuedDeepening, capClass: deep1024, broad.depthCap: 4, deep.depthCap: 16`.
- Replays seed 1000 twice; asserts byte-identity.
- Filters to the four chooseNStep decisions matching the Spec 162 witness shape.
- Asserts at least N of them produce `ready` signal (`outcomeBreakdown.unknownDepthCap === 0` for those decisions). N is pinned during implementation against actual deep-pass results.
- Includes the `// Distillation evaluation` comment per spec §10.1: this witness is profile-specific by construction and CANNOT be distilled into an architectural invariant; if a future kernel evolution shifts the trajectory, retarget the witness rather than soften it.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (new) — deep-pass driver and trigger evaluation.
- `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify) — wire `runDeepPass` into the `continuedDeepening` branch (replaces the Ticket-003 no-op).
- `packages/engine/src/agents/policy-preview-inner.ts` (modify) — per-microturn coverage roll-up gains the per-phase counters.
- `packages/engine/src/agents/policy-eval.ts` (modify) — extend `PolicyPreviewCoverage` with `strategy`, `capClass`, optional `broad`, optional `deep`.
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — extend the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory shape with `afterDeepPass`.
- `packages/engine/test/architecture/preview-deepening/continued-deepening-cost-bounded.test.ts` (new)
- `packages/engine/test/architecture/preview-deepening/continued-deepening-foundation20-preserved.test.ts` (new)
- `packages/engine/test/architecture/preview-deepening/continued-deepening-trigger-determinism.test.ts` (new)
- `packages/engine/test/architecture/preview-deepening/continued-deepening-state-handoff.test.ts` (new)
- `packages/engine/test/architecture/preview-deepening/cap-class-recorded-in-artifact.test.ts` (new)
- `packages/engine/test/architecture/preview-deepening/per-phase-coverage-rollup.test.ts` (new)
- `packages/engine/test/policy-profile-quality/arvn-seed-1000-deep-recovery.test.ts` (new) — convergence-witness.

## Out of Scope

- Cookbook documentation (Ticket 005).
- Benchmark sweep across FITL/Texas Hold'em (Ticket 005).
- E2E fixture profile (Ticket 005).
- Default change for any existing profile to `deep1024` — explicitly out per spec §3 and §15.
- `topK` rootPolicy — deferred per spec §13 Open Question 3.
- `partial.*` ref family — explicitly disallowed per spec §3.

## Acceptance Criteria

### Tests That Must Pass

1. All six new architectural-invariant tests in `test/architecture/preview-deepening/` pass.
2. New convergence-witness `arvn-seed-1000-deep-recovery.test.ts` passes with N pinned empirically.
3. Spec 162's `spec-162-arvn-seed-1000-witness.test.ts` continues to pass — F#20 enforcement is preserved.
4. `continued-deepening-singlepass-unchanged.test.ts` (Ticket 003) continues to pass — `singlePass` profiles still byte-identical.
5. Existing engine suite: `pnpm -F @ludoforge/engine test`.
6. `pnpm turbo typecheck && pnpm turbo lint`.

### Invariants

1. **F#8 (determinism)**: replay-twice produces byte-identical merged traces under `continuedDeepening`.
2. **F#10 (bounded)**: `totalCost ≤ CAP_CLASS_BUDGETS[capClass]` for every `(M, B, Db, Dd)` tuple that compiles.
3. **F#11 (immutability)**: `DriveResult.state` is a fresh `GameState`; deep pass never mutates the broad-pass state.
4. **F#15 (architectural completeness)**: deep recovery is achieved without compromising integrity (F#20).
5. **F#20 (preview signal integrity)**: refs unavailable after both phases produce identical omitted-contribution behavior; `previewFallback` requirement still fires; `tiebreakAfterPreviewNoSignal` still classifies correctly.
6. **State handoff is mechanical**: total decisions traversed equal `broadDepth + (Dd − Db)`, not `broadDepth + Dd`.
7. **No game-specific identifier in `policy-preview-inner-deepening.ts`** — engine-agnosticism (F#1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-deepening/continued-deepening-cost-bounded.test.ts` — architectural-invariant; F#10.
2. `packages/engine/test/architecture/preview-deepening/continued-deepening-foundation20-preserved.test.ts` — architectural-invariant; F#20.
3. `packages/engine/test/architecture/preview-deepening/continued-deepening-trigger-determinism.test.ts` — architectural-invariant; F#8.
4. `packages/engine/test/architecture/preview-deepening/continued-deepening-state-handoff.test.ts` — architectural-invariant; bounded computation accounting.
5. `packages/engine/test/architecture/preview-deepening/cap-class-recorded-in-artifact.test.ts` — architectural-invariant; F#10 amendment + F#13.
6. `packages/engine/test/architecture/preview-deepening/per-phase-coverage-rollup.test.ts` — architectural-invariant; coverage shape.
7. `packages/engine/test/policy-profile-quality/arvn-seed-1000-deep-recovery.test.ts` — convergence-witness; profile-specific deep-recovery rate. Headers: `// @test-class: convergence-witness`, `// @witness: spec-164-arvn-seed-1000-deep`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/preview-deepening/`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/arvn-seed-1000-deep-recovery.test.js`
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js`
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
