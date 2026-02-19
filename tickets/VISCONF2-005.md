# VISCONF2-005: Variables Panel Formatting

**Status**: PENDING
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

The `VisualConfigProvider` exposes `getVariablesConfig()` (line 112-114), but the `VariablesPanel` component at `packages/runner/src/ui/VariablesPanel.tsx` never consumes it. All variables are rendered in a flat list with no grouping, no prominent highlighting, and no formatting.

Currently, `VariablesPanel` receives only a `store` prop and reads `renderModel.globalVars` / `renderModel.playerVars` directly. There is no React context providing visual config to UI components.

## What to Change

### 1. Create VisualConfigContext

**File**: `packages/runner/src/config/VisualConfigContext.ts` (new)

Create a React context:
```typescript
import { createContext } from 'react';
import type { VisualConfigProvider } from './visual-config-provider.js';

export const VisualConfigContext = createContext<VisualConfigProvider | null>(null);
```

### 2. Provide context at app root

**File**: `packages/runner/src/App.tsx` (or wherever the provider tree is rooted)

Wrap the UI tree with `VisualConfigContext.Provider` passing the existing `VisualConfigProvider` instance. The provider is already constructed during bootstrap — thread it through.

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

#### Variable formatting
- If `variables.formatting[varName]` is defined for a variable:
  - `type: "percentage"` → display value with `%` suffix
  - `type: "enum"` + `labels` → map numeric value to label string (e.g., `0 → "Low"`, `1 → "Medium"`)
  - `suffix` → append suffix string after value (e.g., `" pts"`)
  - `min`/`max` → optionally render a mini progress bar or range indicator
- If no formatting is defined, display raw value as current behavior

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
6. The `VisualConfigContext.Provider` must be added above all UI components that might consume it.

## Tests

1. **Unit — VisualConfigContext default is null**: Verify the context's default value is `null`.
2. **Unit — VariablesPanel without config renders current layout**: Mount panel with `VisualConfigContext` = `null`, verify Global/Per Player sections render as before.
3. **Unit — prominent variables highlighted**: Mount with config containing `prominent: ["aid"]`, verify a `.prominent` element exists for the "aid" variable.
4. **Unit — panel grouping replaces flat layout**: Mount with config containing `panels: [{name: "Resources", vars: ["aid", "patronage"]}]`, verify a "Resources" section heading appears and contains those variables.
5. **Unit — ungrouped variables in "Other" section**: Mount with panels that don't cover all variables, verify remaining variables appear in an "Other" section.
6. **Unit — formatting percentage**: Mount with `formatting: {aid: {type: "percentage"}}` and `aid` value `75`, verify displayed text includes `75%`.
7. **Unit — formatting enum labels**: Mount with `formatting: {support: {type: "enum", labels: ["None", "Passive", "Active"]}}` and value `1`, verify displayed text is `Passive`.
8. **Unit — formatting suffix**: Mount with `formatting: {score: {suffix: " pts"}}` and value `42`, verify displayed text is `42 pts`.
9. **Integration — FITL variables config**: Add sample `variables` section to FITL visual config, verify it loads and panel renders grouped layout.
10. **Regression**: Existing VariablesPanel tests still pass.
