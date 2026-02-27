# ACTTOOLTIP-002: Use macroOrigin.stem for removeByPriority group bind rendering

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/ast-to-display.ts`
**Deps**: None

## Problem

The `removeByPriority` effect rendering in `ast-to-display.ts` (line 476) displays each group's `bind` field as a raw string:

```typescript
ref(g.bind, 'binding')
```

When the bind name is a hygienic macro-expanded name (e.g. `$__macro_betting_round_0_target`), it renders verbatim in the tooltip. Other effect types (`forEach`, `let`, `chooseOne`, etc.) already use `macroOrigin?.stem ?? bind` to show the human-friendly stem. The `removeByPriority` groups are an inconsistent gap.

## Assumption Reassessment (2026-02-27)

1. `removeByPriority` groups each have a `bind` field and optional `countBind` field — confirmed in `types-ast.ts` lines 333, 358.
2. `macroOrigin` was added to the parent `removeByPriority` node (line 360), not to individual groups — confirmed.
3. The current `annotateControlFlowMacroOrigins` in `expand-effect-macros.ts` (lines 924-957) sets `macroOrigin` on the parent by looking up `remainingBind` and then falling back to the first group's `bind` — confirmed.
4. Groups do not have their own `macroOrigin` field in the type system. The parent's `macroOrigin.stem` is a single stem derived from whichever bind was found first.

## Architecture Check

1. Using the parent's `macroOrigin?.stem` as a fallback for group bind display is the simplest approach and consistent with how other effects work. An alternative (adding per-group `macroOrigin`) would require type/schema changes for marginal benefit since in practice all groups within a single `removeByPriority` come from the same macro expansion.
2. This is a rendering-only change in the generic display layer. No game-specific logic.
3. No backwards-compatibility shims.

## What to Change

### 1. Use parent macroOrigin.stem for group bind display

In `packages/engine/src/kernel/ast-to-display.ts`, the `removeByPriority` rendering block (line 476), change:

```typescript
ref(g.bind, 'binding')
```

to use the `bindDisplay` helper (see ACTTOOLTIP-004) or inline:

```typescript
ref(effect.removeByPriority.macroOrigin?.stem ?? g.bind, 'binding')
```

Note: If the parent `macroOrigin` has a single stem, it will be shared across groups. This is acceptable since groups within one macro expansion share the same origin context.

### 2. Add test for removeByPriority stem rendering

Add a test in `ast-to-display.test.ts` that creates a `removeByPriority` effect with `macroOrigin` and verifies group binds render with the stem.

## Files to Touch

- `packages/engine/src/kernel/ast-to-display.ts` (modify)
- `packages/engine/test/unit/kernel/ast-to-display.test.ts` (modify)

## Out of Scope

- Adding per-group `macroOrigin` fields to the type system
- Rendering `countBind` or `remainingBind` (neither is currently displayed)
- Rendering `evaluateSubset` bind fields (those are not displayed at all currently — separate concern)

## Acceptance Criteria

### Tests That Must Pass

1. New test: `removeByPriority` with `macroOrigin` renders group bind as stem name, not hygienic name.
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. When `macroOrigin` is absent, group binds render as their raw `bind` string (no regression).
2. All other effect type rendering remains unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/ast-to-display.test.ts` — Add test: "renders removeByPriority group bind with macroOrigin.stem". Creates effect with `macroOrigin: { macroId: 'cleanup', stem: 'target' }` and a group with hygienic bind name, asserts the rendered reference text is `'target'`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/kernel/ast-to-display.test.js`
2. `pnpm -F @ludoforge/engine test`
