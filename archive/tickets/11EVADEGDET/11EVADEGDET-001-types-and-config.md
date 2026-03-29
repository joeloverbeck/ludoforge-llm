# 11EVADEGDET-001: EvalConfig, TraceMetrics, TraceEval types & schema update

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — types-core.ts, schemas-core.ts, sim/eval-config.ts, EvalReport.schema.json artifact
**Deps**: Spec 10 (simulator + trace recording — already delivered)

## Problem

Spec 11 introduces three new interfaces (`EvalConfig`, `TraceMetrics`, `TraceEval`) and requires updating the existing `EvalReport` interface (drop `traces`, add `perSeed: readonly TraceEval[]`). The JSON Schema must stay in sync. This ticket delivers the type foundation that all subsequent 11EVADEGDET tickets depend on.

## Assumption Reassessment (2026-03-29)

1. `EvalReport` currently lives in `packages/engine/src/kernel/types-core.ts` with a `traces: readonly GameTrace[]` field — confirmed.
2. The runtime and serialized eval-report schemas also still encode `traces` in `packages/engine/src/kernel/schemas-core.ts` via `EvalReportSchema` and `SerializedEvalReportSchema`.
3. `packages/engine/schemas/EvalReport.schema.json` is a generated artifact emitted from `schema-artifacts.ts`, not the primary source of truth. It must be regenerated after schema-source updates.
4. `DegeneracyFlag` already has all 6 values in `packages/engine/src/kernel/diagnostics.ts` — no additions needed.
5. `Metrics` already exists in `types-core.ts` with the correct 7 aggregated fields — no changes needed to `Metrics`.
6. No `TraceMetrics`, `TraceEval`, or `EvalConfig` types exist yet.
7. Existing schema tests already reference `EvalReport.traces` in `packages/engine/test/unit/schemas-top-level.test.ts` and `packages/engine/test/unit/json-schema.test.ts`; those tests must be updated in this ticket.

## Architecture Check

1. Keeping report and per-trace evaluator types in `types-core.ts` is still the cleanest architecture because `GameTrace`, `Metrics`, and `EvalReport` already live in the shared kernel type surface consumed by downstream packages.
2. `EvalConfig` belongs in the `sim` layer because it configures evaluator behavior rather than kernel execution. A dedicated `sim/eval-config.ts` file keeps the concern scoped without polluting kernel internals.
3. The proposed split between aggregate `Metrics` and per-trace `TraceMetrics` is beneficial versus the current architecture because it separates two different semantic levels instead of overloading one report type.
4. Replacing `EvalReport.traces` with `perSeed: TraceEval[]` is beneficial because aggregate reports should expose evaluator diagnostics, not embed full raw traces. Full traces already have their own type and persistence path.
5. It is not architecturally sound to treat `packages/engine/schemas/EvalReport.schema.json` as hand-edited source. The durable path is: update `types-core.ts` and `schemas-core.ts`, regenerate the artifact, and keep tests aligned with generated output.
6. No backwards-compatibility shims: the `traces` field is removed outright, not aliased. Any resulting breakage is fixed in-repo per Foundations §§9-10.

## What to Change

### 1. Add `TraceMetrics` interface to `types-core.ts`

```typescript
export interface TraceMetrics {
  readonly gameLength: number;
  readonly avgBranchingFactor: number;
  readonly actionDiversity: number;
  readonly resourceTension: number;
  readonly interactionProxy: number;
  readonly dominantActionFreq: number;
  readonly dramaMeasure: number;
}
```

### 2. Add `TraceEval` interface to `types-core.ts`

```typescript
export interface TraceEval {
  readonly seed: number;
  readonly turnCount: number;
  readonly stopReason: SimulationStopReason;
  readonly metrics: TraceMetrics;
  readonly degeneracyFlags: readonly DegeneracyFlag[];
}
```

### 3. Update `EvalReport` in `types-core.ts`

- Remove `readonly traces: readonly GameTrace[]`
- Add `readonly perSeed: readonly TraceEval[]`

### 4. Add `EvalConfig` and `DEFAULT_EVAL_CONFIG` in new file

Create `packages/engine/src/sim/eval-config.ts`:

```typescript
export interface EvalConfig {
  readonly trivialWinThreshold?: number;
  readonly stallTurnThreshold?: number;
  readonly dominantActionThreshold?: number;
  readonly scoringVar?: string;
}

export const DEFAULT_EVAL_CONFIG = {
  trivialWinThreshold: 5,
  stallTurnThreshold: 10,
  dominantActionThreshold: 0.8,
} as const satisfies Required<Omit<EvalConfig, 'scoringVar'>>;
```

