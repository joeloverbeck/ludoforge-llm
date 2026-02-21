# CONCPAR-004: Trace entries for reveal and conceal effects

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel types, schemas, runtime (types-core, schemas-core, effects-reveal)
**Deps**: CONCPAR-003

## Problem

The `applyReveal` and `applyConceal` functions do not emit effect trace entries. All other state-mutating effects (moveToken, setVar, addVar, transferVar, createToken, destroyToken, setTokenProp) emit traces that appear in `MoveLog.effectTrace`. This gap makes reveal/conceal operations invisible in trace logs, hindering debugging and evaluation of hidden-information games.

## Assumption Reassessment (2026-02-21)

1. **EffectTraceEntry union**: Confirmed at `types-core.ts:739-748` — includes forEach, reduce, moveToken, setTokenProp, varChange, resourceTransfer, createToken, destroyToken, lifecycleEvent. No reveal or conceal entries.
2. **EffectTraceEntrySchema**: Confirmed at `schemas-core.ts:469-576` — Zod union matches the type union. No reveal or conceal schemas.
3. **applyReveal**: Confirmed at `effects-reveal.ts:69-110` — returns `EffectResult` with state changes but no trace emission. The `EffectResult` type includes `emittedEvents` but traces are added via `ExecutionCollector`.
4. **Trace emission pattern**: Other effects emit traces by pushing to `ctx.collector.trace` when `ctx.collector.trace !== null`. Need to verify this pattern is available in the reveal/conceal context.
5. **EffectContext**: The `EffectContext` type (from `effect-context.ts`) includes a `collector` with a `trace` array. Both `applyReveal` and `applyConceal` receive `EffectContext` and can emit traces.

## Architecture Check

1. **Consistency**: Adding reveal/conceal to the trace union follows the established pattern for all other state-mutating effects. Not adding them is the inconsistency.
2. **Game-agnostic**: Trace entries record zone IDs, observer lists, and filter keys — all generic kernel concepts with no game-specific data.
3. **No shims**: New trace types are additive to the union. Existing trace consumers that don't handle the new kinds will simply skip them (standard union handling).

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
- `applyReveal`: after successful grant addition, push an `EffectTraceReveal` entry to `ctx.collector.trace` (when not null)
- `applyConceal`: after selective or blanket grant removal, push an `EffectTraceConceal` entry with `grantsRemoved` count
- No-op cases (duplicate grant, no matching grants): do not emit traces

### 5. Regenerate JSON schema artifacts

Run `pnpm turbo schema:artifacts` to update `Trace.schema.json` and `EvalReport.schema.json`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate)

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

1. `EffectTraceEntry` union is exhaustive (exhaustive test continues to pass)
2. JSON schema artifacts match TypeScript types
3. Trace emission is conditional on `ctx.collector.trace !== null`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-reveal.test.ts` — add trace emission tests:
   - Reveal: verify trace shape and provenance
   - Reveal no-op: verify no trace emitted
   - Conceal: verify trace shape, grantsRemoved count, and provenance
   - Conceal no-op: verify no trace emitted
2. `packages/engine/test/unit/types-exhaustive.test.ts` — verify new trace kinds are covered

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "reveal|conceal|trace"`
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo schema:artifacts`
