# VISCONF2-005: Variables Panel Formatting

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only change
**Deps**: None

## Problem

The visual config schema defines rich variables configuration at `packages/runner/src/config/visual-config-types.ts:129-146`:

```typescript
const VariablePanelSchema = z.object({
  name: z.string(),
  vars: z.array(z.string()),
});

const VariableFormattingSchema = z.object({
  type: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
  labels: z.array(z.string()).optional(),
  suffix: z.string().optional(),
});

const VariablesConfigSchema = z.object({
  prominent: z.array(z.string()).optional(),
  panels: z.array(VariablePanelSchema).optional(),
  formatting: z.record(z.string(), VariableFormattingSchema).optional(),
});
```

The `VisualConfigProvider` exposes `getVariablesConfig()`, but the `VariablesPanel` component at `packages/runner/src/ui/VariablesPanel.tsx` never consumes it. Variables are rendered only in the default Global + Per Player layout with raw values.

Current architecture already threads a `VisualConfigProvider` instance through bootstrap (`App` -> `GameContainer`) and into canvas/store flows. The missing piece is UI access from `VariablesPanel` without widening all overlay panel props.

## Assumption Corrections

1. A new provider instance is **not** required at app bootstrap. `visualConfigProvider` already exists and is stable in `GameContainer`.
2. Context wiring belongs in the UI layer (`GameContainer`) rather than app root bootstrapping.
3. Tests should validate behavior using runner UI/component tests; mutating real FITL YAML only to satisfy an integration assertion is not required for this ticket.
4. Existing variable-change highlighting (`rowChanged`) is part of current behavior and must be preserved.

## What to Change

### 1. Create VisualConfigContext

**File**: `packages/runner/src/config/visual-config-context.ts` (new)

Create a React context:
```typescript
import { createContext } from 'react';
import type { VisualConfigProvider } from './visual-config-provider.js';

export const VisualConfigContext = createContext<VisualConfigProvider | null>(null);
```

### 2. Provide context in `GameContainer`

**File**: `packages/runner/src/ui/GameContainer.tsx`

Wrap the rendered UI tree with `VisualConfigContext.Provider`, passing the existing `visualConfigProvider` prop. Keep `GameContainer` as the composition root for overlay UI concerns.

### 3. Wire variables config into VariablesPanel

**File**: `packages/runner/src/ui/VariablesPanel.tsx`

Consume `VisualConfigContext` and the `VariablesConfig` from it:

#### Prominent variables
- If `variables.prominent` is defined, render those variables in a highlighted section at the top of the panel (e.g., with a distinct CSS class for larger font or bold)
- Prominent vars are still part of the full list but also appear in the highlight section

#### Panel grouping
- If `variables.panels` is defined, group variables into named sections instead of the flat Global/Per Player split
- Each panel has a `name` (section title) and `vars` (list of variable names to include)
- Variables not in any panel appear in an "Other" section at the bottom
- If no panels are defined, fall back to current Global / Per Player layout
- Within grouped sections, preserve per-player disambiguation in row keys and labels so duplicate variable names remain deterministic.

#### Variable formatting
- If `variables.formatting[varName]` is defined for a variable:
  - `type: "percentage"` → display value with `%` suffix
  - `type: "enum"` + `labels` → map numeric value to label string (e.g., `0 → "Low"`, `1 → "Medium"`)
  - `suffix` → append suffix string after value (e.g., `" pts"`)
  - `min`/`max` → optionally render a mini progress bar or range indicator
- If no formatting is defined, display raw value as current behavior
- Formatting must not break existing value-change highlighting behavior.

### 4. Add CSS for prominent variables

**File**: `packages/runner/src/ui/VariablesPanel.module.css`

Add styles:
- `.prominent` — highlighted variable row (bolder, slightly larger)
- `.panelGroup` — grouped panel section with title
- `.progressBar` — optional mini bar for min/max bounded variables

## Invariants

1. When no `variables` config exists in visual config, the panel renders identically to current behavior.
2. `VisualConfigContext` value of `null` means no visual config — all formatting/grouping is skipped.
3. Prominent variables appear in both the highlight section and their normal position.
4. Panel grouping is mutually exclusive with the current Global/Per Player layout — if panels are defined, they replace it.
5. Formatting is applied per-variable and is backward-compatible (missing formatting = raw value display).
6. The `VisualConfigContext.Provider` is added at `GameContainer` so overlay components can opt in without prop drilling.
7. Existing row change-detection highlighting remains intact for both default and grouped layouts.

## Tests

1. **Unit — VisualConfigContext default is null**: Verify the context's default value is `null`.
2. **Unit — VariablesPanel without config renders current layout**: Mount panel with `VisualConfigContext` = `null`, verify Global/Per Player sections render as before.
3. **Unit — prominent variables highlighted**: Mount with config containing `prominent: ["aid"]`, verify a `.prominent` element exists for the "aid" variable.
4. **Unit — panel grouping replaces flat layout**: Mount with config containing `panels: [{name: "Resources", vars: ["aid", "patronage"]}]`, verify a "Resources" section heading appears and contains those variables.
5. **Unit — ungrouped variables in "Other" section**: Mount with panels that don't cover all variables, verify remaining variables appear in an "Other" section.
6. **Unit — formatting percentage**: Mount with `formatting: {aid: {type: "percentage"}}` and `aid` value `75`, verify displayed text includes `75%`.
7. **Unit — formatting enum labels**: Mount with `formatting: {support: {type: "enum", labels: ["None", "Passive", "Active"]}}` and value `1`, verify displayed text is `Passive`.
8. **Unit — formatting suffix**: Mount with `formatting: {score: {suffix: " pts"}}` and value `42`, verify displayed text is `42 pts`.
9. **Unit — rowChanged still works with formatting/grouping enabled**: Re-render with updated value and verify changed row keeps highlight class.
10. **Integration — GameContainer provides visual config context**: Render `GameContainer` with a non-null provider and verify `VariablesPanel` can consume config without receiving new props.
11. **Regression**: Existing VariablesPanel tests still pass.

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Added `VisualConfigContext` at `packages/runner/src/config/visual-config-context.ts`.
  - Wired context provision in `packages/runner/src/ui/GameContainer.tsx` using the existing `visualConfigProvider`.
  - Updated `packages/runner/src/ui/VariablesPanel.tsx` to consume variables config for:
    - prominent rows,
    - named panel grouping plus `Other`,
    - formatting (`percentage`, `enum` labels, `suffix`) and bounded range indicator.
  - Extended `packages/runner/src/ui/VariablesPanel.module.css` with prominent/group/progress styles.
  - Added/updated tests in:
    - `packages/runner/test/config/visual-config-context.test.ts`
    - `packages/runner/test/ui/VariablesPanel.test.ts`
    - `packages/runner/test/ui/GameContainer.test.ts`
- **Deviations from original plan**:
  - Context is provided in `GameContainer` (UI composition root) instead of `App` root to avoid bootstrap churn and keep UI concerns localized.
  - No FITL YAML fixture mutation was required; behavior is covered via provider-backed UI tests.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
