# 15GAMAGEPOLIR-014: Make Policy `metric.*` Refs Executable Through Generic Runtime Contracts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — shared derived-metric contracts, policy runtime, compiler/runtime tests
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-003-add-policy-expression-dsl-typechecking-and-dag-validation.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md

## Problem

Spec 15 allows `metric.<id>` and `preview.metric.<id>` policy refs, but the current runtime cannot execute them generically. The compiler accepts those refs, while the non-preview evaluator currently has to reject them because `DerivedMetricDef` does not yet carry enough shared execution metadata for all supported metric computations. Leaving that split in place will push policy authoring toward ad hoc workarounds and game-specific runtime leakage.

## Assumption Reassessment (2026-03-19)

1. `compile-agents.ts` currently accepts `metric.*` and `preview.metric.*` as policy-visible refs, so the authored surface already promises those capabilities.
2. The current shared `DerivedMetricDef` / `derived-values.ts` contract is not yet sufficient to execute every declared metric generically from compiled data alone; some computations still rely on runtime assumptions not owned by the contract itself.
3. Existing active tickets cover preview, `PolicyAgent`, authored baseline policies, and regression suites, but none explicitly own the prerequisite work of making `metric.*` executable as a first-class generic runtime surface.
4. Corrected scope: this ticket should strengthen the shared metric runtime contract and evaluator integration so policy-visible metric refs are executable generically. It should not author FITL/Texas metrics itself or hide the gap behind per-game branches.

## Architecture Check

1. Fixing the shared metric contract is cleaner than teaching the policy evaluator bespoke knowledge of FITL support pressure, Hold'em hand proxies, or any other game-specific metric semantics.
2. This keeps game-specific metric definitions in `GameSpecDoc` and compiled `GameDef` data, while keeping metric execution in the agnostic kernel/runtime layer.
3. A metric ref accepted by the compiler must either be executable through shared contracts or be rejected at compile time. That single-source ownership is more robust than runtime fallbacks or silent `unknown`.
4. No backwards-compatibility aliases, legacy metric execution paths, or game-specific runtime branches should be introduced.

## What to Change

### 1. Strengthen the compiled metric execution contract

Extend the shared compiled metric/runtime contract so every policy-visible metric can be evaluated generically from compiled `GameDef` data.

This may require:

- enriching `DerivedMetricDef` with the missing generic execution inputs
- moving currently implicit metric execution assumptions into explicit compiled data
- making sure the same contract supports both current-state `metric.*` and preview-state `preview.metric.*`

### 2. Align compiler and runtime ownership of policy metric refs

Make the policy compiler/runtime boundary coherent:

- if a metric ref is accepted at compile time, it must be executable through the shared runtime contract
- if some metric shape cannot yet be executed generically, the compiler must reject it deterministically instead of letting runtime discover the gap ad hoc

### 3. Integrate policy evaluator support for `metric.*`

Update the policy runtime so:

- `metric.<id>` resolves through the strengthened generic metric runtime
- later preview work can reuse the same contract for `preview.metric.<id>`
- failure/diagnostic paths remain structured and deterministic

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify if metric contract shape changes)
- `packages/engine/src/kernel/derived-values.ts` (modify)
- `packages/engine/src/cnl/compile-lowering.ts` (modify if compiled metric shape changes)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/derived-values.test.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify if preview metric support lands in the same shared contract slice)

## Out of Scope

- authored FITL/Texas metric content
- preview masking policy itself beyond what is required for `preview.metric.*` contract ownership
- `PolicyAgent` wiring and trace formatting
- runner or CLI changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-eval.test.ts` proves `metric.<id>` refs execute through the generic runtime contract rather than failing as unsupported runtime refs.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves policy metric refs are either accepted with a runtime-executable compiled contract or rejected deterministically at compile time when unsupported.
3. `packages/engine/test/unit/derived-values.test.ts` proves the strengthened compiled metric contract evaluates without game-specific branches.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Policy-visible `metric.*` refs are owned by one coherent generic contract from compilation through runtime execution.
2. Game-specific metric semantics remain authored in `GameSpecDoc`/compiled data, not hardcoded into evaluator/kernel branches.
3. `preview.metric.*` and `metric.*` share the same underlying compiled execution ownership instead of diverging into separate bespoke paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — runtime execution of policy metric refs through the generic contract.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` — compiler/runtime ownership parity for policy metric refs.
3. `packages/engine/test/unit/derived-values.test.ts` — strengthened metric execution contract coverage.

### Commands

1. `pnpm -C packages/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/derived-values.test.js`
3. `pnpm -C packages/engine test`
4. `pnpm run check:ticket-deps`
