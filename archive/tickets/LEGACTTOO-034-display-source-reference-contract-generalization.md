# LEGACTTOO-034: Display Source Reference Contract Generalization

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel display-node contract + ast-to-display producer updates
**Deps**: archive/tickets/LEGACTTOO-032-limit-identity-contract-centralization-and-validation.md, archive/tickets/LEGACTTOO/LEGACTTOO-031-limit-identity-invariant-test-hardening.md

## Problem

`DisplayLineNode` currently carries limit-specific identity metadata (`sourceRef.kind: 'limit'`). This couples the generic display AST to one domain concept, making the shared display contract less extensible and encouraging future one-off node-shape growth.

## Assumption Reassessment (2026-03-07)

1. `DisplayLineNode` now includes optional `sourceRef` constrained to `kind: 'limit'` and `id`. Confirmed in `packages/engine/src/kernel/display-node.ts`.
2. Limit display lines are currently the only producer of this metadata. Confirmed in `packages/engine/src/kernel/ast-to-display.ts`.
3. No existing ticket in `tickets/*` currently covers display-node source-reference generalization; `LEGACTTOO-032` covers limit ID canonical validation and compiler/kernel semantic checks, not display AST typing.

## Architecture Check

1. A generic source-reference envelope is cleaner than embedding limit-only semantics into the shared display node contract.
2. This remains game-agnostic: identity metadata is structural engine/runtime information and does not encode game-specific rules.
3. No backwards-compatibility aliasing/shims: replace the narrow shape directly and update all callsites/tests.

## What to Change

### 1. Introduce a generic display source-reference type

Define a reusable source-reference contract for display lines (for example a discriminated union keyed by `entity`) that can represent limits now and future identity-backed line sources without mutating `DisplayLineNode` ad hoc.

### 2. Migrate limit line producer to the generalized contract

Update `actionDefToDisplayTree` limit-line construction to emit the new generic source reference for limit entries.

### 3. Update and strengthen contract tests

Ensure display-node type/clone tests include line nodes with source references and verify compatibility with existing display rendering behavior.

## Files to Touch

- `packages/engine/src/kernel/display-node.ts` (modify)
- `packages/engine/src/kernel/ast-to-display.ts` (modify)
- `packages/engine/src/kernel/condition-annotator.ts` (modify — reads `sourceRef.kind === 'limit'`)
- `packages/engine/test/unit/kernel/display-node.test.ts` (modify)
- `packages/engine/test/unit/kernel/ast-to-display.test.ts` (modify)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify — verify sourceRef consumer)

## Out of Scope

- Limit ID canonicality and duplicate-validation semantics in `GameDef` validation
- Runner UI layout/styling changes
- Any game-specific branching or data-shape changes

## Acceptance Criteria

### Tests That Must Pass

1. `DisplayLineNode` supports generalized source references with deterministic typing and clone safety.
2. Limit lines still emit canonical limit identity references under the new source-reference contract.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Shared display AST remains generic and extensible across domains.
2. Source-reference metadata does not encode game-specific behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/display-node.test.ts` — add source-reference clone/shape assertions for line nodes.
2. `packages/engine/test/unit/kernel/ast-to-display.test.ts` — assert limit lines emit generalized source references with canonical IDs.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/display-node.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/ast-to-display.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- **Completion date**: 2026-03-07
- **What changed**:
  - Introduced `DisplayLimitSourceRef` interface and `DisplaySourceRef` discriminated union (keyed by `entity`) in `display-node.ts`
  - Replaced inline `sourceRef: { kind: 'limit'; id: string }` with `sourceRef?: DisplaySourceRef` on `DisplayLineNode`
  - Updated `limitToDisplayLine` in `ast-to-display.ts` to emit `entity: 'limit'`
  - Updated `annotateLimitsGroup` in `condition-annotator.ts` to check `sourceRef?.entity === 'limit'`
  - Added 4 new tests in `display-node.test.ts` (clone safety, entity discriminant, union acceptance, JSON round-trip)
  - Updated existing `sourceRef` assertion in `ast-to-display.test.ts` to use `entity` discriminant
- **Deviations**: Ticket corrected during reassessment to include `condition-annotator.ts` and its test file (not in original "Files to Touch"). The test file had no `sourceRef` references to update.
- **Verification**: Build clean, 4250/4250 tests pass, lint clean, typecheck clean
