# ARCDECANDGEN-002: Split `compiler.ts` into focused modules

**Status**: ✅ COMPLETED
**Phase**: 1B (File Decomposition — Pure Refactoring)
**Priority**: P0 — prerequisite for Phase 2+
**Complexity**: L
**Dependencies**: None

## Goal

Split `src/cnl/compiler.ts` into cohesive modules while preserving the public compiler API and runtime behavior.

## Assumption Reassessment (vs current repo)

- The ticket originally assumed a fixed test count (`1078`) for acceptance. This is stale.
- Acceptance now validates command outcomes instead of hard-coded counts:
  - `npm run typecheck` passes
  - `npm run lint` passes
  - `npm test` passes
- The original 7-file split target conflicted with the `<600 lines/file` invariant once macro-expansion helpers were retained. Scope was updated to include one additional focused module for macro expansion.

## Scope (implemented)

### New files created
- `src/cnl/compiler-core.ts` — compile orchestration and exported compiler API surface
- `src/cnl/compile-turn-flow.ts` — `lowerTurnFlow` and validation helpers
- `src/cnl/compile-operations.ts` — `lowerOperationProfiles` and helpers
- `src/cnl/compile-victory.ts` — `lowerVictory`, `lowerCoupPlan`
- `src/cnl/compile-event-cards.ts` — `lowerEventCards`, `lowerEventCardSide`
- `src/cnl/compile-data-assets.ts` — data-asset derived section logic
- `src/cnl/compile-lowering.ts` — shared lowering utilities (`lowerConstants`, vars/actions/triggers/endConditions, helpers)
- `src/cnl/compile-macro-expansion.ts` — macro-expansion logic extracted to satisfy size invariants

### Files modified
- `src/cnl/compiler.ts` — reduced to thin barrel re-exporting the existing public API

## Out of Scope (preserved)

- No intentional behavior changes
- No public API changes for `src/cnl/compiler.ts`
- No game-specific hardcoding added to engine/compiler logic

## Acceptance Criteria

- `npm run typecheck` passes
- `npm run lint` passes
- `npm test` passes
- Public exports from `src/cnl/compiler.ts` remain identical
- No circular dependencies among split compiler modules
- No split module exceeds 600 lines

## Outcome

**Completed on**: 2026-02-13

### What changed vs originally planned
- Implemented the planned compiler decomposition, preserving API behavior.
- Added `compile-macro-expansion.ts` as a scoped adjustment to satisfy the file-size invariant; this was the only scope expansion beyond the original 7-file list.

### Verification
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- Circular dependency check: `npx madge --circular src/cnl/compile*.ts src/cnl/compiler*.ts` could not be executed in this sandbox (network-restricted `npx` install). Local import graph inspection across split modules found no cycles.
