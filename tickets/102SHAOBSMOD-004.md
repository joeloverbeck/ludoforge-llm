# 102SHAOBSMOD-004: Create observer compilation (`compile-observers.ts`)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new `compile-observers.ts`
**Deps**: `archive/tickets/102SHAOBSMOD-003.md`, `specs/102-shared-observer-model.md`

## Problem

Observer profiles declared in GameSpecDoc YAML must be compiled into a `CompiledObserverCatalog` that all clients can consume. The compilation must handle defaults, shorthand expansion, `extends` inheritance, per-variable expansion, and fingerprinting. Built-in `omniscient` and `default` profiles must be synthesized.

## Assumption Reassessment (2026-04-01)

1. `lowerSurfaceVisibilityEntry` exists in `packages/engine/src/cnl/compile-agents.ts` — confirmed. This function can be reused for per-surface compilation.
2. `lowerSurfaceVisibility` exists in `compile-agents.ts` — confirmed. This orchestrates surface catalog creation and will be refactored to delegate to the observer catalog in ticket 006.
3. The defaults table in Spec 102 Part A matches the current `lowerSurfaceVisibility` defaults — must be verified at implementation time by reading `compile-agents.ts` in detail.
4. Fingerprinting pattern: the codebase uses content-hashing elsewhere (e.g., GameDef fingerprinting) — the same approach applies here.

## Architecture Check

1. New file with clear single responsibility: compile observer YAML into compiled observer profiles.
2. Reuses existing `lowerSurfaceVisibilityEntry` rather than duplicating surface compilation logic.
3. Game-agnostic: compiles any observer definition without game-specific knowledge.
4. Built-in profiles are synthesized in code, not declared in YAML — they are framework constants.

## What to Change

### 1. Create `packages/engine/src/cnl/compile-observers.ts`

Implement `lowerObservers(spec, diagnostics, options): CompiledObserverCatalog | undefined`:

**Parameters:**
- `spec`: the parsed `GameSpecObservabilitySection` (or null)
- `diagnostics`: diagnostic accumulator
- `options`: includes `knownGlobalVarIds`, `knownPerPlayerVarIds`, `knownDerivedMetricIds` for per-variable expansion

**Returns:**
- `undefined` if `observability` is null (runtime falls back to built-in defaults)
- `CompiledObserverCatalog` otherwise

**Algorithm per observer profile:**
1. If `extends` is set, resolve parent profile (already validated by ticket 003)
2. Start with system defaults for all surfaces (the defaults table from Spec 102 Part A)
3. Apply parent's surface overrides (if extends)
4. Apply this observer's surface overrides on top
5. For map-type surfaces, expand `_default` + per-id overrides against known IDs from options
6. Expand shorthand syntax: `surfaceName: 'public'` → `{ current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: <default> } }`
7. Reuse `lowerSurfaceVisibilityEntry` for each individual surface entry
8. Fingerprint the resolved `CompiledSurfaceCatalog`

**Built-in profiles:**
- `omniscient`: all surfaces `public`, all preview surfaces `public` with `allowWhenHiddenSampling: false`
- `default`: matches the system defaults table

**Catalog-level:**
- Include all user-defined + built-in profiles in `observers` map
- Set `defaultObserverName` to `'default'`
- Compute `catalogFingerprint` over entire catalog
- Set `schemaVersion: 1`

### 2. Export `lowerSurfaceVisibilityEntry` from `compile-agents.ts`

If `lowerSurfaceVisibilityEntry` is not already exported, export it so `compile-observers.ts` can reuse it. Alternatively, extract it to a shared utility if that is cleaner.

## Files to Touch

- `packages/engine/src/cnl/compile-observers.ts` (new)
- `packages/engine/src/cnl/compile-agents.ts` (modify — export `lowerSurfaceVisibilityEntry` or extract to shared)

## Out of Scope

- Wiring into `compiler-core.ts` pipeline — that is ticket 005
- Adding `CompiledObserverCatalog` types to `types-core.ts` — that is ticket 005
- Agent profile observer resolution — that is ticket 006
- Zone/token visibility compilation — Spec 106

## Acceptance Criteria

### Tests That Must Pass

1. **Defaults test**: observer with zero surface overrides produces catalog identical to `default` built-in
2. **Shorthand expansion**: `globalVars: 'public'` expands to full `{ current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } }`
3. **Extends test**: child observer inherits parent's resolved surfaces and overrides specific entries
4. **Per-variable expansion**: `perPlayerVars: { _default: 'seatVisible', resources: 'public' }` produces per-variable entries for all known perPlayerVar IDs
5. **Built-in omniscient**: all surfaces `public`, preview `allowWhenHiddenSampling: false`
6. **Built-in default**: matches system defaults table exactly
7. **Fingerprint determinism**: same input produces same fingerprint
8. **Null observability**: returns `undefined`

### Invariants

1. Compilation is pure — no side effects, deterministic output
2. Built-in profiles are always present in the catalog (even when user defines no observers)
3. `lowerSurfaceVisibilityEntry` reuse ensures surface compilation is consistent with existing agent compilation

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-observers.test.ts` — comprehensive compilation tests covering defaults, shorthand, extends, per-variable, built-ins, fingerprinting

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern compile-observers` — targeted tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness
