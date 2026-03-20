# 15GAMAGEPOLIR-014: Make Policy `metric.*` Refs Executable Through Generic Runtime Contracts

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — shared derived-metric contracts, policy runtime, compiler/runtime tests
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-003-add-policy-expression-dsl-typechecking-and-dag-validation.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md

## Problem

Spec 15 allows `metric.<id>` and `preview.metric.<id>` policy refs, but the current runtime cannot execute them generically. The compiler accepts those refs, while the non-preview evaluator currently has to reject them because `DerivedMetricDef` does not yet carry enough shared execution metadata for all supported metric computations. Leaving that split in place will push policy authoring toward ad hoc workarounds and game-specific runtime leakage.

## Assumption Reassessment (2026-03-19)

1. `compile-agents.ts` currently accepts `metric.*` and `preview.metric.*` as policy-visible refs, so the authored surface already promises those capabilities.
2. The current shared `GameSpecDerivedMetricDef` / `DerivedMetricDef` contract is not yet sufficient to execute every declared metric generically from compiled data alone; today it mostly captures validation requirements and zone filtering, while some computations still depend on runtime inputs that are not owned by the authored or compiled contract itself.
3. `policy-eval.ts` still rejects `metric.*` at runtime with `UNSUPPORTED_RUNTIME_REF`, so the runtime gap remains real.
4. There is also a compiler/runtime parity gap: policy refs currently accept any `metric.<id>` string without deterministic compile-time validation that the referenced metric id exists after manual and synthesized metrics are merged.
5. Existing active tickets cover preview, `PolicyAgent`, authored baseline policies, and regression suites, but none explicitly own the prerequisite work of making `metric.*` executable and compile-time validated as a first-class generic runtime surface.
6. Corrected scope: this ticket should strengthen the derived-metric authoring + runtime contract and evaluator integration so current-state policy-visible metric refs are executable generically and metric ids are validated deterministically at compile time. It should not author FITL/Texas metrics itself or hide the gap behind per-game branches.

## Architecture Check

1. Fixing the shared metric contract is cleaner than teaching the policy evaluator bespoke knowledge of FITL support pressure, Hold'em hand proxies, or any other game-specific metric semantics.
2. This keeps game-specific metric definitions in `GameSpecDoc` and compiled `GameDef` data, while keeping metric execution in the agnostic kernel/runtime layer.
3. The clean fix is to make `DerivedMetricDef` executable data rather than teaching `policy-eval.ts` how to reconstruct hidden computation inputs or layering on policy-only metric branches.
4. A metric ref accepted by the compiler must either resolve to a known merged metric id with an executable shared contract or be rejected at compile time. That single-source ownership is more robust than runtime fallbacks or silent `unknown`.
5. No backwards-compatibility aliases, legacy metric execution paths, or game-specific runtime branches should be introduced.

## What to Change

### 1. Strengthen the compiled metric execution contract

Extend the authored and compiled derived-metric contract so every supported policy-visible metric can be evaluated generically from compiled `GameDef` data.

This may require:

- enriching `GameSpecDerivedMetricDef` so authored metrics can declare the generic execution inputs their computation requires
- enriching `DerivedMetricDef` with the missing generic execution inputs
- moving currently implicit metric execution assumptions into explicit compiled data
- extracting a reusable metric resolver that can later be reused by both current-state `metric.*` and preview-state `preview.metric.*`

### 2. Align compiler and runtime ownership of policy metric refs

Make the policy compiler/runtime boundary coherent:

- if a policy references `metric.<id>`, the compiler must validate that `<id>` exists in the merged derived-metric catalog visible in the compiled `GameDef`
- if a metric ref is accepted at compile time, it must be executable through the shared runtime contract
- if some metric shape cannot yet be executed generically, compilation must fail deterministically instead of letting runtime discover the gap ad hoc

### 3. Integrate policy evaluator support for `metric.*`

Update the policy runtime so:

- `metric.<id>` resolves through the strengthened generic metric runtime
- the resolver surface is extracted cleanly enough that later preview work can reuse it for `preview.metric.<id>` without forking metric semantics
- failure/diagnostic paths remain structured and deterministic

## Files to Touch

 - `packages/engine/src/cnl/game-spec-doc.ts` (modify)
 - `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify if metric contract shape changes)
- `packages/engine/src/kernel/derived-values.ts` (modify)
 - `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compile-lowering.ts` (modify if compiled metric shape changes)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
 - `packages/engine/test/unit/compile-top-level.test.ts` (modify)
 - `packages/engine/test/unit/validate-spec.test.ts` (modify if authored metric shape changes)
- `packages/engine/test/unit/derived-values.test.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)

## Out of Scope

- authored FITL/Texas metric content
- full preview-state metric execution and preview masking policy beyond what is required to keep shared metric ownership reusable
- `PolicyAgent` wiring and trace formatting
- runner or CLI changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-eval.test.ts` proves `metric.<id>` refs execute through the generic runtime contract rather than failing as unsupported runtime refs.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves policy metric refs are rejected deterministically when the referenced metric id does not exist in the merged derived-metric catalog.
3. `packages/engine/test/unit/compile-top-level.test.ts` proves the strengthened derived-metric authoring shape lowers into executable compiled metric data.
4. `packages/engine/test/unit/derived-values.test.ts` proves the strengthened compiled metric contract evaluates without game-specific branches.
5. `packages/engine/test/unit/validate-spec.test.ts` covers any new authored derived-metric validation rules introduced by the executable contract shape.
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Policy-visible `metric.*` refs are owned by one coherent generic contract from compilation through runtime execution.
2. Game-specific metric semantics remain authored in `GameSpecDoc`/compiled data, not hardcoded into evaluator/kernel branches.
3. `preview.metric.*` and `metric.*` share the same underlying compiled metric ownership even if preview execution itself remains for a later ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — runtime execution of policy metric refs through the generic contract.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` — compiler rejection for unknown `metric.<id>` refs after merged metric catalog resolution.
3. `packages/engine/test/unit/compile-top-level.test.ts` — lowering coverage for executable derived-metric contract data.
4. `packages/engine/test/unit/derived-values.test.ts` — strengthened metric execution contract coverage.
5. `packages/engine/test/unit/validate-spec.test.ts` — authored derived-metric validation coverage if the shape changes.

### Commands

1. `pnpm -C packages/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/compile-top-level.test.js packages/engine/dist/test/unit/derived-values.test.js`
3. `pnpm -C packages/engine test`
4. `pnpm -C packages/engine lint`
5. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What changed:
  - `derivedMetrics` now carry executable runtime data in both authored and compiled forms.
  - the kernel exposes a shared generic metric resolver, and `policy-eval` now executes `metric.<id>` through that resolver instead of failing with `UNSUPPORTED_RUNTIME_REF`.
  - policy compilation now rejects unknown authored metric ids deterministically.
  - synthesized victory metrics now include executable runtime payloads keyed by execution shape rather than computation-only placeholders.
  - schema artifacts were regenerated to match the strengthened `GameDef` contract.
- Deviations from original plan:
  - compile-time policy metric validation was intentionally scoped to authored `derivedMetrics` ids rather than exposing synthesized victory metric ids as a stable author-facing policy API.
  - full `preview.metric.*` execution was not implemented; the shared resolver was extracted so later preview work can reuse the same metric semantics cleanly.
- Verification:
  - `pnpm -C packages/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/compile-top-level.test.js packages/engine/dist/test/unit/derived-values.test.js packages/engine/dist/test/unit/validate-spec.test.js packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/cnl/synthesize-derived-metrics.test.js`
  - `pnpm -C packages/engine lint`
  - `pnpm -C packages/engine test`
  - `pnpm run check:ticket-deps`
