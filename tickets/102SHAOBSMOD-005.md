# 102SHAOBSMOD-005: Add CompiledObserverCatalog types and wire into GameDef

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `types-core.ts`, `schemas-core.ts`, `compiler-core.ts`
**Deps**: `tickets/102SHAOBSMOD-004.md`, `specs/102-shared-observer-model.md`

## Problem

The compiled observer types (`CompiledObserverProfile`, `CompiledObserverCatalog`) must exist in `types-core.ts` for the compiler and all clients to reference. The `GameDef` must include an `observers` field. The `compiler-core.ts` pipeline must call `lowerObservers()` before `lowerAgents()` and pass the catalog downstream.

## Assumption Reassessment (2026-04-01)

1. `GameDef` is defined in `packages/engine/src/kernel/types-core.ts` at line 687 — confirmed. It has `agents?: AgentPolicyCatalog` but no `observers` field.
2. `compiler-core.ts` calls `lowerAgents()` at line 672 — confirmed. `lowerObservers()` must be called before this.
3. `schemas-core.ts` defines Zod schemas for `GameDef` — confirmed. New types need corresponding Zod schemas.
4. `CompiledSurfaceCatalog` (renamed in ticket 001) is the surface catalog type that `CompiledObserverProfile.surfaces` will use.

## Architecture Check

1. Types are placed in `types-core.ts` alongside existing compiled types — consistent placement.
2. `GameDef.observers` is optional — specs without `observability:` produce `undefined`, preserving backward compatibility without a shim.
3. Pipeline ordering (`lowerObservers` before `lowerAgents`) ensures the observer catalog is available when agents resolve their observer references (ticket 006).

## What to Change

### 1. Add compiled observer types to `packages/engine/src/kernel/types-core.ts`

```typescript
export interface CompiledObserverProfile {
  readonly fingerprint: string;
  readonly surfaces: CompiledSurfaceCatalog;
  // RESERVED for Spec 106:
  // readonly zones?: CompiledZoneVisibilityCatalog;
}

export interface CompiledObserverCatalog {
  readonly schemaVersion: 1;
  readonly catalogFingerprint: string;
  readonly observers: Readonly<Record<string, CompiledObserverProfile>>;
  readonly defaultObserverName: string;
}
```

### 2. Add `observers` to `GameDef`

Add `readonly observers?: CompiledObserverCatalog;` to the `GameDef` interface.

### 3. Add Zod schemas to `packages/engine/src/kernel/schemas-core.ts`

Add Zod schemas for `CompiledObserverProfile` and `CompiledObserverCatalog`. Add `observers` to the `GameDef` Zod schema as optional.

### 4. Wire `lowerObservers()` into `packages/engine/src/cnl/compiler-core.ts`

- Import `lowerObservers` from `compile-observers.ts`
- Call `lowerObservers(spec.observability, diagnostics, { knownGlobalVarIds, knownPerPlayerVarIds, knownDerivedMetricIds })` before `lowerAgents()`
- Pass the resulting `CompiledObserverCatalog | undefined` into `lowerAgents()` (for ticket 006 to consume)
- Set `gameDef.observers` to the compiled catalog (or omit if undefined)

### 5. Collect known surface IDs for per-variable validation

The compiler must gather known variable IDs from the spec (globalVars, perPlayerVars, derivedMetrics) and pass them to `lowerObservers()`. Determine where in the pipeline these are already available and thread them through.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)

## Out of Scope

- Agent profile observer resolution — that is ticket 006
- Removing `agents.visibility` — that is ticket 006
- GameDef JSON schema artifact update — that is ticket 008
- Runner or simulator consuming the observer catalog — follow-up specs

## Acceptance Criteria

### Tests That Must Pass

1. A spec with `observability:` section compiles to a `GameDef` with `observers` field populated
2. A spec without `observability:` section compiles to a `GameDef` without `observers` field
3. `GameDef` Zod schema validates a GameDef with `observers` field
4. `GameDef` Zod schema validates a GameDef without `observers` field (optional)
5. `pnpm turbo typecheck` passes
6. Existing specs compile unchanged

### Invariants

1. `lowerObservers()` is called before `lowerAgents()` in the pipeline
2. `CompiledObserverCatalog.schemaVersion` is always `1`
3. `observers` is optional on `GameDef` — no breaking change for existing GameDef consumers

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compiler-core-observers.test.ts` — verify pipeline ordering and GameDef output shape
2. `packages/engine/test/integration/observer-compilation-e2e.test.ts` — end-to-end: YAML with observability → compile → GameDef with observers

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type correctness
3. `pnpm turbo build` — build succeeds
