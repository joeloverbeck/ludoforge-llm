# 11EVADEGDET-001: EvalConfig, TraceMetrics, TraceEval types & schema update

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — types-core.ts, EvalReport.schema.json
**Deps**: Spec 10 (simulator + trace recording — already delivered)

## Problem

Spec 11 introduces three new interfaces (`EvalConfig`, `TraceMetrics`, `TraceEval`) and requires updating the existing `EvalReport` interface (drop `traces`, add `perSeed: readonly TraceEval[]`). The JSON Schema must stay in sync. This ticket delivers the type foundation that all subsequent 11EVADEGDET tickets depend on.

## Assumption Reassessment (2026-03-29)

1. `EvalReport` currently lives in `packages/engine/src/kernel/types-core.ts` with a `traces: readonly GameTrace[]` field — confirmed at line ~1451.
2. `DegeneracyFlag` enum already has all 6 values in `diagnostics.ts` — no additions needed.
3. `Metrics` interface already exists in `types-core.ts` with the correct 7 fields — no changes needed to `Metrics`.
4. `EvalReport.schema.json` currently defines `traces` as an array of full `GameTrace` objects — needs replacement with `perSeed`.
5. No `TraceMetrics` or `TraceEval` types exist yet — they are new.

## Architecture Check

1. Types live in `types-core.ts` (kernel layer) because `EvalReport` is already there, and downstream consumers (CLI, evolution pipeline) import from the kernel barrel.
2. `EvalConfig` is a pure configuration type with no game-specific content — preserves engine agnosticism (Foundation §1).
3. No backwards-compatibility shims: the `traces` field is removed outright, not aliased. All consumers will be updated in subsequent tickets.

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

### 5. Update `EvalReport.schema.json`

- Remove `traces` property and its full GameTrace item schema.
- Add `perSeed` property as an array of `TraceEval` objects.
- Add `TraceMetrics` and `TraceEval` definitions.

### 6. Run `pnpm turbo schema:artifacts` and fix any drift

The schema artifact generation script must succeed after schema changes.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add TraceMetrics, TraceEval; update EvalReport)
- `packages/engine/src/sim/eval-config.ts` (new — EvalConfig, DEFAULT_EVAL_CONFIG)
- `packages/engine/src/sim/index.ts` (modify — re-export eval-config)
- `packages/engine/schemas/EvalReport.schema.json` (modify — drop traces, add perSeed + new definitions)

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

### Invariants

1. `EvalReport` no longer has a `traces` field — any compile errors from removed field must be fixed in this ticket.
2. `DegeneracyFlag` enum is unchanged.
3. `Metrics` interface is unchanged.
4. Engine agnosticism: no game-specific identifiers introduced.
5. Foundation §9 (No Backwards Compatibility): no alias for the removed `traces` field.

## Test Plan

### New/Modified Tests

1. No new test files — this is a types-only change. Compile-time verification via `tsc`.
2. Any existing tests referencing `EvalReport.traces` must be updated to use `EvalReport.perSeed`.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo test`
