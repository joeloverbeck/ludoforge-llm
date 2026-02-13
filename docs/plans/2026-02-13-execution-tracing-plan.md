# Execution Tracing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a two-layer debugging infrastructure (always-on runtime warnings + opt-in effect execution trace) to the kernel pipeline, plus test assertion helpers.

**Architecture:** An `ExecutionCollector` accumulator is created per `applyMove` call and threaded through `EffectContext`. Warnings are always collected; trace entries only when `trace: true`. Test helpers replace raw `deepEqual` assertions with informative failure messages.

**Tech Stack:** TypeScript, Node.js built-in test runner, no new dependencies.

**Design doc:** `docs/plans/2026-02-13-execution-tracing-design.md`

---

### Task 1: Create ExecutionCollector module and types

**Files:**
- Create: `src/kernel/execution-collector.ts`
- Modify: `src/kernel/types.ts` (lines 939-951 — `ApplyMoveResult`, `MoveLog`)
- Modify: `src/kernel/effect-context.ts` (lines 7-19 — `EffectContext`)
- Modify: `src/kernel/eval-context.ts` (lines 7-16 — `EvalContext`)
- Modify: `src/kernel/index.ts` (add re-export)
- Test: `test/unit/execution-collector.test.ts`

**Step 1: Write the failing test**

Create `test/unit/execution-collector.test.ts`:

```typescript
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCollector, emitWarning, emitTrace } from '../../src/kernel/execution-collector.js';
import type { RuntimeWarning, EffectTraceEntry } from '../../src/kernel/types.js';

describe('ExecutionCollector', () => {
  describe('createCollector', () => {
    it('creates collector with empty warnings and null trace when no options', () => {
      const c = createCollector();
      assert.deepEqual(c.warnings, []);
      assert.equal(c.trace, null);
    });

    it('creates collector with empty trace array when trace:true', () => {
      const c = createCollector({ trace: true });
      assert.deepEqual(c.warnings, []);
      assert.ok(Array.isArray(c.trace));
      assert.equal(c.trace!.length, 0);
    });

    it('creates collector with null trace when trace:false', () => {
      const c = createCollector({ trace: false });
      assert.equal(c.trace, null);
    });
  });

  describe('emitWarning', () => {
    it('pushes warning to collector', () => {
      const c = createCollector();
      const w: RuntimeWarning = {
        code: 'ZERO_EFFECT_ITERATIONS',
        message: 'test',
        context: {},
      };
      emitWarning(c, w);
      assert.equal(c.warnings.length, 1);
      assert.equal(c.warnings[0], w);
    });

    it('is a no-op when collector is undefined', () => {
      // Should not throw
      emitWarning(undefined, {
        code: 'ZERO_EFFECT_ITERATIONS',
        message: 'test',
        context: {},
      });
    });
  });

  describe('emitTrace', () => {
    it('pushes trace entry when trace is enabled', () => {
      const c = createCollector({ trace: true });
      const entry: EffectTraceEntry = {
        kind: 'moveToken',
        tokenId: 't1',
        from: 'zoneA',
        to: 'zoneB',
      };
      emitTrace(c, entry);
      assert.equal(c.trace!.length, 1);
      assert.equal(c.trace![0], entry);
    });

    it('is a no-op when trace is disabled', () => {
      const c = createCollector();
      emitTrace(c, {
        kind: 'moveToken',
        tokenId: 't1',
        from: 'zoneA',
        to: 'zoneB',
      });
      assert.equal(c.trace, null);
    });

    it('is a no-op when collector is undefined', () => {
      emitTrace(undefined, {
        kind: 'moveToken',
        tokenId: 't1',
        from: 'zoneA',
        to: 'zoneB',
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/test/unit/execution-collector.test.js`
Expected: FAIL — module not found

**Step 3: Add types to `src/kernel/types.ts`**

After the existing `OperationFreeTraceEntry` interface (around line 930), add:

```typescript
// ── Runtime Warnings ──────────────────────────────────────

export type RuntimeWarningCode =
  | 'EMPTY_QUERY_RESULT'
  | 'TOKEN_NOT_IN_ZONE'
  | 'BINDING_UNDEFINED'
  | 'EMPTY_ZONE_OPERATION'
  | 'ZERO_EFFECT_ITERATIONS';

export interface RuntimeWarning {
  readonly code: RuntimeWarningCode;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly hint?: string;
}

// ── Effect Execution Trace ────────────────────────────────

export interface EffectTraceForEach {
  readonly kind: 'forEach';
  readonly bind: string;
  readonly matchCount: number;
  readonly limit?: number;
  readonly iteratedCount: number;
}

export interface EffectTraceMoveToken {
  readonly kind: 'moveToken';
  readonly tokenId: string;
  readonly from: string;
  readonly to: string;
}

export interface EffectTraceSetTokenProp {
  readonly kind: 'setTokenProp';
  readonly tokenId: string;
  readonly prop: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface EffectTraceVarChange {
  readonly kind: 'varChange';
  readonly scope: 'global' | 'perPlayer';
  readonly varName: string;
  readonly oldValue: number;
  readonly newValue: number;
}

export interface EffectTraceCreateToken {
  readonly kind: 'createToken';
  readonly tokenId: string;
  readonly type: string;
  readonly zone: string;
}

export interface EffectTraceQueryResult {
  readonly kind: 'queryResult';
  readonly queryType: string;
  readonly zone: string;
  readonly filterSummary: string;
  readonly matchCount: number;
}

export interface EffectTraceConditional {
  readonly kind: 'conditional';
  readonly branch: 'then' | 'else';
  readonly conditionSummary: string;
}

export type EffectTraceEntry =
  | EffectTraceForEach
  | EffectTraceMoveToken
  | EffectTraceSetTokenProp
  | EffectTraceVarChange
  | EffectTraceCreateToken
  | EffectTraceQueryResult
  | EffectTraceConditional;

// ── Execution Options ─────────────────────────────────────

export interface ExecutionOptions {
  readonly trace?: boolean;
}

// ── Execution Collector ───────────────────────────────────

export interface ExecutionCollector {
  readonly warnings: RuntimeWarning[];
  readonly trace: EffectTraceEntry[] | null;
}
```

Then update `ApplyMoveResult` (line ~939) to:

```typescript
export interface ApplyMoveResult {
  readonly state: GameState;
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
}
```

And update `MoveLog` (line ~944) to:

```typescript
export interface MoveLog {
  readonly stateHash: bigint;
  readonly player: PlayerId;
  readonly move: Move;
  readonly legalMoveCount: number;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
}
```

**Step 4: Create `src/kernel/execution-collector.ts`**

```typescript
import type { EffectTraceEntry, ExecutionCollector, ExecutionOptions, RuntimeWarning } from './types.js';

export function createCollector(options?: ExecutionOptions): ExecutionCollector {
  return {
    warnings: [],
    trace: options?.trace === true ? [] : null,
  };
}

export function emitWarning(collector: ExecutionCollector | undefined, warning: RuntimeWarning): void {
  if (collector === undefined) return;
  collector.warnings.push(warning);
}

export function emitTrace(collector: ExecutionCollector | undefined, entry: EffectTraceEntry): void {
  if (collector === undefined || collector.trace === null) return;
  collector.trace.push(entry);
}
```

**Step 5: Add `collector` field to `EffectContext`**

In `src/kernel/effect-context.ts` (line 18), add before the closing brace:

```typescript
  readonly collector?: ExecutionCollector;
```

Import at top: `import type { ExecutionCollector } from './types.js';`
(Add `ExecutionCollector` to the existing import from `./types.js`)

Note: `collector` is optional on `EffectContext` because existing code that constructs `EffectContext` without a collector must still compile. The warning/trace emission helpers accept `undefined` gracefully. We'll make it required after the migration is complete (Task 8).

**Step 6: Add `collector` field to `EvalContext`**

In `src/kernel/eval-context.ts` (line 15), add before the closing brace:

```typescript
  readonly collector?: ExecutionCollector;
```

Import at top: `import type { ExecutionCollector } from './types.js';`
(Add `ExecutionCollector` to the existing import from `./types.js`)

**Step 7: Add re-export in `src/kernel/index.ts`**

Add line: `export * from './execution-collector.js';`

**Step 8: Run test to verify it passes**

Run: `npm run build && node --test dist/test/unit/execution-collector.test.js`
Expected: PASS (all 6 tests)

**Step 9: Run full test suite to confirm no regressions**

Run: `npm test`
Expected: All existing tests pass (collector is optional, so no breakage)

**Step 10: Commit**

```bash
git add src/kernel/execution-collector.ts src/kernel/types.ts src/kernel/effect-context.ts src/kernel/eval-context.ts src/kernel/index.ts test/unit/execution-collector.test.ts
git commit -m "feat: add ExecutionCollector types and module for runtime warnings and tracing"
```

---

### Task 2: Create test assertion helpers

**Files:**
- Create: `test/helpers/diagnostic-helpers.ts`
- Test: `test/unit/diagnostic-helpers.test.ts`

**Step 1: Write the failing test**

Create `test/unit/diagnostic-helpers.test.ts`:

```typescript
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertNoDiagnostics,
  assertNoErrors,
  assertNoWarnings,
  formatDiagnostics,
} from '../helpers/diagnostic-helpers.js';
import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { RuntimeWarning } from '../../src/kernel/types.js';

describe('diagnostic-helpers', () => {
  describe('assertNoDiagnostics', () => {
    it('passes when diagnostics array is empty', () => {
      assertNoDiagnostics({ diagnostics: [] });
    });

    it('fails with formatted message when diagnostics exist', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'TEST_CODE', path: 'doc.actions', severity: 'warning', message: 'something wrong' },
      ];
      assert.throws(
        () => assertNoDiagnostics({ diagnostics }),
        (err: Error) => err.message.includes('Expected 0 diagnostics, got 1') && err.message.includes('TEST_CODE'),
      );
    });
  });

  describe('assertNoErrors', () => {
    it('passes when only warnings exist', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'WARN', path: 'doc.x', severity: 'warning', message: 'just a warning' },
      ];
      assertNoErrors({ diagnostics });
    });

    it('fails when errors exist', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'ERR', path: 'doc.x', severity: 'error', message: 'an error' },
      ];
      assert.throws(
        () => assertNoErrors({ diagnostics }),
        (err: Error) => err.message.includes('Expected 0 errors, got 1'),
      );
    });
  });

  describe('assertNoWarnings', () => {
    it('passes when warnings array is empty', () => {
      assertNoWarnings({ warnings: [] });
    });

    it('fails with formatted message when warnings exist', () => {
      const warnings: RuntimeWarning[] = [
        { code: 'ZERO_EFFECT_ITERATIONS', message: 'forEach matched 0', context: { bind: '$x' } },
      ];
      assert.throws(
        () => assertNoWarnings({ warnings }),
        (err: Error) =>
          err.message.includes('Expected 0 runtime warnings, got 1') &&
          err.message.includes('ZERO_EFFECT_ITERATIONS'),
      );
    });
  });

  describe('formatDiagnostics', () => {
    it('formats severity, code, path, and message', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'TEST', path: 'doc.foo', severity: 'error', message: 'bad thing' },
      ];
      const result = formatDiagnostics(diagnostics);
      assert.ok(result.includes('[error]'));
      assert.ok(result.includes('TEST'));
      assert.ok(result.includes('doc.foo'));
      assert.ok(result.includes('bad thing'));
    });

    it('includes source line when sourceMap provided', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'TEST', path: 'doc.foo', severity: 'warning', message: 'hmm' },
      ];
      const sourceMap = { byPath: { 'doc.foo': { blockIndex: 0, markdownLineStart: 42, markdownColStart: 1, markdownLineEnd: 42, markdownColEnd: 10 } } };
      const result = formatDiagnostics(diagnostics, sourceMap);
      assert.ok(result.includes('line 42'));
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/test/unit/diagnostic-helpers.test.js`
Expected: FAIL — module not found

**Step 3: Create `test/helpers/diagnostic-helpers.ts`**

