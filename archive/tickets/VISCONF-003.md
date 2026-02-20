# VISCONF-003: Add Vite YAML loader and visual config loading pipeline
**Status**: ✅ COMPLETED

**Spec**: 42 (Per-Game Visual Config)
**Priority**: P1
**Depends on**: VISCONF-001 (Zod schema for validation)
**Blocks**: VISCONF-004 (render model wiring needs a loaded config)

---

## Summary

Runner already has `VisualConfigSchema`, `VisualConfigProvider`, defaults, and committed `visual-config.yaml` files (FITL + Texas Hold'em), but it does not yet have a Vite YAML import pipeline or loader utility.

Add a Vite YAML import path so `visual-config.yaml` files can be imported in runner code, then create a loader module that validates imported YAML against `VisualConfigSchema` and returns `VisualConfig | null` with graceful fallback behavior.

---

## Reassessed assumptions (2026-02-19)

The original ticket assumptions were partially outdated. Current codebase state:

- `packages/runner/src/config/visual-config-types.ts` exists and exports `VisualConfigSchema`.
- `packages/runner/src/config/visual-config-provider.ts` exists and is already covered by unit tests.
- `data/games/fire-in-the-lake/visual-config.yaml` and `data/games/texas-holdem/visual-config.yaml` exist and are validated by tests.
- `packages/runner/vite.config.ts` currently does **not** register a YAML plugin.
- There is currently no `packages/runner/src/config/visual-config-loader.ts`.
- There is currently no YAML module declaration under `packages/runner/src/types/`.

Ticket scope is therefore corrected to implement only the missing loader + import pipeline, without duplicating schema/provider work from VISCONF-001.

---

## Files to create

| File | Purpose |
|------|---------|
| `packages/runner/src/config/visual-config-loader.ts` | Load + validate + return typed VisualConfig |
| `packages/runner/test/config/visual-config-loader.test.ts` | Unit tests for loader |
| `packages/runner/src/types/yaml.d.ts` | TypeScript module declaration for YAML imports |

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/package.json` | Add a Vite YAML plugin dependency (if not already present) |
| `packages/runner/vite.config.ts` | Register YAML plugin |
| `packages/runner/src/config/index.ts` | Export loader functions |

---

## Detailed requirements

### Vite plugin

Add a YAML plugin to the Vite config so that `import config from './path/to/file.yaml'` returns a parsed JS object.

Preferred: `@modyfi/vite-plugin-yaml` (well-maintained, typed). Alternative: `vite-plugin-yaml`.

### visual-config-loader.ts

Export a single function:

```typescript
export function loadVisualConfig(rawYaml: unknown): VisualConfig | null
```

**Behavior**:
1. If `rawYaml` is `null` or `undefined`, return `null`.
2. Parse through `VisualConfigSchema.safeParse(rawYaml)`.
3. If parse succeeds, return the typed `VisualConfig`.
4. If parse fails, log a warning with Zod error details to `console.warn` and return `null` (graceful fallback — the runner must work without a valid config).

Also export a helper for the app entry point:

```typescript
export function createVisualConfigProvider(rawYaml: unknown): VisualConfigProvider
```

This is a convenience that calls `loadVisualConfig` then passes the result to `new VisualConfigProvider(config)`.

Also export typed raw YAML imports for shipped game configs:

- FITL visual config import
- Texas Hold'em visual config import

These should live in the loader module so future bootstrap wiring has one canonical loading surface.

### TypeScript YAML module declaration

If needed, add a `*.yaml` module declaration in `packages/runner/src/types/yaml.d.ts` (or augment existing declarations) so TypeScript accepts YAML imports without errors.

---

## Out of scope

- Creating the actual YAML files (VISCONF-002)
- Wiring the loaded config into any runner rendering code (VISCONF-004+)
- Modifying the App component or store to consume the provider
- Any engine changes

---

## Acceptance criteria

### Tests that must pass

**visual-config-loader.test.ts**:
1. `loadVisualConfig(null)` returns `null`
2. `loadVisualConfig(undefined)` returns `null`
3. `loadVisualConfig({ version: 1 })` returns a `VisualConfig` with version 1
4. `loadVisualConfig({ version: 1, factions: { us: { color: "#ff0000" } } })` returns config with faction color
5. `loadVisualConfig({ version: 2 })` returns `null` (invalid version) and logs warning
6. `loadVisualConfig("not an object")` returns `null` and logs warning
7. `createVisualConfigProvider(null)` returns a `VisualConfigProvider` that uses all defaults
8. `createVisualConfigProvider({ version: 1, factions: { us: { color: "#ff0000" } } })` returns a provider that resolves us faction color to "#ff0000"
9. Loader module exports raw FITL/Texas imports that can be validated by `VisualConfigSchema.safeParse` (smoke test for Vite YAML integration)

### Invariants

- The loader never throws — it always returns `VisualConfig | null`
- Invalid YAML gracefully falls back to `null` with a console warning
- The YAML plugin is registered only in the runner's Vite config, not in the engine
- `pnpm -F @ludoforge/runner typecheck` passes (including YAML import declarations)
- `pnpm -F @ludoforge/runner test` passes
- `pnpm -F @ludoforge/runner build` succeeds (Vite can resolve YAML imports)

---

## Architecture rationale

This ticket remains beneficial versus current architecture because it closes a missing boundary:

- Today, YAML parsing is test-only and ad hoc.
- After this ticket, runtime-facing config ingestion is centralized, validated, typed, and non-throwing.
- This keeps rendering/layout/animation wiring (VISCONF-004+) clean by depending on one loader/provider seam instead of scattered parsing.

---

## Outcome

**Completed**: 2026-02-19

**What was changed**
- Added Vite YAML plugin registration in `packages/runner/vite.config.ts`.
- Added YAML transform support to Vitest in `packages/runner/vitest.config.ts` so YAML imports are testable.
- Added `packages/runner/src/config/visual-config-loader.ts` with:
  - `loadVisualConfig(rawYaml): VisualConfig | null`
  - `createVisualConfigProvider(rawYaml): VisualConfigProvider`
  - exported raw FITL/Texas YAML imports for canonical load points
- Added TypeScript YAML module declarations in `packages/runner/src/types/yaml.d.ts`.
- Exported loader functions from `packages/runner/src/config/index.ts`.
- Added `packages/runner/test/config/visual-config-loader.test.ts` to cover null/invalid/valid parsing, provider creation, warning behavior, and YAML import pipeline smoke validation.

**Deviations from original plan**
- Added a Vitest plugin registration update even though it was not listed in the original file list, because without it YAML imports fail during tests.
- Kept existing `VisualConfig` interface and used a narrow loader-boundary cast from schema-validated data to satisfy `exactOptionalPropertyTypes`, avoiding broader type-system refactors outside this ticket.

**Verification**
- `pnpm -F @ludoforge/runner test` passed.
- `pnpm -F @ludoforge/runner typecheck` passed.
- `pnpm -F @ludoforge/runner build` passed.
- `pnpm -F @ludoforge/runner lint` passed.
