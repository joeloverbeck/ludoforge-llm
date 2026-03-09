# ENG-216: Path-Sensitive Sequence-Context Linkage Validation for Effect Control Flow

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — effect control-flow traversal and static sequence-context analysis
**Deps**: archive/tickets/ENG/ENG-205-sequence-context-linkage-validation.md, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/effect-dispatch.ts

## Problem

The current effect-side linkage validator recursively traverses nested effect objects without control-flow path semantics. It can incorrectly treat captures and requires from mutually exclusive effect branches as linked, allowing semantically impossible contracts to pass validation.

## Assumption Reassessment (2026-03-09)

1. Runtime already executes effect ASTs with structured control-flow semantics (`if`, `forEach`, `reduce`, `let`, `rollRandom`, etc.), not as an unordered global set.
2. Effect-issued grant viability probing already preserves execution order via `freeOperationProbeScope.priorGrantDefinitions`, so the runtime model for effect paths is sequential and branch-aware.
3. Current static linkage collection in `validate-gamedef-behavior.ts` is a generic object-recursive walk over nested effect payloads, so mutually exclusive paths such as `if.then` vs `if.else` are flattened together.
4. Event-card side + selected branch grant aggregation is intentionally valid today: runtime merges `side.freeOperationGrants` with the selected `branch.freeOperationGrants`, and side effects with selected branch effects, as one issuance/execution scope.
5. Correction: introduce path-sensitive effect grant analysis aligned to executable effect paths, while preserving the existing event-side `side + selected branch` semantics.

## Architecture Check

1. A path-sensitive analyzer is cleaner than ad-hoc recursive object walking and is extensible for future effect-contract validators.
2. The analyzer should operate on generic effect AST semantics and keep game-specific logic in GameSpecDoc data only.
3. Event-side side/branch aggregation should stay unchanged because it already matches runtime execution semantics; the cleanup target is effect-AST traversal, not event branch selection.
4. No backwards-compatibility shims: one canonical effect-walk model for effect-issued linkage validation.

## What to Change

### 1. Introduce path-aware effect grant collector

Build a dedicated effect-AST traversal utility for validation that preserves execution-path scope (including branch isolation for `if.then` vs `if.else`) and sequential ordering for nested executable subtrees.

### 2. Validate linkage per executable effect path scope

Run sequence-context linkage checks per path-local grant set so captures in one exclusive effect path cannot satisfy requires in another.

### 3. Preserve current event-side scope semantics

Keep event-card `side + selected branch` linkage behavior unchanged, because that aggregation already matches runtime issuance.

### 4. Add targeted impossible-contract diagnostics coverage

Add tests where capture and require live in mutually exclusive branches and ensure validation rejects those definitions deterministically.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/<shared-effect-traversal-module>.ts` (new or modify existing for effect-path traversal)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify for executable nested effect-path coverage)

## Out of Scope

- Denial-cause renaming/parity work (`archive/tickets/ENG/ENG-206-sequence-context-denial-cause-parity.md`).
- Schema deduplication work (`archive/tickets/ENG/ENG-207-consolidate-sequence-context-schema-ownership.md`).
- Mandatory completion/outcome contracts (`tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Capture in `if.then` cannot satisfy require in sibling `if.else` for the same chain/key.
2. Path-valid linkage on the same executable effect path with proper step ordering still validates.
3. Event-side side capture plus selected-branch require remains valid when both are part of the same selected event scope.
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

### Invariants

1. Sequence-context linkage validation is path-sensitive for effect control-flow constructs.
2. Event-card side + selected branch aggregation remains aligned with runtime issuance semantics.
3. Analyzer remains game-agnostic and reusable for future static contract checks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add mutually exclusive effect-branch invalid cases and same-path valid controls; keep the existing valid side+selected-branch event case.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add/extend nested effect scenarios ensuring boundary validation rejects impossible effect-path linkages while preserving current event scope semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine test`

## Outcome

Implemented:
1. Added a dedicated effect-path traversal utility for sequence-context linkage validation so mutually exclusive effect branches are validated per executable path instead of via generic object recursion.
2. Preserved the existing event-side `side + selected branch` linkage semantics and aligned event effect scope ordering with runtime execution.
3. Added unit and integration coverage for impossible sibling-branch linkage and same-path valid linkage.

Adjusted vs original plan:
1. The fix stayed focused on effect-issued path sensitivity; event-side `side + selected branch` aggregation was intentionally retained because runtime already treats it as one selected scope.
2. The traversal was made conservative for optional/repeated subtrees and short-circuits subtrees with no relevant grants to avoid validation path explosion on control-flow-heavy effects.
