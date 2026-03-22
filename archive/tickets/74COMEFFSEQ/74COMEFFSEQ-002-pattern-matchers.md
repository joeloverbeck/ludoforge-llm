# 74COMEFFSEQ-002: Effect Compiler Pattern Matchers

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: 74COMEFFSEQ-001

## Problem

The compiled-effect pipeline needs a structural classifier that can answer two questions safely and deterministically:

1. Which `EffectAST` nodes are simple enough to compile directly in Phase 1?
2. What normalized information does code generation need from those nodes without re-parsing raw AST every time?

The classifier must fit the current kernel AST, preserve game-agnostic behavior, and avoid a combinatorial explosion of one-off pattern types.

## Assumption Reassessment (2026-03-21)

1. `EffectAST` is not a `{ kind: ... }` discriminated union. It is a keyed union where each node shape is `{ readonly setVar: ... }`, `{ readonly if: ... }`, `{ readonly forEach: ... }`, etc., defined in `packages/engine/src/kernel/types-ast.ts`. Confirmed.
2. `ValueExpr` literals are represented as raw scalars (`number | boolean | string`), not `{ literal: ... }`. References use structured `{ ref: ... }` objects. Confirmed.
3. `ConditionAST` comparisons use operators `==`, `!=`, `<`, `<=`, `>`, `>=`, with control operators `and`, `or`, and `not`. The `if` effect stores its predicate in `if.when`, not `if.condition`. Confirmed.
4. `forEach` iterates via `forEach.over: OptionsQuery`, not a legacy `{ query: ... }` field on the effect root. The Phase 1 player loop target is `{ query: 'players' }`. Confirmed.
5. `setVar` / `addVar` target scoped endpoints shaped by `ScopedVarPayloadContract`; scopes are `global`, `pvar`, and `zoneVar`, with `var` as the field name. Confirmed.
6. `gotoPhaseExact.phase` is a raw string in the AST today, even though compiled-effect runtime contracts already brand phase ids at the `CompiledEffectSequence` level. Confirmed.
7. The current codebase already contains `effect-compiler-types.ts` and `GameDefRuntime.compiledLifecycleEffects` from ticket 001. This ticket should build on that contract rather than redefining it. Confirmed.
8. Engine tests run from built `dist/` output. Focused unit runs therefore require `pnpm -F @ludoforge/engine build` first, then `node --test dist/test/unit/...`. Confirmed from `packages/engine/package.json`.

## Architecture Check

1. The original ticket’s descriptor list (`SetVarGlobalLiteralPattern`, `SetVarGlobalRefPattern`, etc.) is too brittle. It bakes operand combinations into top-level types, which will sprawl as soon as additional scopes or operand forms are added.
2. A cleaner architecture is to normalize the classifier into a small set of effect families plus reusable operand descriptors:
   - effect families: `setVar`, `addVar`, `if`, `forEachPlayers`, `gotoPhaseExact`
   - reusable sub-descriptors: simple value operands, simple scoped targets, simple comparisons
3. This keeps code generation extensible. Ticket 003 can switch on a normalized descriptor shape instead of accumulating more one-off matcher functions for every scope/value combination.
4. Pattern matching remains strictly game-agnostic because it only inspects AST structure and generic kernel contracts (Foundation 1).
5. The classifier must be total over valid AST input: unknown or non-compilable shapes return `null`, never throw. Fallback to the interpreter remains the safety boundary (Foundations 9 and 10).

## What to Change

### 1. Create `effect-compiler-patterns.ts`

Add a new kernel-internal module:

- `packages/engine/src/kernel/effect-compiler-patterns.ts`

Define normalized descriptor types for Phase 1:

