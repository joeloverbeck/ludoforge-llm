# ACTTOOSYS-001: DisplayNode Type System

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new type module in `packages/engine/src/kernel/`
**Deps**: None

## Problem

The action tooltip system needs a serializable display model to represent hierarchical AST structures for rendering in the UI. This model must be Comlink-safe (plain objects with primitives only, no class instances or functions) so it can cross the worker–main-thread boundary via structured clone. No such type system currently exists.

## Assumption Reassessment (2026-02-27)

1. `packages/engine/src/kernel/runtime.ts` is a barrel-export module with `export * from './<module>.js'` lines. New modules are added by appending an export line. Confirmed — currently has ~58 export lines.
2. The kernel exports no display/presentation types today. Confirmed — all existing types are AST, state, or evaluation types.
3. Comlink structured-clone constraint: only plain objects with primitives, arrays, and nested plain objects. Confirmed — `packages/runner/src/worker/` uses `Comlink.wrap`/`Comlink.expose` and all returned data must be structured-clone-safe.

## Architecture Check

1. Placing display types in `packages/engine/src/kernel/` keeps the AST → display conversion engine-side, game-agnostic, and reusable by any frontend. The runner imports types via `@ludoforge/engine/runtime`.
2. DisplayNode is a plain data structure with no game-specific knowledge. It describes rendering structure (groups, lines, inline tokens) without knowing what game is being displayed.
3. No backwards-compatibility shims — this is a brand-new module.

## What to Change

### 1. Create `packages/engine/src/kernel/display-node.ts`

Define the complete DisplayNode type system as a discriminated union on `kind`:

- `DisplayGroupNode` — `kind: 'group'`, has `label: string`, optional `icon: string`, `children: DisplayNode[]`, optional `collapsible: boolean`
- `DisplayLineNode` — `kind: 'line'`, has `indent: number`, `children: DisplayInlineNode[]`
- `DisplayKeywordNode` — `kind: 'keyword'`, has `text: string`
- `DisplayOperatorNode` — `kind: 'operator'`, has `text: string`
- `DisplayValueNode` — `kind: 'value'`, has `text: string`, optional `valueType: 'number' | 'boolean' | 'string'`
- `DisplayReferenceNode` — `kind: 'reference'`, has `text: string`, `refKind: string`
- `DisplayPunctuationNode` — `kind: 'punctuation'`, has `text: string`
- `DisplayAnnotationNode` — `kind: 'annotation'`, has `annotationType: 'pass' | 'fail' | 'value' | 'usage'`, `text: string`

Union types:
- `DisplayInlineNode = DisplayKeywordNode | DisplayOperatorNode | DisplayValueNode | DisplayReferenceNode | DisplayPunctuationNode | DisplayAnnotationNode`
- `DisplayNode = DisplayGroupNode | DisplayLineNode | DisplayInlineNode`
- `DisplayNodeKind = 'group' | 'line' | 'keyword' | 'operator' | 'value' | 'reference' | 'punctuation' | 'annotation'`

Also define the annotated action description container:
```typescript
interface LimitUsageInfo {
  readonly scope: 'turn' | 'phase' | 'game';
  readonly max: number;
  readonly current: number;
}

interface AnnotatedActionDescription {
  readonly sections: readonly DisplayGroupNode[];
  readonly limitUsage: readonly LimitUsageInfo[];
}
```

All interfaces should use `readonly` modifiers consistent with the kernel's immutability convention.

### 2. Export from `packages/engine/src/kernel/runtime.ts`

Append one line:
```typescript
export * from './display-node.js';
```

## Files to Touch

- `packages/engine/src/kernel/display-node.ts` (new)
- `packages/engine/src/kernel/runtime.ts` (modify — add one export line)

## Out of Scope

- AST-to-DisplayNode conversion logic (ACTTOOSYS-002)
- Live condition annotation logic (ACTTOOSYS-003)
- Worker API, runner components, or any UI code
- Any game-specific logic or FITL/Texas Hold'em references

## Acceptance Criteria

### Tests That Must Pass

1. Type-check: importing all DisplayNode types from `@ludoforge/engine/runtime` compiles without errors.
2. Structured-clone round-trip: a hand-built `AnnotatedActionDescription` with nested groups/lines/inline nodes survives `structuredClone()` and deep-equals the original. (Test in `packages/engine/test/unit/kernel/display-node.test.ts`)
3. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions.
4. Build: `pnpm -F @ludoforge/engine build` — no errors.

### Invariants

1. All DisplayNode types are plain objects with string/number/boolean/array fields only — no functions, classes, or Symbols.
2. The `kind` discriminant is present on every node type and is a string literal.
3. `runtime.ts` export ordering is alphabetical (matching existing convention).
4. No circular imports introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/display-node.test.ts` — structured-clone round-trip test, type discriminant exhaustiveness check (build a node of each kind, verify `kind` field).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
