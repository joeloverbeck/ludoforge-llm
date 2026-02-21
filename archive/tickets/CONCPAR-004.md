# CONCPAR-004: Trace entries for reveal and conceal effects

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel types, schemas, runtime (types-core, schemas-core, effects-reveal)
**Runner Changes**: Yes — exhaustive handling for new trace kinds (preset-registry, trace mapping/projection, event-log translation)
**Deps**: CONCPAR-003

## Problem

The `applyReveal` and `applyConceal` functions do not emit effect trace entries. All other state-mutating effects (moveToken, setVar, addVar, transferVar, createToken, destroyToken, setTokenProp) emit traces that appear in `MoveLog.effectTrace`. This gap makes reveal/conceal operations invisible in trace logs, hindering debugging and evaluation of hidden-information games.

## Assumption Reassessment (2026-02-21)

1. **EffectTraceEntry union**: Confirmed at `types-core.ts:739-748` — includes forEach, reduce, moveToken, setTokenProp, varChange, resourceTransfer, createToken, destroyToken, lifecycleEvent. No reveal or conceal entries.
2. **EffectTraceEntrySchema**: Confirmed at `schemas-core.ts:469-576` — Zod union matches the type union. No reveal or conceal schemas.
3. **applyReveal**: Confirmed at `effects-reveal.ts:69-110` — returns `EffectResult` with state changes but no trace emission. The `EffectResult` type includes `emittedEvents` but traces are added via `ExecutionCollector`.
4. **Trace emission pattern**: Confirmed at `execution-collector.ts:15-17` and callsites like `effects-token.ts:253` — effects emit traces through `emitTrace(ctx.collector, entry)`, which centrally guards on `collector.trace !== null`. Reveal/conceal should follow this same helper-based pattern.
5. **EffectContext**: The `EffectContext` type (from `effect-context.ts`) includes a `collector` with a `trace` array. Both `applyReveal` and `applyConceal` receive `EffectContext` and can emit traces.

## Architecture Check

1. **Consistency**: Adding reveal/conceal to the trace union follows the established pattern for all other state-mutating effects. Not adding them is the inconsistency.
2. **Game-agnostic**: Trace entries record zone IDs, observer lists, and filter keys — all generic kernel concepts with no game-specific data.
3. **No aliases/shims**: Implement canonical `reveal` and `conceal` trace kinds only; do not introduce compatibility aliases.

## What to Change

### 1. Add EffectTraceReveal and EffectTraceConceal interfaces to types-core.ts

```typescript
export interface EffectTraceReveal {
  readonly kind: 'reveal';
  readonly zone: string;
  readonly observers: 'all' | readonly PlayerId[];
  readonly filter?: readonly TokenFilterPredicate[];
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceConceal {
  readonly kind: 'conceal';
  readonly zone: string;
  readonly from?: 'all' | readonly PlayerId[];
  readonly filter?: readonly TokenFilterPredicate[];
  readonly grantsRemoved: number;
  readonly provenance: EffectTraceProvenance;
}
```

### 2. Add them to EffectTraceEntry union

Add `| EffectTraceReveal | EffectTraceConceal` to the `EffectTraceEntry` type.

### 3. Add Zod schemas in schemas-core.ts

Add two new entries to the `EffectTraceEntrySchema` union:
- Reveal trace: `kind: 'reveal'`, `zone: StringSchema`, `observers: z.union([z.literal('all'), z.array(IntegerSchema)])`, optional `filter`, `provenance`
- Conceal trace: `kind: 'conceal'`, `zone: StringSchema`, optional `from`, optional `filter`, `grantsRemoved: IntegerSchema.min(0)`, `provenance`

### 4. Emit traces from applyReveal and applyConceal

In `effects-reveal.ts`:
- `applyReveal`: after successful grant addition, emit an `EffectTraceReveal` entry via `emitTrace(ctx.collector, ...)`
- `applyConceal`: after selective or blanket grant removal, emit an `EffectTraceConceal` entry via `emitTrace(ctx.collector, ...)` with `grantsRemoved` count
- No-op cases (duplicate grant, no matching grants): do not emit traces

### 5. Regenerate JSON schema artifacts

Run `pnpm turbo schema:artifacts` to update `Trace.schema.json` and `EvalReport.schema.json`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate)
- `packages/runner/src/animation/animation-types.ts` (modify)
- `packages/runner/src/animation/preset-registry.ts` (modify)
- `packages/runner/src/animation/trace-to-descriptors.ts` (modify)
- `packages/runner/src/model/trace-projection.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)

## Out of Scope

- Trace visualization in the runner
- Trace-to-animation descriptor mapping for reveal/conceal
- Changes to other effect trace types

## Acceptance Criteria

### Tests That Must Pass

1. `applyReveal` emits an `EffectTraceReveal` entry with correct zone, observers, and filter shape
2. `applyReveal` no-op (duplicate grant) does not emit a trace
3. `applyConceal` emits an `EffectTraceConceal` entry with correct zone, from, filter, and grantsRemoved
4. `applyConceal` no-op (no matching grants) does not emit a trace
5. Trace entries pass Zod schema validation
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `EffectTraceEntry` union and schema remain in lockstep (type + Zod + JSON schema artifacts)
2. JSON schema artifacts match TypeScript types
3. Trace emission is conditional on `ctx.collector.trace !== null`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-reveal.test.ts` — add trace emission tests:
   - Reveal: verify trace shape and provenance
   - Reveal no-op: verify no trace emitted
   - Conceal: verify trace shape, grantsRemoved count, and provenance
   - Conceal no-op: verify no trace emitted
2. `packages/engine/test/unit/json-schema.test.ts` — add a trace payload case covering `reveal`/`conceal` entries to verify schema compatibility at artifact level

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "reveal|conceal|trace"`
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo schema:artifacts`

## Outcome

- **Completion date**: 2026-02-21
- **What changed**:
  - Added canonical `reveal` and `conceal` trace entry types to kernel TypeScript and Zod schema unions.
  - Implemented trace emission for `applyReveal`/`applyConceal` via `emitTrace` + `resolveTraceProvenance`, preserving no-op non-emission behavior.
  - Regenerated schema artifacts (`Trace.schema.json`, `EvalReport.schema.json`).
  - Added/strengthened tests for reveal/conceal trace emission and JSON-schema validation.
  - Updated runner exhaustive handling for new trace kinds so typecheck remains strict (no aliasing/back-compat shim).
- **Deviation from original plan**:
  - Added minimal runner updates not originally listed. This was required because strict exhaustive switches over `EffectTraceEntry['kind']` failed typecheck once `reveal`/`conceal` were introduced.
  - Kept reveal/conceal out of visual animation mapping (still skipped descriptors), consistent with stated out-of-scope constraints.
- **Verification**:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "reveal|conceal|trace"` passed.
  - `pnpm turbo schema:artifacts` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
