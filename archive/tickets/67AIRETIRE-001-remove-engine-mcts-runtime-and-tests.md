# 67AIRETIRE-001: Remove engine MCTS runtime and engine-side tests

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents`, engine exports, agent factory, engine test helpers, unit/integration coverage
**Deps**: None

## Problem

The engine still ships MCTS as a first-class production agent, exports MCTS types/configuration from the public agent surface, and carries a large engine-side unit/integration test matrix around that implementation. If MCTS is being retired entirely, the engine must stop compiling, exporting, or validating any MCTS runtime path. Runner seat cleanup and CI/lane cleanup are real dependencies in the overall retirement, but they are covered by `67AIRETIRE-002` and `67AIRETIRE-003` rather than this ticket.

## Assumption Reassessment (2026-03-18)

1. `packages/engine/src/agents/mcts/**` is still present and exported via `packages/engine/src/agents/index.ts`.
2. `packages/engine/src/agents/factory.ts` still accepts `mcts` agent strings plus numeric/preset/profile variants such as `mcts:1500`, `mcts:fast`, `mcts:default`, `mcts:strong`, and budget profiles.
3. Engine unit/integration coverage still targets MCTS directly under `packages/engine/test/unit/agents/mcts/**`, `packages/engine/test/integration/agents/mcts/**`, and `packages/engine/test/integration/mcts-decision-integration.test.ts`; this is production-coupled test surface, not archival reference material.
4. Additional MCTS references still exist in runner/UI and CI/e2e infrastructure, but those are already split into `67AIRETIRE-002` and `67AIRETIRE-003`. This ticket should not duplicate or absorb that work.

## Architecture Check

1. Full engine removal is cleaner than aliasing `mcts` to another agent type because aliases would preserve dead API surface and misleading contracts.
2. This change preserves the agnostic engine boundary by deleting one generic search implementation without introducing any game-specific fallback logic into engine runtime code.
3. No backwards-compatibility aliasing, preset shims, deprecated parser branches, or compatibility seat mappings should remain.
4. Ticket boundaries matter here: `001` should remove engine-owned production and engine-owned unit/integration validation surface; `002` and `003` should clean up runner/UI and CI/e2e orchestration respectively.

## What to Change

### 1. Delete engine MCTS production code

Remove `packages/engine/src/agents/mcts/**` and every production import/export that depends on it. Simplify the shared agent factory and public agent index so only supported non-MCTS agent types remain.

### 2. Remove engine-side MCTS validation surface

Delete MCTS-specific unit and integration tests, helpers, fixtures, and diagnostics hooks that only exist to validate the removed runtime. Audit adjacent engine files for MCTS-specific comments, type names, and options; if a hook exists only for MCTS, remove it rather than renaming it into a dead generic abstraction.

## Files to Touch

- `packages/engine/src/agents/index.ts` (modify)
- `packages/engine/src/agents/factory.ts` (modify)
- `packages/engine/src/agents/mcts/` (delete)
- `packages/engine/src/kernel/legal-choices.ts` (modify only if an MCTS-only hook remains)
- `packages/engine/test/unit/agents/mcts/` (delete)
- `packages/engine/test/integration/agents/mcts/` (delete)
- `packages/engine/test/integration/mcts-decision-integration.test.ts` (delete)
- `packages/engine/test/unit/helpers/` (modify or delete MCTS-only helpers/tests)
- `packages/engine/test/helpers/` (modify or delete MCTS-only helpers/fixtures)

## Out of Scope

- Runner seat/UI/worker removal (`67AIRETIRE-002`)
- CI workflow, package-script, e2e-lane, and diagnostics cleanup (`67AIRETIRE-003`)
- Top-level spec, ticket, report, and roadmap cleanup

## Acceptance Criteria

### Tests That Must Pass

1. Engine source no longer imports from `packages/engine/src/agents/mcts/**`.
2. `packages/engine/src/agents/factory.ts` no longer accepts or documents `mcts` agent identifiers, presets, or numeric MCTS shorthands.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No production engine export path advertises MCTS config, presets, visitors, diagnostics, or agent constructors.
2. Removal does not replace MCTS with game-specific engine branches; engine runtime remains generic.
3. This ticket does not reintroduce MCTS behavior indirectly through runner or CI compatibility shims; those follow-up surfaces should simply fail to compile until handled by their own retirement tickets.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/factory.test.ts` — update supported engine agent contract after MCTS retirement.
2. `packages/engine/test/unit/agents/factory-api-shape.test.ts` — strengthen parse/create invariants so unsupported agent names fail explicitly.
3. `packages/engine/test/unit/kernel/legal-choices*.test.ts` — only if an MCTS-only hook is removed from kernel options.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`

## Outcome

- Completed: 2026-03-18
- What actually changed:
  - Deleted `packages/engine/src/agents/mcts/**` and removed all MCTS exports from the engine agent surface.
  - Simplified `packages/engine/src/agents/factory.ts` so only `random` and `greedy` remain valid agent identifiers.
  - Deleted engine-owned MCTS unit, integration, helper, and diagnostics files that existed only to validate the retired runtime.
  - Updated engine trace seat typing so only live runner seat types remain.
- Deviations from original plan:
  - No `packages/engine/src/kernel/legal-choices.ts` changes were needed because no surviving MCTS-only hook remained there.
  - `packages/engine/test/unit/agents/factory-api-shape.test.ts` already covered the surviving parse/create API shape, so the retirement was validated without additional edits to that file.
  - To keep the repository green, the implementation was delivered together with `67AIRETIRE-002` and `67AIRETIRE-003` rather than leaving downstream runner/CI breakage behind.
- Verification results:
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo test` ✅