### 5. Update eval-report schemas in `schemas-core.ts`

- Add `TraceMetricsSchema` and `TraceEvalSchema`.
- Update `EvalReportSchema` to use `perSeed: z.array(TraceEvalSchema)`.
- Update `SerializedEvalReportSchema` to use the same `perSeed` shape.

### 6. Regenerate `EvalReport.schema.json` and fix any drift

- Run `pnpm turbo schema:artifacts`.
- Commit the regenerated `packages/engine/schemas/EvalReport.schema.json` artifact.
- Do not hand-edit the generated JSON except as regenerated output from the schema source change.

### 7. Update existing schema tests

- Replace `traces` fixtures/assertions with `perSeed`.
- Ensure the updated schema fixtures exercise the `TraceEval.metrics` shape.

The schema artifact generation script must succeed after schema changes.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add TraceMetrics, TraceEval; update EvalReport)
- `packages/engine/src/sim/eval-config.ts` (new — EvalConfig, DEFAULT_EVAL_CONFIG)
- `packages/engine/src/sim/index.ts` (modify — re-export eval-config)
- `packages/engine/src/kernel/schemas-core.ts` (modify — add TraceMetricsSchema/TraceEvalSchema; update EvalReportSchema + SerializedEvalReportSchema)
- `packages/engine/schemas/EvalReport.schema.json` (generated artifact — regenerated after schema source changes)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify — update runtime-schema fixture to `perSeed`)
- `packages/engine/test/unit/json-schema.test.ts` (modify — update generated-schema fixture to `perSeed`)

## Out of Scope

- Metric computation logic (11EVADEGDET-003)
- Degeneracy detection logic (11EVADEGDET-004)
- Delta reconstruction (11EVADEGDET-002)
- Aggregation functions (11EVADEGDET-005)
- Integration tests (11EVADEGDET-006)
- Any changes to `DegeneracyFlag` enum (already complete)
- Any changes to `Metrics` interface (already matches spec)

## Acceptance Criteria

### Tests That Must Pass

1. TypeScript compiles cleanly: `pnpm turbo typecheck`
2. Schema artifacts regenerate without error: `pnpm turbo schema:artifacts`
3. Existing test suite passes: `pnpm turbo test`
4. `EvalConfig` type-checks with optional fields and `scoringVar`
5. `DEFAULT_EVAL_CONFIG` satisfies `Required<Omit<EvalConfig, 'scoringVar'>>`
6. Lint passes cleanly: `pnpm turbo lint`

### Invariants

1. `EvalReport` no longer has a `traces` field — any compile errors from removed field must be fixed in this ticket.
2. `DegeneracyFlag` enum is unchanged.
3. `Metrics` interface is unchanged.
4. Runtime and serialized eval-report schemas remain aligned with the TypeScript types.
5. Engine agnosticism: no game-specific identifiers introduced.
6. Foundation §9 (No Backwards Compatibility): no alias for the removed `traces` field.

## Test Plan

### New/Modified Tests

1. Modify `packages/engine/test/unit/schemas-top-level.test.ts` to validate the runtime `EvalReportSchema` with `perSeed: TraceEval[]`.
2. Modify `packages/engine/test/unit/json-schema.test.ts` to validate the generated `EvalReport.schema.json` with serialized `perSeed` entries.
3. No new standalone test file is required if the updated schema tests fully cover the changed contract.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo test`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Added `TraceMetrics` and `TraceEval` to `packages/engine/src/kernel/types-core.ts`.
  - Replaced `EvalReport.traces` with `EvalReport.perSeed`.
  - Added `EvalConfig` and `DEFAULT_EVAL_CONFIG` in `packages/engine/src/sim/eval-config.ts` and re-exported them from `packages/engine/src/sim/index.ts`.
  - Updated `packages/engine/src/kernel/schemas-core.ts` so the runtime and serialized eval-report schemas match the new type shape.
  - Regenerated `packages/engine/schemas/EvalReport.schema.json`.
  - Updated schema tests to validate the new `perSeed` contract and explicitly reject the legacy `traces` field.
- Deviations from original plan:
  - The original ticket understated the scope by treating `EvalReport.schema.json` as the primary schema change location. The implementation instead updated the authoritative schema sources in `schemas-core.ts` and regenerated the artifact.
  - Existing schema tests required modification and strengthening; this was added to the completed scope after reassessment.
- Verification results:
  - `pnpm exec turbo schema:artifacts`
  - `pnpm exec turbo typecheck`
  - `pnpm exec turbo test`
  - `pnpm exec turbo lint`
