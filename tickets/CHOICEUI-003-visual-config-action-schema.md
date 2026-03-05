# CHOICEUI-003: Visual Config Action Schema and Provider Methods

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None -- runner-only
**Deps**: None

## Problem

Action and choice option display names are currently auto-derived from IDs via `formatIdAsDisplayName()`. This produces reasonable but imprecise names (e.g., "Us Train" instead of "Train", "Target Spaces" instead of "Select spaces to train in"). Game designers need control over action labels, decision prompts, and choice option display names through the visual config system.

## Assumption Reassessment (2026-03-05)

1. `VisualConfigSchema` in `visual-config-types.ts` (line 298) does not currently have an `actions` section.
2. `VisualConfigProvider` in `visual-config-provider.ts` has no action/choice lookup methods.
3. The existing schema pattern uses `z.record(z.string(), ...)` for keyed lookups (e.g., `tokenTypes`, `factions`).
4. Provider methods consistently return `null` for missing config, letting callers apply fallbacks.

## Architecture Check

1. Follows the established visual config pattern: schema defines optional sections, provider exposes typed lookup methods returning `null` for fallback.
2. Keeps game-specific display labels in YAML data, not engine code -- preserves engine agnosticism.
3. No backwards-compatibility concerns; `actions` is a new optional section.

## What to Change

### 1. Add action/choice schemas to `visual-config-types.ts`

Add three new schemas before `VisualConfigSchema`:

```typescript
const ActionChoiceOptionVisualSchema = z.object({
  displayName: z.string().optional(),
});

const ActionChoiceVisualSchema = z.object({
  prompt: z.string().optional(),
  description: z.string().optional(),
  options: z.record(z.string(), ActionChoiceOptionVisualSchema).optional(),
});

const ActionVisualSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  choices: z.record(z.string(), ActionChoiceVisualSchema).optional(),
});
```

Add to `VisualConfigSchema`:
```typescript
actions: z.record(z.string(), ActionVisualSchema).optional(),
```

Export derived types:
```typescript
export type ActionChoiceOptionVisual = z.infer<typeof ActionChoiceOptionVisualSchema>;
export type ActionChoiceVisual = z.infer<typeof ActionChoiceVisualSchema>;
export type ActionVisual = z.infer<typeof ActionVisualSchema>;
```

### 2. Add provider methods to `VisualConfigProvider`

Four new public methods:

- `getActionDisplayName(actionId: string): string | null` -- returns `this.config?.actions?.[actionId]?.displayName ?? null`
- `getActionDescription(actionId: string): string | null` -- returns `this.config?.actions?.[actionId]?.description ?? null`
- `getChoicePrompt(actionId: string, paramName: string): string | null` -- returns `this.config?.actions?.[actionId]?.choices?.[paramName]?.prompt ?? null`
- `getChoiceOptionDisplayName(actionId: string, paramName: string, optionValue: string): string | null` -- returns `this.config?.actions?.[actionId]?.choices?.[paramName]?.options?.[optionValue]?.displayName ?? null`

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)

## Out of Scope

- Adding FITL-specific action labels to `visual-config.yaml` (CHOICEUI-004).
- Using the new provider methods in `derive-render-model.ts` (CHOICEUI-006).
- Adding action tooltip rendering in UI components.
- Modifying `render-model.ts` types.
- Changing any engine code.

## Acceptance Criteria

### Tests That Must Pass

1. Schema accepts a valid `actions` section with nested `choices`, `options`, `prompt`, `description`, and `displayName` fields.
2. Schema rejects `actions` with invalid field types (e.g., `displayName: 42`).
3. Schema accepts config with no `actions` section (backward compatible).
4. `getActionDisplayName` returns configured string or `null` for missing config.
5. `getActionDescription` returns configured string or `null`.
6. `getChoicePrompt` returns configured string or `null` for missing action, missing choice, or missing prompt.
7. `getChoiceOptionDisplayName` returns configured string or `null` for each missing level in the path.
8. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. All new provider methods return `null` (not `undefined`) when config is absent.
2. `VisualConfigSchema` remains a `z.object({...})` -- no structural change to the top-level shape.
3. Existing visual config YAML files (FITL, Texas Hold'em) continue to parse without errors (no `actions` section = valid).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` -- schema validation tests for `actions` section: valid config, missing section, invalid types.
2. `packages/runner/test/config/visual-config-provider.test.ts` -- unit tests for all four new provider methods: hit path, miss path at each level of nesting.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
