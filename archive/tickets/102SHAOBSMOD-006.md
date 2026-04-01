# 102SHAOBSMOD-006: Agent-observer binding (profile `observer` field, remove `agents.visibility`)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `game-spec-doc.ts`, `compile-agents.ts`, `validate-agents.ts`, `types-core.ts`
**Deps**: `archive/tickets/102SHAOBSMOD-005.md`, `specs/102-shared-observer-model.md`

## Problem

Agent profiles currently define visibility inline via `agents.visibility`. Per Spec 102 Part C, profiles must instead reference a named observer from the `observability.observers` catalog. The `agents.visibility` section must be removed entirely. The compiled `AgentPolicyCatalog.surfaceVisibility` field is retained as a derived field resolved from the observer catalog at compile time.

## Assumption Reassessment (2026-04-01)

1. `GameSpecAgentProfileDef` exists in `game-spec-doc.ts` at line 613 — confirmed. It has no `observer` field today.
2. `GameSpecAgentsSection` has `visibility?: GameSpecAgentVisibilitySection` at line 629 — confirmed. This will be removed.
3. `CompiledAgentProfile` exists in `types-core.ts` — confirmed. It has no `observerName` field today.
4. `AgentPolicyCatalog` has `surfaceVisibility` field — confirmed via `compile-agents.ts` grep. This field is retained and populated from the observer catalog.
5. `policy-runtime.ts` reads `input.catalog.surfaceVisibility` at line 178 — confirmed. This runtime path continues unchanged.
6. `validate-agents.ts` exists — confirmed. It will need to validate the `observer` field reference.

## Architecture Check

1. Decouples visibility definition (observer) from visibility consumption (agent profile). Agents reference observers by name — clean separation of concerns.
2. `surfaceVisibility` on `AgentPolicyCatalog` becomes a derived/resolved field, not a backwards-compatibility shim. It is computed from the observer catalog at compile time. The runtime path is unchanged.
3. Per FOUNDATIONS.md #14, `agents.visibility` is removed outright — no deprecated fallback.

## What to Change

### 1. Add `observer` field to `GameSpecAgentProfileDef` in `game-spec-doc.ts`

Add `readonly observer?: string;` — references a named observer in `observability.observers` or a built-in name.

### 2. Remove `visibility` from `GameSpecAgentsSection` in `game-spec-doc.ts`

Remove `readonly visibility?: GameSpecAgentVisibilitySection;` from `GameSpecAgentsSection`.

Remove or archive the `GameSpecAgentVisibilitySection` type if no other consumers reference it.

### 3. Add `observerName` to `CompiledAgentProfile` in `types-core.ts`

Add `readonly observerName?: string;` — key into `GameDef.observers`. `undefined` means the built-in `default` observer.

### 4. Update `compile-agents.ts`

- `lowerSurfaceVisibility()` becomes a thin wrapper: receives the `CompiledObserverCatalog` and resolves the catalog-level `surfaceVisibility` from the default observer's surfaces. If no observer catalog exists, fall back to existing default logic.
- `lowerProfiles()` resolves each profile's `observer` field:
  - Look up the observer name in the compiled observer catalog
  - Set `observerName` on the `CompiledAgentProfile`
  - If the profile's observer differs from the default, the per-profile surface resolution uses that observer's surfaces
- When `observability` section is absent, existing behavior is preserved exactly.

### 5. Update `validate-agents.ts`

- Remove validation of `agents.visibility` structure (now handled by `validate-observers.ts` from ticket 003).
- Add validation: if a profile specifies `observer`, the name must exist in `observability.observers` or be a built-in name (`omniscient`, `default`).
- Add validation: if a profile specifies `observer` but no `observability` section exists, emit diagnostic error.

### 6. Update Zod schemas in `schemas-core.ts`

- Add `observerName` to `CompiledAgentProfile` Zod schema.
- Remove `visibility` from any agent section Zod schema if present.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)

## Out of Scope

