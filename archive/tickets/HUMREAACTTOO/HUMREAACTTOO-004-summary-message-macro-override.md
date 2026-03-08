# HUMREAACTTOO-004: SummaryMessage + Macro Override

**Status**: DONE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new IR type, normalizer-compound update, content planner update, template realizer update
**Deps**: None

## Problem

After macro expansion, the `tryMacroOverride` function produces a `SetMessage` when a verbalization summary exists. This is semantically wrong — a macro summary is not a "set variable" operation. Additionally, macro summaries don't support `{slotName}` interpolation from `VerbalizationMacroEntry.slots`, so parameterized macro descriptions (e.g., "Place {piece} from Available") can't be rendered.

## Assumption Reassessment (2026-03-08)

1. `SummaryMessage` type does not exist in `tooltip-ir.ts` — **verified** (grep returns no matches).
2. `tryMacroOverride` exists in `tooltip-normalizer-compound.ts` — **verified**.
3. `VerbalizationMacroEntry` in `verbalization-types.ts` has a `slots` field — **needs verification at implementation time** (spec says it already exists).
4. `SUB_STEP_HEADER_BY_KIND` in `tooltip-content-planner.ts` does not include `'summary'` — **verified**.
5. `realizeSummary` does not exist in `tooltip-template-realizer.ts` — **verified** (grep returns no matches).

## Architecture Check

1. Adding `SummaryMessage` is a clean semantic type — it represents "this macro does X" rather than misusing `SetMessage`.
2. Slot interpolation is generic — it replaces `{key}` patterns using the macro entry's `slots` map, no game-specific logic.
3. Adding `'summary'` to the content planner and realizer follows the same pattern used for all other message kinds.

## What to Change

### 1. Add `SummaryMessage` to `tooltip-ir.ts`

```typescript
interface SummaryMessage extends MessageBase {
  readonly kind: 'summary';
  readonly text: string;
  readonly macroClass?: string;
}
```

Add `SummaryMessage` to the `TooltipMessage` union type. Add `'summary'` to `TOOLTIP_MESSAGE_KINDS`.

### 2. Update `tryMacroOverride` in `tooltip-normalizer-compound.ts`

- Produce `SummaryMessage` instead of `SetMessage` when a macro has a verbalization summary.
- Implement `{slotName}` interpolation: replace `{key}` placeholders in the summary text using `VerbalizationMacroEntry.slots`.
- Set `macroClass` from the macro entry's `class` field.

### 3. Add `'summary'` to `SUB_STEP_HEADER_BY_KIND` in `tooltip-content-planner.ts`

Use contextual header from `macroClass` if available, otherwise default to a generic header like `"Summary"`.

### 4. Add `realizeSummary` to `tooltip-template-realizer.ts`

Simple template: `realizeSummary(msg) => msg.text`. Add dispatch entry in the main realize function.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add `SummaryMessage` to union and kinds)
- `packages/engine/src/kernel/tooltip-normalizer-compound.ts` (modify — update `tryMacroOverride`)
- `packages/engine/src/kernel/tooltip-content-planner.ts` (modify — add `'summary'` to `SUB_STEP_HEADER_BY_KIND`)
- `packages/engine/src/kernel/tooltip-template-realizer.ts` (modify — add `realizeSummary` + dispatch)

## Out of Scope

- `tooltip-value-stringifier.ts` extraction (HUMREAACTTOO-001)
- Modifier humanizer ref type coverage (HUMREAACTTOO-002)
- `SelectMessage.target` expansion (HUMREAACTTOO-003)
- Binding name sanitization (HUMREAACTTOO-005)
- Runner UI components
- Authoring new verbalization macro entries in game data files

## Acceptance Criteria

### Tests That Must Pass

1. Updated `tooltip-ir.test.ts`: `SummaryMessage` can be constructed with `kind: 'summary'`, `text`, and optional `macroClass`.
2. Updated `tooltip-normalizer-compound.test.ts`: `tryMacroOverride` with a macro that has a verbalization summary → produces `SummaryMessage` (not `SetMessage`).
3. Updated `tooltip-normalizer-compound.test.ts`: `tryMacroOverride` with `{slotName}` in summary and matching `slots` entry → interpolated text.
4. Updated `tooltip-content-planner.test.ts`: `SummaryMessage` is assigned a sub-step header from `SUB_STEP_HEADER_BY_KIND`.
5. Updated `tooltip-template-realizer.test.ts`: `realizeSummary` returns `msg.text` unchanged.
6. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`

### Invariants

1. Macro overrides that previously produced `SetMessage` now produce `SummaryMessage` — the English output should be the same text, just with a correct semantic type.
2. Macros without verbalization summaries are unaffected.
3. `SummaryMessage` is part of the `TooltipMessage` union — all pipeline stages (planner, realizer) handle it.
4. No game-specific logic in macro override — slot interpolation is generic string replacement.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-ir.test.ts` — add `SummaryMessage` construction test.
2. `packages/engine/test/unit/kernel/tooltip-normalizer-compound.test.ts` — add macro override → `SummaryMessage` tests.
3. `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` — add `'summary'` header mapping test.
4. `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — add `realizeSummary` test.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