```typescript
import * as assert from 'node:assert/strict';
import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { GameSpecSourceMap } from '../../src/cnl/source-map.js';
import type { RuntimeWarning } from '../../src/kernel/types.js';

export function assertNoDiagnostics(
  result: { readonly diagnostics: readonly Diagnostic[] },
  sourceMap?: GameSpecSourceMap,
): void {
  if (result.diagnostics.length === 0) return;
  const formatted = formatDiagnostics(result.diagnostics, sourceMap);
  assert.fail(`Expected 0 diagnostics, got ${result.diagnostics.length}:\n${formatted}`);
}

export function assertNoErrors(
  result: { readonly diagnostics: readonly Diagnostic[] },
): void {
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length === 0) return;
  const formatted = formatDiagnostics(errors);
  assert.fail(`Expected 0 errors, got ${errors.length}:\n${formatted}`);
}

export function assertNoWarnings(
  result: { readonly warnings: readonly RuntimeWarning[] },
): void {
  if (result.warnings.length === 0) return;
  const formatted = result.warnings
    .map((w) => `  [${w.code}] ${w.message}${w.hint ? ` (${w.hint})` : ''}`)
    .join('\n');
  assert.fail(`Expected 0 runtime warnings, got ${result.warnings.length}:\n${formatted}`);
}

export function formatDiagnostics(
  diagnostics: readonly Diagnostic[],
  sourceMap?: GameSpecSourceMap,
): string {
  return diagnostics
    .map((d) => {
      const location = sourceMap?.byPath[d.path];
      const loc = location !== undefined ? ` (line ${location.markdownLineStart})` : '';
      const suggestion = d.suggestion !== undefined ? `\n    suggestion: ${d.suggestion}` : '';
      const snippet = d.contextSnippet !== undefined ? `\n    snippet: ${d.contextSnippet}` : '';
      return `  [${d.severity}] ${d.code} at ${d.path}${loc}\n    ${d.message}${suggestion}${snippet}`;
    })
    .join('\n');
}
```

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/test/unit/diagnostic-helpers.test.js`
Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git add test/helpers/diagnostic-helpers.ts test/unit/diagnostic-helpers.test.ts
git commit -m "feat: add test assertion helpers for diagnostics and runtime warnings"
```

---

### Task 3: Thread collector through applyMove and effects

**Files:**
- Modify: `src/kernel/apply-move.ts` (lines 176-356 — `applyMove` function)
- Modify: `src/kernel/effects.ts` (lines 1097-1136 — `applyForEach`, plus all `applyEffects`/`applyEffect` call sites)
- Test: existing tests must still pass

**Step 1: Update `applyMove` in `src/kernel/apply-move.ts`**

1. Add import: `import { createCollector } from './execution-collector.js';`
2. Add import: `import type { ExecutionOptions } from './types.js';`
3. Change signature (line 176):
   ```typescript
   export const applyMove = (def: GameDef, state: GameState, move: Move, options?: ExecutionOptions): ApplyMoveResult => {
   ```
4. After line 185 (`const adjacencyGraph = ...`), add:
   ```typescript
   const collector = createCollector(options);
   ```
5. In `effectCtxBase` (line 186-193), add `collector`:
   ```typescript
   const effectCtxBase = {
     def,
     adjacencyGraph,
     activePlayer: state.activePlayer,
     actorPlayer: state.activePlayer,
     bindings: { ...move.params, __freeOperation: move.freeOperation ?? false, __actionClass: move.actionClass ?? 'operation' },
     moveParams: move.params,
     collector,
   } as const;
   ```
6. The recursive `applyCompoundSA` call (line 260) must also pass options:
   ```typescript
   const saResult = applyMove(def, effectState, move.compound.specialActivity, options);
   ```
   And merge warnings/trace from the compound result:
   ```typescript
   collector.warnings.push(...saResult.warnings);
   if (collector.trace !== null && saResult.effectTrace !== undefined) {
     collector.trace.push(...saResult.effectTrace);
   }
   ```
7. Update return (line 352-355):
   ```typescript
   return {
     state: stateWithHash,
     triggerFirings: [...executionTraceEntries, ...triggerResult.triggerLog, ...turnFlowResult.traceEntries, ...lifecycleAndAdvanceLog],
     warnings: collector.warnings,
     ...(collector.trace !== null ? { effectTrace: collector.trace } : {}),
   };
   ```

**Step 2: Build and run tests**

Run: `npm run build && npm test`
Expected: All tests pass. The collector is now threaded but no warnings/traces are emitted yet, so behavior is unchanged. Some tests that check `ApplyMoveResult` structure may need `warnings: []` added to expected objects — fix any that fail.

**Step 3: Commit**

```bash
git add src/kernel/apply-move.ts
git commit -m "feat: thread ExecutionCollector through applyMove and effect contexts"
```

---

### Task 4: Add warning emissions to kernel

**Files:**
- Modify: `src/kernel/effects.ts` (lines 1097-1150 — `applyForEach`, plus `moveToken`, `draw` handlers)
- Modify: `src/kernel/eval-value.ts` (binding resolution)
- Modify: `src/kernel/eval-query.ts` (lines 31-98 — `tokenMatchesPredicate`, `evalQuery`)
- Test: `test/unit/execution-warnings.test.ts`

**Step 1: Write the failing test**

Create `test/unit/execution-warnings.test.ts`:

```typescript
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  type ZoneDef,
} from '../../src/kernel/index.js';

const minimalDef: GameDef = {
  metadata: { id: 'warn-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('z1:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('z2:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [{ id: 'piece', props: { faction: 'string' } }],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
} as unknown as GameDef;

const z1 = asZoneId('z1:none');
const z2 = asZoneId('z2:none');

function makeCtx(zones: Record<string, Token[]>, bindings?: Record<string, unknown>, trace?: boolean): EffectContext {
  const state: GameState = {
    globalVars: {},
    perPlayerVars: {},
    playerCount: 2,
    zones,
    nextTokenOrdinal: 100,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    actionUsage: {},
    markers: {},
  };
  const zoneDefs: readonly ZoneDef[] = minimalDef.zones;
  return {
    def: minimalDef,
    adjacencyGraph: buildAdjacencyGraph(zoneDefs),
    state,
    rng: createRng(42n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: bindings ?? {},
    moveParams: {},
    collector: createCollector({ trace }),
  };
}

describe('Runtime warnings', () => {
  it('emits ZERO_EFFECT_ITERATIONS when forEach matches 0 tokens', () => {
    const ctx = makeCtx({ [z1]: [], [z2]: [] });
    const effects: readonly EffectAST[] = [{
      forEach: {
        bind: '$item',
        over: { query: 'tokensInZone' as const, zone: z1, filter: [] },
        effects: [],
      },
    }];
    const result = applyEffects(effects, ctx);
    assert.ok(result.warnings !== undefined);
    assert.ok(ctx.collector!.warnings.length > 0);
    assert.equal(ctx.collector!.warnings[0]!.code, 'ZERO_EFFECT_ITERATIONS');
  });

  it('emits EMPTY_QUERY_RESULT when filter reduces all tokens to 0', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] });
    const effects: readonly EffectAST[] = [{
      forEach: {
        bind: '$item',
        over: {
          query: 'tokensInZone' as const,
          zone: z1,
          filter: [{ prop: 'faction', op: 'eq' as const, value: 'NVA' }],
        },
        effects: [],
      },
    }];
    applyEffects(effects, ctx);
    const warnings = ctx.collector!.warnings;
    assert.ok(warnings.some((w) => w.code === 'EMPTY_QUERY_RESULT'));
  });

  it('emits no warnings when forEach matches tokens normally', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] });
    const effects: readonly EffectAST[] = [{
      forEach: {
        bind: '$item',
        over: {
          query: 'tokensInZone' as const,
          zone: z1,
          filter: [{ prop: 'faction', op: 'eq' as const, value: 'US' }],
        },
        effects: [],
      },
    }];
    applyEffects(effects, ctx);
    assert.equal(ctx.collector!.warnings.length, 0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/test/unit/execution-warnings.test.js`
Expected: FAIL — `warnings` not emitted (collector.warnings stays empty)

**Step 3: Add warning emissions**

In `src/kernel/effects.ts`:

1. Add import: `import { emitWarning, emitTrace } from './execution-collector.js';`

2. In `applyForEach` (after line 1118 `const queryResult = evalQuery(...)`), add:
   ```typescript
   if (queryResult.length === 0) {
     emitWarning(ctx.collector, {
       code: 'ZERO_EFFECT_ITERATIONS',
       message: `forEach bind=${effect.forEach.bind} matched 0 items in query`,
       context: { bind: effect.forEach.bind },
       hint: 'enable trace:true for effect execution details',
     });
   }
   ```

3. After `const boundedItems = queryResult.slice(0, limit)` (line 1119), add:
   ```typescript
   if (boundedItems.length === 0 && queryResult.length > 0) {
     emitWarning(ctx.collector, {
       code: 'ZERO_EFFECT_ITERATIONS',
       message: `forEach bind=${effect.forEach.bind} limit=${limit} truncated ${queryResult.length} matches to 0`,
       context: { bind: effect.forEach.bind, limit, matchCount: queryResult.length },
     });
   }
   ```

In `src/kernel/eval-query.ts`:

1. Add import: `import { emitWarning } from './execution-collector.js';`

2. In the `tokensInZone` case of `evalQuery`, after filtering, add:
   ```typescript
   // After filtering tokens but before returning
   if (filtered.length === 0 && allTokens.length > 0) {
     emitWarning(ctx.collector, {
       code: 'EMPTY_QUERY_RESULT',
       message: `tokensInZone in ${zone} matched 0 of ${allTokens.length} tokens after filtering`,
       context: { zone, totalTokens: allTokens.length, filterCount: query.filter?.length ?? 0 },
       hint: 'enable trace:true to see filter predicates vs token props',
     });
   }
   ```

In `src/kernel/eval-value.ts`:

1. Add import: `import { emitWarning } from './execution-collector.js';`

2. In the binding ref resolution path, when value is `undefined`:
   ```typescript
   emitWarning(ctx.collector, {
     code: 'BINDING_UNDEFINED',
     message: `ref binding '${name}' resolved to undefined`,
     context: { name, availableBindings: Object.keys(ctx.bindings) },
     hint: 'enable trace:true to see full binding scope',
   });
   ```

Note: The exact insertion points in `eval-query.ts` and `eval-value.ts` depend on the local variable names. Read the function bodies carefully and insert after the filtering/resolution step but before the return.

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/test/unit/execution-warnings.test.js`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass. Existing tests that don't supply `collector` to `EffectContext` will have `collector: undefined`, and `emitWarning(undefined, ...)` is a no-op.

**Step 6: Commit**

```bash
git add src/kernel/effects.ts src/kernel/eval-query.ts src/kernel/eval-value.ts test/unit/execution-warnings.test.ts
git commit -m "feat: emit runtime warnings for zero-match forEach, empty queries, undefined bindings"
```

---

### Task 5: Add trace emissions to kernel

**Files:**
- Modify: `src/kernel/effects.ts` (forEach, moveToken, setTokenProp, addVar/setVar, createToken handlers)
- Modify: `src/kernel/eval-query.ts` (query result trace)
- Modify: `src/kernel/eval-value.ts` (conditional branch trace)
- Test: `test/unit/execution-trace.test.ts`

**Step 1: Write the failing test**

Create `test/unit/execution-trace.test.ts`:

```typescript
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  type ZoneDef,
} from '../../src/kernel/index.js';

// Reuse same setup as execution-warnings test (minimal def, zone setup, makeCtx).
// Copy the minimalDef, z1, z2, makeCtx from Task 4 test and adapt makeCtx to pass trace:true.

describe('Effect execution trace', () => {
  it('traces forEach iteration count', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] }, {}, true);
    const effects: readonly EffectAST[] = [{
      forEach: {
        bind: '$item',
        over: { query: 'tokensInZone' as const, zone: z1, filter: [] },
        effects: [],
      },
    }];
    applyEffects(effects, ctx);
    const trace = ctx.collector!.trace!;
    const forEachEntry = trace.find((e) => e.kind === 'forEach');
    assert.ok(forEachEntry);
    assert.equal(forEachEntry.matchCount, 1);
    assert.equal(forEachEntry.iteratedCount, 1);
  });

  it('traces moveToken with from and to zones', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] }, { $tok: token }, true);
    const effects: readonly EffectAST[] = [{
      moveToken: { token: '$tok', from: z1, to: z2 },
    }];
    applyEffects(effects, ctx);
    const trace = ctx.collector!.trace!;
    const moveEntry = trace.find((e) => e.kind === 'moveToken');
    assert.ok(moveEntry);
    assert.equal(moveEntry.tokenId, 't1');
    assert.equal(moveEntry.from, z1);
    assert.equal(moveEntry.to, z2);
  });

  it('traces setTokenProp with old and new values', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] }, { $tok: token }, true);
    const effects: readonly EffectAST[] = [{
      setTokenProp: { token: '$tok', prop: 'faction', value: 'NVA' },
    }];
    applyEffects(effects, ctx);
    const trace = ctx.collector!.trace!;
    const propEntry = trace.find((e) => e.kind === 'setTokenProp');
    assert.ok(propEntry);
    assert.equal(propEntry.oldValue, 'US');
    assert.equal(propEntry.newValue, 'NVA');
  });

  it('produces no trace entries when trace is disabled', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] }, { $tok: token }, false);
    const effects: readonly EffectAST[] = [{
      moveToken: { token: '$tok', from: z1, to: z2 },
    }];
    applyEffects(effects, ctx);
    assert.equal(ctx.collector!.trace, null);
  });
});
```

(The full `makeCtx` helper should be copied from Task 4 and adapted to accept a `trace` parameter.)

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/test/unit/execution-trace.test.js`
Expected: FAIL — trace entries not emitted

