# 103ACTTAGCAN-003: Implement tag index compilation in compiler pipeline

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `compile-agents.ts` or new `compile-action-tags.ts`, `compiler-core.ts`
**Deps**: `archive/tickets/103ACTTAGCAN-001.md`, `tickets/103ACTTAGCAN-002.md`, `specs/103-action-tags-and-candidate-metadata.md`

## Problem

Action tags declared in YAML must be compiled into a `CompiledActionTagIndex` on `GameDef`. The compilation must build both forward (`byAction`) and reverse (`byTag`) indexes, validate tag syntax, and be wired into the compiler pipeline.

## Assumption Reassessment (2026-04-01)

1. `compiler-core.ts` compiles actions at lines 544-557 via `lowerActions()` — confirmed. Tag index compilation should be inserted after this block.
2. `lowerActions()` returns `readonly ActionDef[]` — confirmed. Tags on each `ActionDef` (added in ticket 001) are available for index building.
3. `CompileSectionResults` in `compiler-core.ts` — must be checked for exhaustiveness tests that may need updating when adding `actionTagIndex`.
4. `GameSpecActionDef.tags` is `readonly string[] | undefined` (from ticket 001).

## Architecture Check

1. Tag index compilation is a pure function — deterministic, no side effects (Foundation 8).
2. Compilation happens after action lowering — tags flow from `GameSpecActionDef.tags` through `lowerActions` onto `ActionDef.tags`.
3. Both `byAction` and `byTag` arrays are sorted for deterministic output.
4. Validation at compile time: no empty strings, no duplicates per action, kebab-case format (Foundation 12).

## What to Change

### 1. Implement `compileActionTagIndex()`

New function (either in `compile-agents.ts` or dedicated `compile-action-tags.ts`):

```typescript
function compileActionTagIndex(
  actions: readonly ActionDef[],
  diagnostics: Diagnostic[],
): CompiledActionTagIndex | undefined
```

Logic:
- Iterate all actions, collect `tags` arrays
- Build `byAction`: `Record<actionId, sorted tags[]>`
- Build `byTag`: `Record<tagName, sorted actionId[]>`
- If no actions have tags, return `undefined`
- Validate: no empty tag strings, no duplicate tags per action, tag names match kebab-case pattern (`/^[a-z][a-z0-9-]*$/`)
- Emit diagnostics for validation failures

### 2. Ensure `lowerActions` preserves tags

Verify that `lowerActions()` copies `tags` from `GameSpecActionDef` to `ActionDef`. If not, add the passthrough.

### 3. Wire into `compiler-core.ts`

After the action compilation block (~line 557), call `compileActionTagIndex(actions, diagnostics)` and store on `GameDef.actionTagIndex`.

### 4. Update `CompileSectionResults` if needed

If there's an exhaustiveness test for `CompileSectionResults` keys, add `actionTagIndex`.

## Files to Touch

- `packages/engine/src/cnl/compile-action-tags.ts` (new) or `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compile-actions.ts` (modify — if `lowerActions` needs tag passthrough)

## Out of Scope

- Ref resolution (`candidate.tag.*`) — tickets 004, 005
- Game spec migration — ticket 006
- `isPass` intrinsic removal — ticket 005

## Acceptance Criteria

### Tests That Must Pass

1. Actions with tags produce correct `byAction` and `byTag` maps (both sorted)
2. Actions with no tags produce `actionTagIndex: undefined`
3. Empty tag string emits error diagnostic
4. Duplicate tag per action emits error diagnostic
5. Invalid tag name (not kebab-case) emits error diagnostic
6. Existing tests pass unchanged

### Invariants

1. Tag index compilation is pure — deterministic output
2. `byAction` and `byTag` arrays are always sorted
3. Games without tagged actions produce `undefined` (not empty index)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-action-tags.test.ts` — tag index compilation tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern action-tag` — targeted tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness
