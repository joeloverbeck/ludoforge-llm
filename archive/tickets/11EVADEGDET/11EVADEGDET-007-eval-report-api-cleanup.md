# 11EVADEGDET-007: Narrow generateEvalReport API to gameDefId

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — evaluator API signature, dependent specs/docs/tests
**Deps**: archive/specs/11-evaluator-degeneracy-detection.md, specs/12-cli.md, specs/14-evolution-pipeline.md, archive/tickets/11EVADEGDET/11EVADEGDET-005-aggregation.md, archive/tickets/11EVADEGDET/11EVADEGDET-006-evaluator-integration-golden-and-sim-surface.md

## Problem

`generateEvalReport` currently accepts a full `GameDef` but only reads `def.metadata.id`. That is unnecessary coupling between the aggregate evaluator layer and full compiled game definitions. The API should reflect the actual dependency: report generation needs a `gameDefId` string plus traces, not the entire definition object.

## Assumption Reassessment (2026-03-29)

1. `generateEvalReport` is currently implemented in `packages/engine/src/sim/eval-report.ts` and exported via `packages/engine/src/sim/index.ts`.
2. The current implementation reads only `def.metadata.id`; it does not inspect any other `GameDef` fields.
3. The current public signature comes from Spec 11 rather than an implementation necessity. This is a spec-driven mismatch, not a runtime-driven one.
4. There are still no production runtime call sites for `generateEvalReport` in the repo, but the contract is exercised by both `packages/engine/test/unit/sim/eval-report.test.ts` and `packages/engine/test/integration/sim/eval-full.test.ts`. The old signature is also documented in `archive/specs/11-evaluator-degeneracy-detection.md`, `specs/12-cli.md`, `specs/14-evolution-pipeline.md`, and the archived completion records for 11EVADEGDET-005 and 11EVADEGDET-006.
5. `aggregateEvals` already uses the cleaner contract, `(gameDefId, evals)`, so narrowing `generateEvalReport` would align the wrapper with the existing aggregate layer instead of introducing a second identifier source.
6. Foundations §9 forbids compatibility shims and alias paths. If this API is corrected, the old `GameDef`-accepting signature should be removed outright and all in-repo consumers/specs updated in the same change.

## Architecture Check

1. Narrowing the API to `generateEvalReport(gameDefId, traces, config?)` is cleaner than keeping the current `GameDef` parameter because it makes the function’s dependency surface honest and minimal.
2. This reduces coupling between the evaluator and compiled game-definition shape, which is better long-term architecture for a generic trace-analysis layer.
3. This change preserves Foundations §1 because the evaluator remains game-agnostic and identifier-based; it still does not interpret game-specific content.
4. This is cleaner than keeping the current `GameDef` wrapper, and still cleaner than deleting the wrapper entirely, because the convenience layer retains value for CLI and evolution flows that already have a known `gameDefId` and raw traces.
5. No backwards-compatibility overloads, aliases, or dual signatures should be introduced. The old `GameDef` signature is removed and all repository references are updated in one pass.

## What to Change

### 1. Narrow the runtime API

Change:

```typescript
export function generateEvalReport(
  gameDefId: string,
  traces: readonly GameTrace[],
  config?: EvalConfig
): EvalReport;
```

Implementation:
- Remove the `GameDef` import and parameter from `packages/engine/src/sim/eval-report.ts`
- Evaluate traces exactly as today
- Delegate to `aggregateEvals(gameDefId, evals)`

### 2. Update dependent tests and exports

- Update `packages/engine/test/unit/sim/eval-report.test.ts` to pass a string identifier instead of a stub `GameDef`
- Update `packages/engine/test/integration/sim/eval-full.test.ts` to use the narrowed wrapper contract end to end
- Keep all contract assertions, especially wrapper equivalence and empty-trace behavior
- Ensure all exported types/functions still compile cleanly through `packages/engine/src/sim/index.ts`

### 3. Update the defining specs and historical ticket records

Update the API contract and examples in:
- `archive/specs/11-evaluator-degeneracy-detection.md`
- `specs/12-cli.md`
- `specs/14-evolution-pipeline.md`
- `archive/tickets/11EVADEGDET/11EVADEGDET-005-aggregation.md`
- `archive/tickets/11EVADEGDET/11EVADEGDET-006-evaluator-integration-golden-and-sim-surface.md`

Required updates:
- Replace `generateEvalReport(def, traces, config?)` with `generateEvalReport(gameDefId, traces, config?)`
- Update any prose that implies the evaluator needs a full `GameDef`
- Keep the CLI/evolution steps explicit about where `gameDefId` comes from

### 4. Amend archived outcomes deliberately

Both archived tickets 11EVADEGDET-005 and 11EVADEGDET-006 contain outcome text and examples that hard-code the old wrapper signature. Because archival policy requires stale archived outcomes to be amended when later implementation changes invalidate them, update each archived ticket's `Outcome` section with `Outcome amended: 2026-03-29` and a short note that 11EVADEGDET-007 narrowed `generateEvalReport` from `(def, traces, config?)` to `(gameDefId, traces, config?)`.

## Files to Touch

- `packages/engine/src/sim/eval-report.ts` (modify)
- `packages/engine/src/sim/index.ts` (modify only if signature/export typing requires it)
- `packages/engine/test/unit/sim/eval-report.test.ts` (modify)
- `packages/engine/test/integration/sim/eval-full.test.ts` (modify)
- `archive/specs/11-evaluator-degeneracy-detection.md` (modify)
- `specs/12-cli.md` (modify)
- `specs/14-evolution-pipeline.md` (modify)
- `archive/tickets/11EVADEGDET/11EVADEGDET-005-aggregation.md` (modify)
- `archive/tickets/11EVADEGDET/11EVADEGDET-006-evaluator-integration-golden-and-sim-surface.md` (modify)

## Out of Scope

- Any change to per-trace evaluator logic in `trace-eval.ts`
- Any change to aggregate `EvalReport` structure
- Introducing runtime validation that `trace.gameDefId === gameDefId`
- CLI feature work beyond updating the documented evaluator call shape
- Evolution-pipeline feature work beyond updating the documented evaluator call shape
- Any backwards-compatibility overload, alias, or deprecated wrapper

## Acceptance Criteria

### Tests That Must Pass

1. `generateEvalReport` accepts `gameDefId: string` and no longer accepts `GameDef`.
2. Wrapper behavior is unchanged: `generateEvalReport(gameDefId, traces, config)` equals `aggregateEvals(gameDefId, traces.map(trace => evaluateTrace(trace, config)))`.
3. Empty-trace behavior remains unchanged under the narrowed signature.
4. All in-repo specs and active tickets that reference this API use the new signature.
5. Archived tickets 11EVADEGDET-005 and 11EVADEGDET-006 are amended so their `Outcome` sections no longer leave stale claims about the old wrapper contract.
6. `pnpm turbo typecheck`
7. `pnpm turbo lint`
8. `pnpm turbo test`

### Invariants

1. The evaluator aggregate layer depends only on trace data plus an explicit identifier string, not on full `GameDef` shape.
2. No overloads, aliases, or compatibility shims remain for the old `GameDef`-based signature.
3. The code and specs agree on the same `generateEvalReport` contract after the change.
4. Archived records that remain in-tree do not silently contradict the current contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/eval-report.test.ts` — update wrapper tests to use the narrowed `gameDefId` contract and prove behavior is otherwise unchanged.
2. `packages/engine/test/integration/sim/eval-full.test.ts` — update end-to-end wrapper coverage so the integration surface proves the same narrowed contract.
3. Existing typecheck/build coverage — catches any stale in-repo call sites or export typing that still assume `GameDef`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/sim/eval-report.test.js`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Narrowed `generateEvalReport` in `packages/engine/src/sim/eval-report.ts` from `(def, traces, config?)` to `(gameDefId, traces, config?)`.
  - Updated the wrapper's unit and integration coverage to use the explicit identifier contract.
  - Updated Spec 11, Spec 12, and Spec 14 to describe the narrowed API.
  - Amended archived tickets 11EVADEGDET-005 and 11EVADEGDET-006 so their outcome text no longer leaves stale claims about the old wrapper contract.
- Deviations from original plan:
  - The ticket was corrected first because its assumption about the test surface was incomplete; `generateEvalReport` was also exercised by `packages/engine/test/integration/sim/eval-full.test.ts`.
  - No barrel-export changes were needed because the `./sim` surface already re-exported the wrapper cleanly.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/sim/eval-report.test.js packages/engine/dist/test/integration/sim/eval-full.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
