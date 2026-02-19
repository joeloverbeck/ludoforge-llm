# VISCONF-003: Add Vite YAML loader and visual config loading pipeline

**Spec**: 42 (Per-Game Visual Config)
**Priority**: P1
**Depends on**: VISCONF-001 (Zod schema for validation)
**Blocks**: VISCONF-004 (render model wiring needs a loaded config)

---

## Summary

Add a Vite YAML plugin so `visual-config.yaml` files can be imported at build time. Create a loader module that validates the parsed YAML against the Zod schema from VISCONF-001 and returns a typed `VisualConfig | null`.

---

## Files to create

| File | Purpose |
|------|---------|
| `packages/runner/src/config/visual-config-loader.ts` | Load + validate + return typed VisualConfig |
| `packages/runner/test/config/visual-config-loader.test.ts` | Unit tests for loader |

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/package.json` | Add `@modyfi/vite-plugin-yaml` (or `vite-plugin-yaml`) as devDependency |
| `packages/runner/vite.config.ts` | Register YAML plugin |

---

## Detailed requirements

### Vite plugin

Add a YAML plugin to the Vite config so that `import config from './path/to/file.yaml'` returns a parsed JS object. The plugin must handle YAML 1.2 parsing.

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

### Invariants

- The loader never throws — it always returns `VisualConfig | null`
- Invalid YAML gracefully falls back to `null` with a console warning
- The YAML plugin is registered only in the runner's Vite config, not in the engine
- `pnpm -F @ludoforge/runner typecheck` passes (including YAML import declarations)
- `pnpm -F @ludoforge/runner test` passes
- `pnpm -F @ludoforge/runner build` succeeds (Vite can resolve YAML imports)
