# Execution Tracing and Runtime Warnings Design

**Date**: 2026-02-13
**Status**: Approved
**Audience**: AI agents (primary), human developers (secondary)

## Problem

The GameSpecDoc -> GameDef -> kernel/simulation pipeline has debugging gaps that cause wasted time during FITL profile development:

1. **Compiler diagnostic opacity**: `assert.deepEqual(compiled.diagnostics, [])` fails with raw array diffs instead of showing severity, code, path, and YAML source location.
2. **Silent wrong results**: forEach matching 0 tokens, filters checking wrong prop paths, moveToken finding nothing — all produce correct but unexpected empty results with zero indication of why.
3. **No effect execution trace**: `applyMove` returns trigger firings and state deltas, but not which effects executed or what they did. Nested forEach loops in operation profiles are opaque.
4. **Binding resolution opacity**: When a `ValueExpr` ref resolves to `undefined`, the error is silent or cryptic without showing available bindings.
5. **Warning -> test cascade**: A single compiler warning causes `deepEqual(diagnostics, [])` to fail across every test that compiles the same fixture. 33 failures from 1 root cause.

## Solution: Two-Layer Tracing Architecture

### Layer 1: Always-On Runtime Warnings

Lightweight `RuntimeWarning[]` always returned from `applyMove`. Captures "noteworthy" zero-result situations at near-zero overhead (one integer comparison per forEach/query). Warning messages include hints pointing to the trace system for discoverability.

Warning codes (closed union):
- `EMPTY_QUERY_RESULT` — tokensInZone/filter matched 0 of N tokens
- `TOKEN_NOT_IN_ZONE` — moveToken: token absent from resolved source zone
- `BINDING_UNDEFINED` — ValueExpr ref resolved to undefined (shows available bindings)
- `EMPTY_ZONE_OPERATION` — draw/shuffle on empty zone
- `ZERO_EFFECT_ITERATIONS` — forEach ran 0 iterations

### Layer 2: Opt-In Effect Execution Trace

`applyMove(def, state, move, { trace: true })` returns `effectTrace: readonly EffectTraceEntry[]` recording every effect execution with structured data.

Trace entry kinds (discriminated union):
- `forEach` — bind, matchCount, limit, iteratedCount
- `moveToken` — tokenId, from, to
- `setTokenProp` — tokenId, prop, oldValue, newValue
- `varChange` — scope, varName, oldValue, newValue
- `createToken` — tokenId, type, zone
- `queryResult` — queryType, zone, filterSummary, matchCount
- `conditional` — branch (then/else), conditionSummary

### Layer 3: Test Assertion Helpers

- `assertNoDiagnostics(compiled, sourceMap?)` — formats diagnostics with severity, code, path, source line
- `assertNoErrors(parsed)` — tolerates warnings, fails only on errors
- `assertNoWarnings(result)` — catches silent 0-match problems in kernel tests
- `formatDiagnostics(diagnostics, sourceMap?)` — reusable formatting function

## Architecture

### ExecutionCollector

Mutable accumulator created per `applyMove` call, threaded through `EffectContext`:

```typescript
interface ExecutionCollector {
  readonly warnings: RuntimeWarning[];           // mutable push target
  readonly trace: EffectTraceEntry[] | null;     // null = tracing disabled
}
```

Created via `createCollector(options?: ExecutionOptions)`. Helper functions `emitWarning` and `emitTrace` accept `undefined` collectors gracefully (for contexts without runtime execution).

### API Surface Changes

```typescript
// applyMove gains optional 4th parameter
function applyMove(def, state, move, options?: ExecutionOptions): ApplyMoveResult;

// ApplyMoveResult gains 2 fields
interface ApplyMoveResult {
  readonly state: GameState;
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];        // always populated
  readonly effectTrace?: readonly EffectTraceEntry[];   // only when trace:true
}

// EffectContext gains required collector
interface EffectContext {
  // ... existing fields ...
  readonly collector: ExecutionCollector;
}

// EvalContext gains optional collector
interface EvalContext {
  // ... existing fields ...
  readonly collector?: ExecutionCollector;
}
```

### Warning Emission Points (6 locations)

1. `effects.ts` — forEach with 0 matches
2. `effects.ts` — forEach limit evaluates to 0
3. `effects.ts` — moveToken token not in source zone
4. `effects.ts` — draw from empty zone
5. `eval-value.ts` — binding ref resolves to undefined (includes available bindings)
6. `eval-query.ts` — tokensInZone filters match 0 of N tokens

### Trace Emission Points (7 locations)

1. `effects.ts` — forEach iteration summary
2. `effects.ts` — moveToken
3. `effects.ts` — setTokenProp
4. `effects.ts` — addVar/setVar
5. `effects.ts` — createToken
6. `eval-query.ts` — query result
7. `eval-value.ts` — conditional branch

## File Inventory

### New files
- `src/kernel/execution-collector.ts` — collector type and helpers
- `test/helpers/diagnostic-helpers.ts` — test assertion helpers

### Modified source files
- `src/kernel/types.ts` — new types, EffectContext/EvalContext/ApplyMoveResult/MoveLog changes
- `src/kernel/effects.ts` — warning + trace emissions
- `src/kernel/eval-value.ts` — warning + trace emissions
- `src/kernel/eval-query.ts` — warning + trace emissions
- `src/kernel/apply-move.ts` — ExecutionOptions param, collector creation, result enrichment
- `src/kernel/index.ts` — re-exports
- `src/sim/simulator.ts` — thread options, extend MoveLog

### Test migration (~40-50 sites)
- EffectContext construction: add `collector: createCollector()`
- `deepEqual(diagnostics, [])` -> `assertNoDiagnostics(compiled, sourceMap)`
- `filter(d => severity === 'error').length === 0` -> `assertNoErrors(parsed)`

### Unchanged
- Compiler source (`src/cnl/*`)
- Agent source (`src/agents/*`)
- Schemas (`schemas/*`)
- Production data (`data/*`)

## Overhead

- **Warnings disabled path**: One `length === 0` integer comparison per forEach/query. Negligible.
- **Trace disabled path**: One `collector.trace !== null` check per effect. Zero allocation.
- **Trace enabled path**: Object allocation per effect execution. Acceptable for debugging.

## Discoverability for AI Agents

1. `ExecutionOptions` is visible in `applyMove`'s type signature — agents reading the API see `trace?: boolean`
2. Runtime warnings include `hint: "enable trace:true for effect execution details"` — agents seeing warnings are directed to traces
3. `assertNoWarnings(result)` in tests surfaces warnings that would otherwise be invisible
4. `warnings` field on `ApplyMoveResult` is required (not optional) — always present in return type, always visible to agents
