# ARCDECANDGEN-003: Split `validate-spec.ts` into focused modules

**Status**: ✅ COMPLETED
**Phase**: 1C (File Decomposition — Pure Refactoring)
**Priority**: P0 — prerequisite for Phase 2+
**Complexity**: M
**Dependencies**: None (can be done in parallel with 001, 002)

## Goal

Split `src/cnl/validate-spec.ts` (currently 1688 lines) into focused modules while preserving behavior and public API. `validate-spec.ts` becomes a barrel re-export.

## Reassessed assumptions (codebase-accurate)

- Current repository state still has a single `src/cnl/validate-spec.ts` file at 1688 lines.
- Public API surface in this module is currently:
  - `validateGameSpec`
  - `ValidateGameSpecOptions`
- A strict 5-file split creates avoidable circular dependencies or duplicated helper logic, because identifier/unknown-key/suggestion/source-map helpers are shared across all validators.

## Updated Scope

### New files to create
- `src/cnl/validate-spec-core.ts` — `validateGameSpec` orchestration, required-section checks, cross-section checks, diagnostic sort.
- `src/cnl/validate-metadata.ts` — metadata, constants, globalVars, perPlayerVars validation.
- `src/cnl/validate-zones.ts` — zones plus scenario/map/pieceCatalog cross-reference validations tied to setup/map data.
- `src/cnl/validate-actions.ts` — actions, triggers, turnStructure, endConditions validation.
- `src/cnl/validate-extensions.ts` — dataAsset envelope validation, turnFlow, operationProfile validation.
- `src/cnl/validate-spec-shared.ts` — shared internal constants, identifier helpers, unknown-key/suggestion engine, and common validation utilities.

### Files to modify
- `src/cnl/validate-spec.ts` — replace implementation with barrel re-exports.
- `src/cnl/index.ts` — adjust only if required (expected no change).

## Out of Scope

- No behavior changes (pure move-and-re-export)
- No renaming of public exports
- No import changes in consumers
- No changes to `src/kernel/`, `src/agents/`, `src/sim/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests and checks that must pass
- `npm test` — pass against current repository baseline
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- Public exports from `src/cnl/validate-spec.ts` remain identical (`validateGameSpec`, `ValidateGameSpecOptions`)
- No circular dependencies between the split validator modules
- Behavior and diagnostics remain unchanged for existing tests

## Outcome

- **Completion date**: 2026-02-13
- **What actually changed**:
  - `src/cnl/validate-spec.ts` was converted to a barrel re-export.
  - Validation logic was split into:
    - `src/cnl/validate-spec-core.ts`
    - `src/cnl/validate-metadata.ts`
    - `src/cnl/validate-zones.ts`
    - `src/cnl/validate-actions.ts`
    - `src/cnl/validate-extensions.ts`
  - Added `src/cnl/validate-spec-shared.ts` for shared validation constants/utilities to avoid cross-module duplication and circular dependencies.
- **Deviations from original plan**:
  - Original 5-file split was adjusted to include one additional internal helper module (`validate-spec-shared.ts`) because shared helper reuse across modules otherwise introduced either circular imports or duplicated logic.
- **Verification results**:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed (140/140 test files).
  - No cycles detected among `src/cnl/validate-*.ts` imports.
