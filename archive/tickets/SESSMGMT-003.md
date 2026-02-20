# SESSMGMT-003: Data-Driven Visual Config Discovery for Bootstrap Registry (Spec 43 D2)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-002

## Reassessed Assumptions (2026-02-20)

1. Display metadata (`name`, `description`, player range) is already present in canonical game sources and propagated into bootstrap fixtures via `GameDef.metadata` from `GameSpecDoc`; duplicating those fields in `bootstrap-targets.json` creates a second source of truth.
2. `bootstrap-registry.ts` still hardcodes visual-config routing via target-id switch and hardcoded FITL/Texas imports, which violates the data-driven architecture expected by Spec 43 D2.
3. `visual-config-loader.ts` currently exports game-specific raw YAML constants (`FITL_VISUAL_CONFIG_YAML`, `TEXAS_VISUAL_CONFIG_YAML`) that couple shared config code to specific games.
4. Existing tests cover descriptor selection and bootstrap resolution, but do not fully assert the new invariant that visual-config resolution is derived from `generatedFromSpecPath` and supports no-config targets (default) without game-specific branches.

## Problem

Bootstrap visual-config resolution is hardcoded to known game ids. This makes onboarding new games require runner code changes even when `bootstrap-targets.json` and `data/games/<game>/visual-config.yaml` are present.

## Scope (Updated)

Implement data-driven visual-config discovery for bootstrap targets while keeping bootstrap metadata canonical and non-duplicated.

## What to Change

### 1. `packages/runner/src/bootstrap/bootstrap-registry.ts`

- Remove the hardcoded `resolveVisualConfigYaml(targetId)` switch.
- Remove imports of game-specific raw visual YAML from `config/index.ts`.
- Add a Vite glob for visual configs:

```ts
const VISUAL_CONFIG_BY_PATH = import.meta.glob('../../../../data/games/*/visual-config.yaml', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;
```

- Resolve visual config per target by mapping `generatedFromSpecPath` to `${generatedFromSpecPath}/visual-config.yaml` and returning `null` when absent.
- Keep `resolveVisualConfigYaml` synchronous (`() => unknown`) to avoid unnecessary async widening in bootstrap resolution.
- Keep manifest schema focused on routing/fixture linkage fields only (`id`, `queryValue`, `defaultSeed`, `defaultPlayerId`, `sourceLabel`, `fixtureFile`, `generatedFromSpecPath`). Do not add duplicated display metadata fields.

### 2. `packages/runner/src/config/visual-config-loader.ts`

- Delete hardcoded game-specific imports/exports:
  - `FITL_VISUAL_CONFIG_YAML`
  - `TEXAS_VISUAL_CONFIG_YAML`
- Keep generic parser/provider helpers only.

### 3. Tests

- Update bootstrap registry tests to validate:
  - descriptor selection invariants remain intact,
  - descriptor visual-config resolver returns config for FITL/Texas and `null` for default,
  - registry stays free of game-specific branching assumptions.
- Update visual-config-loader tests to remove dependence on deleted game-specific exports and keep only generic loader/provider behavior tests.
- If an invariant/edge case is exposed (for example, missing `generatedFromSpecPath` visual config), codify it with explicit tests.

## Files to Touch

- `packages/runner/src/bootstrap/bootstrap-registry.ts`
- `packages/runner/src/config/visual-config-loader.ts`
- `packages/runner/test/bootstrap/bootstrap-registry.test.ts`
- `packages/runner/test/config/visual-config-loader.test.ts`
- Any bootstrap config tests requiring minor updates

## Out of Scope

- Adding `name`, `description`, `playerMin`, `playerMax` to `bootstrap-targets.json`
- Engine schema/type changes
- Session router and game selection UI

## Architectural Assessment

The updated approach is more robust and extensible than both the current hardcoded switch and the original ticket proposal to duplicate display metadata in the manifest:

- Better than current code: `import.meta.glob` + `generatedFromSpecPath` removes per-game branches and makes new game onboarding data-only.
- Better than original ticket draft: keeping display metadata out of `bootstrap-targets.json` preserves a single canonical source (`GameSpecDoc` -> compiled `GameDef` -> fixtures) and prevents drift.
- Maintains strict agnostic-engine boundaries: no game-specific identifiers in shared runner config plumbing.

## Acceptance Criteria

### Tests That Must Pass

1. `assertBootstrapTargetDefinitions()` still validates canonical manifest fields and rejects malformed targets.
2. `assertBootstrapRegistry()` continues validating descriptor invariants.
3. `listBootstrapDescriptors()` returns expected ids/query values and usable visual-config resolvers.
4. Visual config resolution returns non-null for FITL and Texas via `generatedFromSpecPath` mapping.
5. Visual config resolution returns `null` for default (no visual config file).
6. `visual-config-loader` no longer exports game-specific raw YAML constants.
7. `pnpm -F @ludoforge/runner test` passes.
8. `pnpm -F @ludoforge/runner lint` passes.
9. `pnpm -F @ludoforge/runner typecheck` passes.

### Invariants

1. `bootstrap-targets.json` remains the single routing/fixture manifest, not a duplicate metadata catalog.
2. No game-specific import statements or id-based switch branches for visual config routing in bootstrap runtime code.
3. Adding a new game's visual config requires only:
   - `bootstrap-targets.json` entry with `generatedFromSpecPath`, and
   - `data/games/<game>/visual-config.yaml`.

## Outcome

- **Completion date**: 2026-02-20
- **What was changed**:
  - Replaced bootstrap visual-config id switch + hardcoded FITL/Texas imports with `import.meta.glob` discovery in `bootstrap-registry.ts`, keyed by `generatedFromSpecPath`.
  - Added robust path-suffix matching and duplicate-match guard for visual-config lookup.
  - Removed `FITL_VISUAL_CONFIG_YAML` and `TEXAS_VISUAL_CONFIG_YAML` from `visual-config-loader.ts`.
  - Updated bootstrap registry tests to assert FITL/Texas config discovery and default null behavior.
  - Updated visual-config-loader tests to validate only generic loader/provider behavior.
  - Reassessed and corrected ticket scope to avoid duplicating display metadata in `bootstrap-targets.json`.
- **Deviations from original plan**:
  - Did not add `name`, `description`, `playerMin`, `playerMax` to bootstrap manifest; metadata remains canonical in `GameSpecDoc`/compiled fixtures.
  - Kept `resolveVisualConfigYaml` synchronous because eager glob loading avoids async plumbing and keeps bootstrap API stable/clean.
- **Verification results**:
  - Targeted tests:
    - `pnpm -F @ludoforge/runner exec vitest run test/bootstrap/bootstrap-registry.test.ts test/bootstrap/resolve-bootstrap-config.test.ts test/config/visual-config-loader.test.ts`
  - Full runner gates:
    - `pnpm -F @ludoforge/runner test`
    - `pnpm -F @ludoforge/runner lint`
    - `pnpm -F @ludoforge/runner typecheck`