```typescript
export type SimpleValuePattern =
  | { readonly kind: 'literal'; readonly value: number | boolean | string }
  | { readonly kind: 'gvar'; readonly varName: ScopedVarNameExpr }
  | { readonly kind: 'pvar'; readonly player: PlayerSel; readonly varName: ScopedVarNameExpr }
  | { readonly kind: 'binding'; readonly name: string; readonly displayName?: string };

export type SimpleScopedTargetPattern =
  | { readonly scope: 'global'; readonly varName: ScopedVarNameExpr }
  | { readonly scope: 'pvar'; readonly player: PlayerSel; readonly varName: ScopedVarNameExpr };

export interface SimpleComparisonPattern {
  readonly kind: 'comparison';
  readonly op: '==' | '!=' | '<' | '<=' | '>' | '>=';
  readonly left: SimpleValuePattern;
  readonly right: SimpleValuePattern;
}

export interface LogicalConditionPattern {
  readonly kind: 'logical';
  readonly op: 'and' | 'or';
  readonly args: readonly CompilableConditionPattern[];
}

export type CompilableConditionPattern =
  | SimpleComparisonPattern
  | LogicalConditionPattern;

export type PatternDescriptor =
  | {
      readonly kind: 'setVar';
      readonly target: SimpleScopedTargetPattern;
      readonly value: SimpleValuePattern;
    }
  | {
      readonly kind: 'addVar';
      readonly target: SimpleScopedTargetPattern;
      readonly delta: Exclude<SimpleValuePattern, { readonly kind: 'literal'; readonly value: string | boolean }>;
    }
  | {
      readonly kind: 'if';
      readonly condition: CompilableConditionPattern;
      readonly thenEffects: readonly EffectAST[];
      readonly elseEffects: readonly EffectAST[];
    }
  | {
      readonly kind: 'forEachPlayers';
      readonly bind: string;
      readonly effects: readonly EffectAST[];
      readonly limit?: NumericValueExpr;
      readonly countBind?: string;
      readonly inEffects?: readonly EffectAST[];
    }
  | {
      readonly kind: 'gotoPhaseExact';
      readonly phase: string;
    };
```

### 2. Implement normalized matcher helpers

Add pure helpers that classify the reusable building blocks:

- `matchSimpleValue(expr: ValueExpr): SimpleValuePattern | null`
- `matchSimpleScopedTarget(payload: SetVarPayload | AddVarPayload): SimpleScopedTargetPattern | null`
- `matchCompilableCondition(condition: ConditionAST): CompilableConditionPattern | null`
- `isCompilableCondition(condition: ConditionAST): boolean`

Rules:

- literals: raw `number | boolean | string`
- simple refs allowed in Phase 1:
  - `{ ref: 'gvar', var }`
  - `{ ref: 'pvar', player, var }`
  - `{ ref: 'binding', name, displayName? }`
- exclude aggregates, arithmetic, `if` value expressions, `zoneVar`, `tokenProp`, `assetField`, marker refs, and any other complex reference forms
- only `global` and `pvar` targets are Phase 1 compilable; `zoneVar` is explicitly non-compilable in this ticket
- logical conditions only compile when every nested argument compiles to a simple comparison or nested logical condition; `not`, `in`, adjacency/connectivity, marker, and zone-property predicates remain fallback-only for Phase 1

### 3. Implement top-level effect matchers

Add pure effect-level matchers:

- `matchSetVar(node: EffectAST): Extract<PatternDescriptor, { readonly kind: 'setVar' }> | null`
- `matchAddVar(node: EffectAST): Extract<PatternDescriptor, { readonly kind: 'addVar' }> | null`
- `matchIf(node: EffectAST): Extract<PatternDescriptor, { readonly kind: 'if' }> | null`
- `matchForEachPlayers(node: EffectAST): Extract<PatternDescriptor, { readonly kind: 'forEachPlayers' }> | null`
- `matchGotoPhaseExact(node: EffectAST): Extract<PatternDescriptor, { readonly kind: 'gotoPhaseExact' }> | null`

Matching rules:

- `matchSetVar`
  - matches only `setVar` targeting `global` or `pvar`
  - value must be `matchSimpleValue(...) !== null`
- `matchAddVar`
  - matches only `addVar` targeting `global` or `pvar`
  - delta must resolve to a numeric literal, `gvar`, `pvar`, or `binding`
- `matchIf`
  - `if.when` must compile via `matchCompilableCondition`
  - preserve raw `then` / `else` child effect arrays for ticket 003 to compile recursively
  - normalize missing `else` to `[]`
- `matchForEachPlayers`
  - matches only `{ forEach: { over: { query: 'players' }, ... } }`
  - preserves `bind`, `effects`, and optional `limit`, `countBind`, `in`
  - does not attempt to classify the body here; recursive compilation is a later stage
- `matchGotoPhaseExact`
  - matches any `gotoPhaseExact` node with a string phase target

### 4. Implement classifier orchestration and coverage

Add:

- `classifyEffect(node: EffectAST): PatternDescriptor | null`
- `computeCoverageRatio(effects: readonly EffectAST[]): number`

`classifyEffect` tries the effect-level matchers in a stable order and returns the first normalized descriptor or `null`.

`computeCoverageRatio` must:

1. walk the full effect tree recursively
2. count every effect node in the tree
3. count a node as compilable only when `classifyEffect(node) !== null`
4. include nested `if.then`, `if.else`, `forEach.effects`, and `forEach.in`
5. return `1` for an empty sequence because there is nothing to fall back from

The ratio is a diagnostic metric only. It does not decide execution semantics.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify only if the pattern module needs to be exported for downstream tickets or tests)

## Out of Scope

- Code generation (74COMEFFSEQ-003)
- Compiler orchestration / fragment composition (74COMEFFSEQ-004)
- Runtime cache population or lifecycle dispatch integration (74COMEFFSEQ-005)
- Debug verification mode (74COMEFFSEQ-006)
- Phase 2 patterns such as `zoneVar`, `let`, `reduce`, `evaluateSubset`, `nextInOrderByCondition`, `aggregate`, `moveAll`, `removeByPriority`
- Any changes to effect handler semantics, registry wiring, or runtime behavior

## Acceptance Criteria

### Tests That Must Pass

1. `matchSimpleValue` recognizes raw scalar literals and simple `gvar` / `pvar` / `binding` refs, and rejects aggregates, arithmetic expressions, and unsupported ref kinds.
2. `matchSetVar` recognizes a `setVar` over `global` or `pvar` with a simple value expression, and rejects `zoneVar` targets or complex values.
3. `matchAddVar` recognizes numeric `addVar` patterns and rejects non-numeric or unsupported operand shapes.
4. `matchIf` recognizes `if.when` comparisons and nested `and` / `or` trees built entirely from compilable comparisons, and rejects unsupported operators such as `not` or `in`.
5. `matchForEachPlayers` recognizes only `forEach.over = { query: 'players' }` and rejects other queries.
6. `matchGotoPhaseExact` recognizes a phase-target string and returns a normalized descriptor.
7. `classifyEffect` returns the correct `kind` for each Phase 1 compilable effect family and `null` for non-compilable effects such as `chooseOne`, `moveToken`, `rollRandom`, `reduce`, or `zoneVar` writes.
8. `computeCoverageRatio` returns:
   - `1` for an empty sequence
   - `1` for a fully compilable sequence
   - a fractional value for mixed trees
   - correct nested counts for `if` and `forEach`
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Matchers are pure and side-effect free.
2. `classifyEffect` never throws for valid `EffectAST`; unsupported shapes return `null`.
3. Descriptor output is normalized around reusable operand/condition structures, not a growing matrix of one-off case types.
4. Coverage ratio is always in `[0, 1]`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts`
   - covers helper matchers, effect matchers, classifier dispatch, and recursive coverage accounting against real AST shapes from `types-ast.ts`

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/kernel/effect-compiler-patterns.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Added `packages/engine/src/kernel/effect-compiler-patterns.ts` with normalized Phase 1 classifier descriptors for `setVar`, `addVar`, `if`, `forEachPlayers`, and `gotoPhaseExact`.
  - Implemented reusable helper matchers for simple values, numeric values, scoped targets, and compilable conditions so later code generation can consume stable normalized descriptors instead of reparsing raw AST.
  - Added `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` covering helper matchers, effect matchers, classifier dispatch, and recursive coverage accounting using the current keyed AST shapes.
  - Corrected the ticket itself before implementation so its assumptions, examples, and test commands match the real engine AST and test workflow.
- Deviations from original plan:
  - The original ticket assumed a stale `{ kind: ... }` AST, `{ literal: ... }` value wrappers, and effect-local pattern types such as `SetVarGlobalLiteralPattern`. The final implementation replaced that with a normalized descriptor model built from reusable operand and condition sub-patterns because it is cleaner, less repetitive, and more extensible for tickets 003 and 004.
  - The final implementation kept the new module kernel-internal instead of exporting it through the public barrel because no current downstream consumer requires a public surface for these internals yet.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test dist/test/unit/kernel/effect-compiler-patterns.test.js` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm -F @ludoforge/engine test` failed for a repo-preexisting reason unrelated to this ticket: after a clean engine build, the default lane references many `dist/test/unit/*.js` files that are not present in `dist/`, producing widespread `MODULE_NOT_FOUND` failures outside the new classifier write set.
