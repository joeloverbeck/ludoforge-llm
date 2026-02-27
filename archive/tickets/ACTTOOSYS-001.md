# ACTTOOSYS-001: DisplayNode Type System

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new type module in `packages/engine/src/kernel/`
**Deps**: None

## Problem

The action tooltip system needs a serializable display model to represent hierarchical AST structures for rendering in the UI. This model must be Comlink-safe (plain objects with primitives only, no class instances or functions) so it can cross the worker–main-thread boundary via structured clone. No such type system currently exists.

## Assumption Reassessment (2026-02-27)

1. `packages/engine/src/kernel/runtime.ts` is a barrel-export module with `export * from './<module>.js'` lines. New modules are added by appending an export line. Currently has 57 export lines. Exports are **domain-grouped**, not alphabetical.
2. The kernel exports no display/presentation types today. Confirmed — all existing types are AST, state, or evaluation types.
3. Comlink structured-clone constraint: only plain objects with primitives, arrays, and nested plain objects. Confirmed — `packages/runner/src/worker/` uses `import { wrap } from 'comlink'` / `import { expose } from 'comlink'` and all returned data must be structured-clone-safe.
4. `LimitDef` already exists in `types-core.ts:124-127` with `{ scope: 'turn' | 'phase' | 'game'; max: number }`. `LimitUsageInfo` should extend `LimitDef` to avoid duplicating the scope union and max field.

## Architecture Check

1. Placing display types in `packages/engine/src/kernel/` keeps the AST → display conversion engine-side, game-agnostic, and reusable by any frontend. The runner imports types via `@ludoforge/engine/runtime`.
2. DisplayNode is a plain data structure with no game-specific knowledge. It describes rendering structure (groups, lines, inline tokens) without knowing what game is being displayed.
3. No backwards-compatibility shims — this is a brand-new module.
4. `LimitUsageInfo extends LimitDef` — DRY, single source of truth for scope values, keeps them from drifting apart.

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
// Extends LimitDef from types.js (scope + max) with runtime current count
interface LimitUsageInfo extends LimitDef {
  readonly current: number;
}

interface AnnotatedActionDescription {
  readonly sections: readonly DisplayGroupNode[];
  readonly limitUsage: readonly LimitUsageInfo[];
}
```

All interfaces should use `readonly` modifiers consistent with the kernel's immutability convention.

### 2. Export from both kernel barrel files

The kernel has two barrel files: `index.ts` (used by tests and internal imports) and `runtime.ts` (used by the runner via `@ludoforge/engine/runtime`). Both need the export:

```typescript
// Append to both index.ts and runtime.ts:
export * from './display-node.js';
```

## Files to Touch

- `packages/engine/src/kernel/display-node.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add one export line)
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
3. `runtime.ts` export is appended at the end (matching existing domain-grouped convention — NOT alphabetical).
4. No circular imports introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/display-node.test.ts` — structured-clone round-trip test, type discriminant exhaustiveness check (build a node of each kind, verify `kind` field).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

**Changed vs originally planned:**

1. **`LimitUsageInfo` extends `LimitDef`** — ticket originally defined `scope` and `max` inline, duplicating `LimitDef` from `types-core.ts`. Fixed to use `extends LimitDef` with only `current` added. DRY, single source of truth.
2. **Two barrel files, not one** — ticket only mentioned `runtime.ts`, but tests import from `index.ts`. Both barrel files now export `display-node.js`.
3. **Export ordering** — ticket claimed alphabetical; actual convention is domain-grouped. Export appended at end of both files.

**Files created/modified:**
- `packages/engine/src/kernel/display-node.ts` (new — 8 node interfaces, 3 union types, `LimitUsageInfo`, `AnnotatedActionDescription`)
- `packages/engine/src/kernel/index.ts` (1 line added)
- `packages/engine/src/kernel/runtime.ts` (1 line added)
- `packages/engine/test/unit/kernel/display-node.test.ts` (new — 11 tests across 5 suites)

**Verification:** Build, 11/11 new tests pass, typecheck (engine + runner), lint — all green. Pre-existing FITL 1968 US-first test failure confirmed on main (not introduced).
