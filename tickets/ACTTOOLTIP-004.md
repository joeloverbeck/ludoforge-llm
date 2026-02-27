# ACTTOOLTIP-004: Extract bindDisplay helper and DRY annotation boilerplate

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/ast-to-display.ts`, `packages/engine/src/cnl/expand-effect-macros.ts`
**Deps**: ACTTOOLTIP-002 (applies bindDisplay to removeByPriority)

## Problem

Two DRY violations exist in the current implementation:

### A. Scattered `macroOrigin?.stem ?? bind` pattern in ast-to-display.ts

Seven rendering paths in `effectToDisplayNodes` repeat the same pattern:

```typescript
ref(effect.forEach.macroOrigin?.stem ?? effect.forEach.bind, 'binding')
ref(effect.reduce.macroOrigin?.stem ?? effect.reduce.itemBind, 'binding')
ref(effect.let.macroOrigin?.stem ?? effect.let.bind, 'binding')
ref(effect.bindValue.macroOrigin?.stem ?? effect.bindValue.bind, 'binding')
ref(effect.chooseOne.macroOrigin?.stem ?? effect.chooseOne.bind, 'binding')
ref(effect.chooseN.macroOrigin?.stem ?? effect.chooseN.bind, 'binding')
ref(effect.rollRandom.macroOrigin?.stem ?? effect.rollRandom.bind, 'binding')
```

When a new effect type with `bind` + `macroOrigin` is added, a developer must remember to apply the same fallback pattern. A forgotten fallback silently renders hygienic names.

### B. Repeated macroOrigin annotation boilerplate in expand-effect-macros.ts

The `annotateControlFlowMacroOrigins` function has ~100 lines (890-987) of nearly identical code for annotating `let`, `bindValue`, `chooseOne`, `chooseN`, `rollRandom`, `transferVar`, `removeByPriority`, and `evaluateSubset`. Each block: checks if the node has the effect key, extracts the bind field, looks up origin, checks trusted/same-origin, spreads and marks trusted. The pattern is repeated 3 times (data-driven loop, removeByPriority block, evaluateSubset block) with minor variations.

## Assumption Reassessment (2026-02-27)

1. `ast-to-display.ts` has 7 `macroOrigin?.stem ?? ...bind` occurrences — confirmed by diff review.
2. `expand-effect-macros.ts` lines 890-987 contain 3 structural blocks with the same check-lookup-annotate pattern — confirmed by diff review.
3. `EffectMacroOrigin` type is `{ macroId: string; stem: string }` — confirmed in `types-ast.ts`.
4. All effect types with `macroOrigin` follow the same annotation semantics (lookup bind in `originByBinding`, set `macroOrigin` with trusted marker) — confirmed.

## Architecture Check

1. Extracting helpers centralizes the display-name policy and annotation logic. If the policy changes (e.g. adding a prefix, or handling collisions), there's exactly one place to update.
2. No game-specific logic. These are generic engine utilities for display rendering and macro expansion.
3. No backwards-compatibility shims.

## What to Change

### 1. Extract `bindDisplay` helper in ast-to-display.ts

Add a module-private helper:

```typescript
function bindDisplay(bind: string, macroOrigin?: EffectMacroOrigin): string {
  return macroOrigin?.stem ?? bind;
}
```

Replace all 7 occurrences of `macroOrigin?.stem ?? ...bind` with calls to `bindDisplay(bind, macroOrigin)`.

### 2. Extract `annotateEffectMacroOrigin` helper in expand-effect-macros.ts

Add a helper that encapsulates the check-lookup-annotate pattern:

```typescript
function annotateEffectMacroOrigin(
  node: Record<string, unknown>,
  effectKey: string,
  bindFields: readonly string[],
  originByBinding: ReadonlyMap<string, MacroBindingOrigin>,
): { node: Record<string, unknown>; changed: boolean }
```

This function:
1. Checks if `node[effectKey]` is a record
2. Searches `bindFields` for the first bind value present in `originByBinding`
3. Checks trusted/same-origin
4. Returns updated node + changed flag

Replace the data-driven loop (lines 890-922), `removeByPriority` block (924-957), and `evaluateSubset` block (960-987) with calls to this helper:

```typescript
// Simple bind-field effects
for (const [effectKey, bindFields] of BIND_EFFECT_SPECS) {
  const result = annotateEffectMacroOrigin(rewrittenNode, effectKey, bindFields, originByBinding);
  if (result.changed) { rewrittenNode = result.node; changed = true; }
}
```

Where `BIND_EFFECT_SPECS` is a static table:

```typescript
const BIND_EFFECT_SPECS: readonly [string, readonly string[]][] = [
  ['let', ['bind']],
  ['bindValue', ['bind']],
  ['chooseOne', ['bind']],
  ['chooseN', ['bind']],
  ['rollRandom', ['bind']],
  ['transferVar', ['actualBind']],
  ['removeByPriority', ['remainingBind']],  // groups handled via nested search
  ['evaluateSubset', ['subsetBind', 'resultBind', 'bestSubsetBind']],
];
```

For `removeByPriority` groups, the helper would also search `groups[].bind` as a fallback if no top-level bind matches.

## Files to Touch

- `packages/engine/src/kernel/ast-to-display.ts` (modify)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)

## Out of Scope

- Changing the annotation semantics or adding new effect types
- Refactoring `annotateBindingDisplayNames` (already clean and DRY)
- Adding per-group macroOrigin to `removeByPriority` types

## Acceptance Criteria

### Tests That Must Pass

1. All existing `ast-to-display.test.ts` tests pass unchanged (behavior-preserving refactor).
2. All existing `expand-effect-macros.test.ts` tests pass unchanged.
3. Full engine suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Display output for every effect type is byte-for-byte identical before and after the refactor.
2. Macro origin annotation produces the same AST structure before and after.
3. No new public API surfaces are created — helpers are module-private.

## Test Plan

### New/Modified Tests

1. No new tests — this is a pure refactor. Existing tests provide full coverage of the behavior being consolidated.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