- Changing `policy-runtime.ts` behavior — the `input.catalog.surfaceVisibility` path continues unchanged
- Changing `policy-surface.ts` behavior — only type references changed in ticket 001
- Runner or simulator consuming observer catalog directly — follow-up specs
- FITL/Texas Hold'em game spec migration — that is ticket 007

## Acceptance Criteria

### Tests That Must Pass

1. Agent profile with `observer: currentPlayer` compiles and sets `observerName: 'currentPlayer'` on `CompiledAgentProfile`
2. Agent profile without `observer` field compiles and uses default observer — `observerName` is undefined
3. Agent profile with `observer: nonExistent` fails validation with diagnostic error
4. Spec with `agents.visibility` section fails parsing (field removed from type)
5. `AgentPolicyCatalog.surfaceVisibility` is populated correctly from the resolved observer
6. Existing `policy-runtime.test.ts`, `policy-eval.test.ts`, `policy-visibility.test.ts` pass unchanged (behavioral equivalence)

### Invariants

1. `policy-runtime.ts` runtime path (`input.catalog.surfaceVisibility`) works identically — no behavioral change
2. No agent-specific visibility logic in observer compilation, no observer logic in agent runtime
3. `agents.visibility` is fully removed — zero grep hits for `GameSpecAgentVisibilitySection` usage

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents-observer.test.ts` — observer binding resolution, fallback to default, invalid reference
2. `packages/engine/test/unit/cnl/validate-agents-observer.test.ts` — observer reference validation
3. Existing agent tests updated to remove `visibility` from test fixtures

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type correctness
3. `pnpm turbo lint` — lint compliance

## Outcome

**Completion date**: 2026-04-01

**What changed**:
- Added `observer?: string` to `GameSpecAgentProfileDef`, `observerName?: string` to `CompiledAgentProfile`
- Removed `GameSpecAgentVisibilitySection` type and `visibility` field from `GameSpecAgentsSection` (zero grep hits)
- Replaced `lowerSurfaceVisibility(agents.visibility, ...)` with `resolveSurfaceVisibilityFromObserverCatalog()` — resolves from observer catalog when available, falls back to system defaults
- Removed all visibility validation from `validate-agents.ts`, added `validateProfileObserverRef()` for observer name validation
- Added `observerCatalog` to `LowerAgentsOptions`, wired through `compiler-core.ts`
- Updated Zod schema and regenerated `GameDef.schema.json`
- **FITL migration (Foundation 14 compliance)**: created `93-observability.md` with `currentPlayer` observer, removed `agents.visibility` from `92-agents.md`, added `observer: currentPlayer` to all 5 profiles, updated entrypoint imports
- Updated all test fixtures: removed `createVisibility()` helpers, added `createTestObservability()` + `withObserver()`, regenerated golden fixtures

**Deviations from plan**:
- Ticket scoped FITL migration to ticket 007, but Foundation 14 ("migrate all owned artifacts in the same change") required migrating FITL alongside the type removal. Ticket 007's FITL migration scope is now complete.
- `resolveSurfaceVisibilityFromObserverCatalog` resolves the catalog-level `surfaceVisibility` using priority: unanimous profile observer > sole user-defined observer > catalog default. This was needed to correctly bridge the catalog-level field with per-profile observer references.
- Dedicated test files `compile-agents-observer.test.ts` and `validate-agents-observer.test.ts` (listed in ticket test plan) were not created separately — observer binding is tested through the existing authoring tests (which now use `withObserver`), the strategic condition tests, the integration e2e tests, and the observer-compilation-e2e tests from ticket 005.

**Verification**:
- `pnpm -F @ludoforge/engine build`: pass
- `pnpm turbo typecheck`: pass
- `pnpm turbo lint`: pass (0 warnings)
- `pnpm -F @ludoforge/engine test`: 5432 pass, 0 fail
- `GameSpecAgentVisibilitySection`: 0 grep hits (fully removed)