**Step 3: Add trace emissions**

In `src/kernel/effects.ts`, after each effect handler's core logic, add `emitTrace` calls:

1. **forEach** (after line 1136, after the for loop completes):
   ```typescript
   emitTrace(ctx.collector, {
     kind: 'forEach',
     bind: effect.forEach.bind,
     matchCount: queryResult.length,
     limit: effect.forEach.limit !== undefined ? limit : undefined,
     iteratedCount: boundedItems.length,
   });
   ```

2. **moveToken** (after the token is moved between zones):
   ```typescript
   emitTrace(ctx.collector, {
     kind: 'moveToken',
     tokenId: String(tokenId),
     from: String(fromZoneId),
     to: String(toZoneId),
   });
   ```

3. **setTokenProp** (after the prop is changed):
   ```typescript
   emitTrace(ctx.collector, {
     kind: 'setTokenProp',
     tokenId: String(tokenId),
     prop,
     oldValue: currentValue,
     newValue: evaluatedValue,
   });
   ```

4. **addVar/setVar** (after the variable is updated):
   ```typescript
   emitTrace(ctx.collector, {
     kind: 'varChange',
     scope: 'global',
     varName,
     oldValue: previousValue,
     newValue: clampedValue,
   });
   ```

5. **createToken** (after the token is created):
   ```typescript
   emitTrace(ctx.collector, {
     kind: 'createToken',
     tokenId: String(newToken.id),
     type: newToken.type,
     zone: String(resolvedZone),
   });
   ```

In `src/kernel/eval-query.ts`, in the `tokensInZone` query handler:
   ```typescript
   emitTrace(ctx.collector, {
     kind: 'queryResult',
     queryType: 'tokensInZone',
     zone: String(zoneId),
     filterSummary: JSON.stringify(query.filter ?? []),
     matchCount: filtered.length,
   });
   ```

In `src/kernel/eval-value.ts`, in the `if/then/else` handler:
   ```typescript
   emitTrace(ctx.collector, {
     kind: 'conditional',
     branch: condResult ? 'then' : 'else',
     conditionSummary: JSON.stringify(expr.if.when),
   });
   ```

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/test/unit/execution-trace.test.js`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/kernel/effects.ts src/kernel/eval-query.ts src/kernel/eval-value.ts test/unit/execution-trace.test.ts
git commit -m "feat: emit effect execution trace entries for moveToken, setTokenProp, forEach, varChange, createToken, queries, conditionals"
```

---

### Task 6: Thread collector through simulator

**Files:**
- Modify: `src/sim/simulator.ts` (lines 28-108 — `runGame`)
- Modify: `src/kernel/types.ts` (if `GameTrace` needs updating — check if `MoveLog` was already updated in Task 1)
- Test: `test/integration/sim/simulator.test.ts` — verify existing tests pass

**Step 1: Update `runGame` signature**

In `src/sim/simulator.ts`:

1. Add import: `import type { ExecutionOptions } from '../kernel/index.js';`
2. Change `runGame` signature (line 28):
   ```typescript
   export const runGame = (
     def: GameDef,
     seed: number,
     agents: readonly Agent[],
     maxTurns: number,
     playerCount?: number,
     options?: ExecutionOptions,
   ): GameTrace => {
   ```
3. Pass `options` to `applyMove` (line 86):
   ```typescript
   const applied = applyMove(def, state, selected.move, options);
   ```
4. Include warnings and trace in MoveLog push (line 89-96):
   ```typescript
   moveLogs.push({
     stateHash: state.stateHash,
     player,
     move: selected.move,
     legalMoveCount: legal.length,
     deltas: computeDeltas(preState, state),
     triggerFirings: applied.triggerFirings,
     warnings: applied.warnings,
     ...(applied.effectTrace !== undefined ? { effectTrace: applied.effectTrace } : {}),
   });
   ```
5. Update `runGames` (line 110-116) to thread options:
   ```typescript
   export const runGames = (
     def: GameDef,
     seeds: readonly number[],
     agents: readonly Agent[],
     maxTurns: number,
     playerCount?: number,
     options?: ExecutionOptions,
   ): readonly GameTrace[] => seeds.map((seed) => runGame(def, seed, agents, maxTurns, playerCount, options));
   ```

