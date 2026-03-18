# 67AIRETIRE-001: Remove engine MCTS runtime and engine-side tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents`, engine exports, agent factory, engine test helpers, unit/integration coverage
**Deps**: None

## Problem

The engine still ships MCTS as a first-class production agent, exports MCTS types/configuration from the public agent surface, and carries a large engine-side unit/integration test matrix around that implementation. If MCTS is being retired entirely, the engine must stop compiling, exporting, or validating any MCTS runtime path.

## Assumption Reassessment (2026-03-18)

1. `packages/engine/src/agents/mcts/**` is still present and exported via `packages/engine/src/agents/index.ts`.
2. `packages/engine/src/agents/factory.ts` still accepts `mcts` agent strings and preset/profile variants such as `mcts:fast`, `mcts:default`, and `mcts:strong`.
3. Engine unit/integration coverage still targets MCTS directly under `packages/engine/test/unit/agents/mcts/**` and `packages/engine/test/integration/agents/mcts/**`; this is production-coupled test surface, not archival reference material.

## Architecture Check

1. Full removal is cleaner than aliasing `mcts` to another agent type because aliases would preserve dead API surface and misleading contracts.
2. This change preserves the agnostic engine boundary by deleting one generic search implementation without introducing any game-specific fallback logic into engine runtime code.
3. No backwards-compatibility aliasing, preset shims, deprecated parser branches, or compatibility seat mappings should remain.

## What to Change

### 1. Delete engine MCTS production code

Remove `packages/engine/src/agents/mcts/**` and every production import/export that depends on it. Simplify the shared agent factory and public agent index so only supported non-MCTS agent types remain.

### 2. Remove engine-side MCTS validation surface

Delete MCTS-specific unit and integration tests, helpers, fixtures, and diagnostics hooks that only exist to validate the removed runtime. Audit adjacent engine files for MCTS-specific comments, type names, and options; if a hook exists only for MCTS, remove it rather than renaming it into a dead generic abstraction.

## Files to Touch

- `packages/engine/src/agents/index.ts` (modify)
- `packages/engine/src/agents/factory.ts` (modify)
- `packages/engine/src/agents/mcts/` (delete)
- `packages/engine/src/kernel/legal-choices.ts` (modify, only if an MCTS-only hook remains)
- `packages/engine/test/unit/agents/mcts/` (delete)
- `packages/engine/test/integration/agents/mcts/` (delete)
- `packages/engine/test/unit/helpers/` (modify or delete MCTS-only helpers)
- `packages/engine/test/helpers/` (modify or delete MCTS-only helpers/fixtures)

## Out of Scope

- Runner seat/UI removal
- CI workflow and package-script cleanup
- Top-level spec, ticket, report, and roadmap cleanup

## Acceptance Criteria

### Tests That Must Pass

1. Engine source no longer imports from `packages/engine/src/agents/mcts/**`.
2. `packages/engine/src/agents/factory.ts` no longer accepts or documents `mcts` agent identifiers.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No production engine export path advertises MCTS config, presets, visitors, diagnostics, or agent constructors.
2. Removal does not replace MCTS with game-specific engine branches; engine runtime remains generic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/factory.test.ts` — update supported agent contract after MCTS removal.
2. `packages/engine/test/unit/agents/index.test.ts` — update public export expectations if such coverage exists nearby.
3. `packages/engine/test/unit/kernel/legal-choices*.test.ts` — only if an MCTS-only hook is removed from kernel options.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
