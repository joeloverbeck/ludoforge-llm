# ENG-216: Path-Sensitive Sequence-Context Linkage Validation for Effect Control Flow

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — effect traversal model and static sequence-context analysis
**Deps**: archive/tickets/ENG/ENG-205-sequence-context-linkage-validation.md, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/effect-dispatch.ts

## Problem

The current effect-side linkage validator recursively traverses nested effect objects without control-flow path semantics. It can incorrectly treat captures and requires from mutually exclusive branches as linked, allowing semantically impossible contracts to pass validation.

## Assumption Reassessment (2026-03-09)

1. Runtime executes effect arrays with structured control-flow semantics (`if`, `forEach`, `reduce`, etc.), not as an unordered global set.
2. Current static linkage collector is object-recursive and path-insensitive, so branch exclusivity and execution ordering context can be flattened away.
3. Mismatch: path-insensitive collection can yield false negatives (invalid contracts accepted). Correction: introduce path-sensitive effect grant analysis aligned to executable paths.

## Architecture Check

1. A path-sensitive analyzer is cleaner than ad-hoc recursive object walking and is extensible for future contract validators.
2. The analyzer operates on generic effect AST semantics and keeps game-specific logic in GameSpecDoc data only.
3. No backwards-compatibility shims: one canonical effect-walk model for linkage validation.

## What to Change

### 1. Introduce path-aware effect grant collector

Build a dedicated effect-AST traversal utility for validation that preserves execution-path scope (including branch isolation for `if.then` vs `if.else`).

### 2. Validate linkage per executable path scope

Run sequence-context linkage checks per path-local grant set so captures in one exclusive path cannot satisfy requires in another.

### 3. Add targeted impossible-contract diagnostics coverage

Add tests where capture and require live in mutually exclusive branches and ensure validation rejects those definitions deterministically.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/<shared-effect-traversal-module>.ts` (new or modify existing)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify if needed for realistic nested path coverage)

## Out of Scope

- Denial-cause renaming/parity work (`archive/tickets/ENG/ENG-206-sequence-context-denial-cause-parity.md`).
- Schema deduplication work (`archive/tickets/ENG/ENG-207-consolidate-sequence-context-schema-ownership.md`).
- Mandatory completion/outcome contracts (`tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Capture in `if.then` cannot satisfy require in sibling `if.else` for the same chain/key.
2. Path-valid linkage (capture and require on same executable path with proper step ordering) still validates.
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

### Invariants

1. Sequence-context linkage validation is path-sensitive for effect control-flow constructs.
2. Analyzer remains game-agnostic and reusable for future static contract checks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add mutually exclusive branch invalid cases and same-path valid controls.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add/extend nested effect scenarios ensuring boundary validation rejects impossible path linkages.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine test`