**Step 2: Build and run tests**

Run: `npm run build && npm test`
Expected: All tests pass. Simulator tests that inspect `MoveLog` may need updates if they destructure or assert on the shape.

**Step 3: Commit**

```bash
git add src/sim/simulator.ts
git commit -m "feat: thread ExecutionOptions through simulator for runtime warnings and tracing"
```

---

### Task 7: Migrate test diagnostic assertions

**Files:**
- Modify: ~30 test files that use `deepEqual(compiled.diagnostics, [])` or `filter(d => severity === 'error').length === 0`

**Step 1: Identify all files to migrate**

Search for:
- `deepEqual(compiled.diagnostics, [])` or `deepEqual(result.diagnostics, [])` → replace with `assertNoDiagnostics`
- `diagnostics.filter(d => d.severity === 'error').length, 0` → replace with `assertNoErrors`

**Step 2: Migrate in batches**

For each file:
1. Add import: `import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';` (adjust relative path)
2. Replace `assert.deepEqual(compiled.diagnostics, [])` with `assertNoDiagnostics(compiled, parsed.sourceMap)` (when sourceMap is available) or `assertNoDiagnostics(compiled)` (when not)
3. Replace `assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0)` with `assertNoErrors(parsed)`

Process files in this order (unit tests first, then integration):
- Unit: `compile-zones.test.ts`, `compile-effects.test.ts`, `compile-conditions.test.ts`, `compile-top-level.test.ts`, `compile-actions.test.ts`, `compiler-api.test.ts`, `expand-macros.test.ts`, `serde.test.ts`, `initial-state.test.ts`, `data-assets.test.ts`, `property/compiler.property.test.ts`
- Unit (production data): `fitl-production-*.test.ts` files
- Integration: `fitl-coin-operations.test.ts`, `fitl-insurgent-operations.test.ts`, `fitl-us-arvn-special-activities.test.ts`, `fitl-nva-vc-special-activities.test.ts`, `fitl-joint-operations.test.ts`, `fitl-card-flow-determinism.test.ts`, `fitl-removal-ordering.test.ts`, `fitl-production-data-compilation.test.ts`, `fitl-events-*.test.ts`, `fitl-coup-victory.test.ts`, `compile-pipeline.test.ts`, `sim/simulator.test.ts`, `parse-validate-full-spec.test.ts`

**Step 3: Build and run tests after each batch**

Run: `npm run build && npm test`
Expected: All tests pass after each batch

**Step 4: Commit after each batch**

```bash
git commit -m "refactor: migrate unit test diagnostic assertions to helpers"
git commit -m "refactor: migrate integration test diagnostic assertions to helpers"
```

---

### Task 8: Migrate EffectContext construction in tests

**Files:**
- Modify: ~17 test files that construct `EffectContext` manually

**Step 1: Identify all files**

Search for `EffectContext` or patterns like `{ def, adjacencyGraph, state, rng, activePlayer, actorPlayer, bindings, moveParams }` in test files.

**Step 2: Add collector to each construction**

For each file:
1. Add import: `import { createCollector } from '../../src/kernel/execution-collector.js';` (adjust path)
2. Add `collector: createCollector()` to every `EffectContext` construction

**Step 3: Make `collector` required on `EffectContext`**

After all tests are migrated, change `src/kernel/effect-context.ts`:
```typescript
readonly collector?: ExecutionCollector;  // change to:
readonly collector: ExecutionCollector;
```

**Step 4: Build and run full test suite**

Run: `npm run build && npm test`
Expected: All tests pass. TypeScript will catch any `EffectContext` construction that's missing `collector`.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: add collector to all EffectContext construction sites, make collector required"
```

---

### Task 9: Final verification and cleanup

**Files:**
- All modified files

**Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Typecheck**

Run: `npm run typecheck`
Expected: Clean, no errors

**Step 3: Lint**

Run: `npm run lint`
Expected: Clean, no errors (fix any lint issues from new code)

**Step 4: Full test suite**

Run: `npm test`
Expected: All tests pass

**Step 5: Verify tracing works end-to-end**

Manually verify by temporarily adding `{ trace: true }` to one FITL integration test's `applyMove` call and checking the trace output contains expected entries.

**Step 6: Final commit if any cleanup was needed**

```bash
git commit -m "chore: final cleanup for execution tracing infrastructure"
```
