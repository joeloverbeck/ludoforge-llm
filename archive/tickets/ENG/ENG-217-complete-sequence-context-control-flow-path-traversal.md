# ENG-217: Complete Sequence-Context Control-Flow Path Traversal

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect traversal utility, GameDef validation, sequence-context diagnostics
**Deps**: archive/tickets/ENG/ENG-205-sequence-context-linkage-validation.md, archive/tickets/ENG/ENG-216-path-sensitive-sequence-context-linkage-validation.md, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/effects-control.ts, packages/engine/src/kernel/effects-subset.ts

## Problem

The path-sensitive sequence-context validator still mis-models two control-flow surfaces:

1. `forEach.effects` is traversed for grant presence but its resulting path state is discarded, so same-iteration loop-body linkages can be missed.
2. `evaluateSubset.compute` is also traversed for grant presence even though runtime discards its state after scoring each subset, so the validator currently treats a non-persistent scope as if it could contribute to later linkage.

## Assumption Reassessment (2026-03-09)

1. Runtime executes `forEach.effects` once per matched item, mutating state across iterations; `forEach.in` runs only after the loop and only when both `countBind` and `in` are present. Because the loop may execute zero iterations, captures created only inside `forEach.effects` are not guaranteed to exist for `forEach.in` or later sibling effects.
2. Runtime executes `evaluateSubset.compute` while scoring each candidate subset, but the resulting state is used only for score evaluation within that candidate and is not threaded into `evaluateSubset.in` or later effects. Sequence-context grants issued there are therefore not persistent runtime state.
3. `effect-grant-sequence-context-paths.ts` currently detects sequence-context grants under both surfaces but discards returned path state for `forEach.effects` and `evaluateSubset.compute`. The validator should model only persistent execution paths and reject unsupported grant placement explicitly where persistence does not exist.

## Architecture Check

1. A single, explicit rule for how each control-flow effect contributes to persistent sequence-context linkage is cleaner than ad hoc partial recursion.
2. The fix stays entirely in generic effect/control-flow semantics; no game-specific identifiers or per-game exceptions leak into `GameDef`, validation, or simulation.
3. No backwards-compatibility shim is needed; the validator should have one canonical path model that matches current runtime execution, even if existing specs that relied on partial traversal begin failing.

## What to Change

### 1. Model `forEach` using persistent runtime paths only

Update `collectEffectGrantSequenceContextExecutionPaths` so `forEach.effects` contributes path state for the loop-body execution path, while preserving a separate zero-iteration continuation path. Do not blindly thread loop-body captures into `forEach.in` or later continuations as if at least one iteration were guaranteed.

### 2. Reject sequence-context grants inside `evaluateSubset.compute`

`grantFreeOperation` with `sequenceContext` inside `evaluateSubset.compute` should be illegal and produce a deterministic validation diagnostic, because runtime does not persist those grants beyond subset scoring.

Do not leave `evaluateSubset.compute` partially traversed or silently accepted.

### 3. Add regression coverage for missed control-flow forms

Add targeted validation tests that fail on the current implementation and prove the corrected control-flow semantics. Include:
- one valid same-path case inside `forEach.effects`
- one invalid continuation case that depends on loop-body capture after the loop
- one invalid `evaluateSubset.compute` placement case

## Files to Touch

- `packages/engine/src/kernel/effect-grant-sequence-context-paths.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify only if a runtime-facing regression remains insufficiently covered by unit validation)

## Out of Scope

- Mandatory completion/outcome contracts from `tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md`
- Ia Drang data re-encoding from `tickets/ENG-204-ia-drang-reencode-on-grant-contracts.md`
- Visual presentation or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. A capture and require on the same `forEach.effects` execution path validate successfully.
2. A `forEach.in` or later continuation cannot rely on a capture that exists only in `forEach.effects`, because zero-iteration execution remains possible.
3. A sequence-context grant inside `evaluateSubset.compute` is rejected deterministically.
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

### Invariants

1. Sequence-context linkage validation matches generic runtime control-flow ordering for supported persistent effect nodes.
2. `GameDef` validation remains game-agnostic; all game-specific behavior stays in `GameSpecDoc` data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add loop/subset sequence-context regression cases that pin persistent-path semantics.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add coverage only if a runtime boundary case remains meaningful after the validator rules are tightened.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Outcome amended: 2026-03-09
- Completion date: 2026-03-09
- What actually changed:
  - Reassessed the ticket against runtime semantics and corrected the ticket before implementation.
  - Updated effect-path traversal so `forEach.effects` contributes a loop-body path while preserving the zero-iteration continuation path.
  - Stopped treating `evaluateSubset.compute` as a persistent sequence-context linkage source.
  - Added a sequence-context-specific diagnostic that rejects `grantFreeOperation.sequenceContext` anywhere under `evaluateSubset.compute`.
  - Refactored event-card behavior validation so event `playCondition`, side/branch/target/lasting effect lists, and event `freeOperationGrants` all run through the same generic validator path used by setup/actions/triggers.
  - Added unit regression coverage for loop-body success, loop-continuation failure, unsupported `evaluateSubset.compute` placement, event-card effect validation, event-card `playCondition`, nested branch target effects, and event `freeOperationGrants`.
- Deviations from original plan:
  - Did not make `evaluateSubset.compute` participate in linkage; runtime discards compute-state grants, so the cleaner architecture is to reject that placement.
  - Did not add an integration test because the bug and the new invariant are fully exercised at the validator boundary, and the existing full engine suite already covers runtime stability.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
  - `node --test packages/engine/dist/test/unit/lint/condition-surface-validator-callsites-policy.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
