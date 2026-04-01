# 104UNIDECCON-006: Remove deprecated runtime compatibility surfaces and migrate runtime tests to `considerations`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel contracts/diagnostics plus runtime-facing tests
**Deps**: `archive/tickets/104UNIDECCON-003.md`, `archive/tickets/104UNIDECCON-002.md`, `specs/104-unified-decision-context-considerations.md`

## Problem

The runtime implementation described in the original migration plan is already landed in source, but repository-owned runtime contracts and tests still expose deprecated `scoreTerms`, `completionScoreTerms`, and `completionGuidance` surfaces. That violates Foundations 14 ("No Backwards Compatibility") and leaves the test corpus asserting the old shape instead of the authoritative `considerations` model.

## Assumption Reassessment (2026-04-01)

1. `policy-eval.ts` already filters `profile.use.considerations` by scope for move evaluation.
2. `completion-guidance-eval.ts` and `completion-guidance-choice.ts` already use completion-scoped considerations and do not need the original runtime feature work described here.
3. `policy-evaluation-core.ts` already exposes `evaluateConsideration()` and resolves `context.kind`.
4. Remaining repo-owned compatibility surfaces are now concentrated in kernel/runtime contracts and tests:
   - `packages/engine/src/kernel/types-core.ts`
   - `packages/engine/src/kernel/schemas-core.ts`
   - `packages/engine/src/agents/policy-diagnostics.ts`
   - runtime/unit/integration tests that still author or assert deprecated fields

## Architecture Check

1. The authored/runtime authority is `considerations`; deprecated buckets must be removed rather than preserved as aliases (Foundation 14).
2. Completion guidance enablement is derived from completion-scoped considerations, not from a separate `completionGuidance` configuration object.
3. Runtime diagnostics and tests must reflect the same authoritative shape the runtime now executes.

## What to Change

### 1. Remove deprecated runtime/kernel contract fields

- Remove deprecated `scoreTerms`, `completionScoreTerms`, and `completionGuidance` fields from repository-owned runtime/kernel types and schemas
- Keep the authoritative surface as `considerations`
- Update any runtime diagnostics snapshots or helpers that still emit deprecated field names

### 2. Migrate runtime-facing tests to `considerations`

- Update unit and integration tests that still author profiles with `scoreTerms`, `completionScoreTerms`, or `completionGuidance`
- Update assertions to prove scope-filtered `considerations` behavior directly
- Ensure `context.kind` and derived completion enablement are asserted via the authoritative runtime path

### 3. Remove stale terminology from runtime test fixtures/helpers

- Replace "score term" naming in runtime-oriented tests where it now refers to considerations
- Keep test intent the same, but prove the migrated API and contracts instead of deprecated compatibility behavior

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify if still emitting deprecated fields)
- `packages/engine/test/unit/agents/**` (modify targeted runtime tests)
- `packages/engine/test/integration/agents/**` (modify targeted runtime tests)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify if it still asserts deprecated surfaces)

## Out of Scope

- Runtime feature implementation already landed in source
- Compilation changes — ticket 005
- Game spec migration — ticket 007

## Acceptance Criteria

### Tests That Must Pass

1. Runtime unit/integration tests no longer author profiles with `scoreTerms`, `completionScoreTerms`, or `completionGuidance`
2. Move-scoped consideration evaluates in move context, not in completion context
3. Completion-scoped consideration evaluates in completion context, not in move context
4. Dual-scoped consideration evaluates in both contexts
5. `context.kind` returns `'move'` in move context and `'completion'` in completion context
6. Presence of completion-scoped considerations enables completion guidance without a separate config field
7. Repository-owned runtime/kernel types and schemas do not expose deprecated compatibility fields

### Invariants

1. Scope filtering is deterministic
2. Runtime contracts and tests reflect the same authoritative `considerations` model the source code executes

## Test Plan

### New/Modified Tests

1. Update targeted runtime unit tests under `packages/engine/test/unit/agents/`
2. Update targeted runtime integration tests under `packages/engine/test/integration/agents/`
3. Update `packages/engine/test/integration/fitl-policy-agent.test.ts` if it still asserts deprecated fields

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. Run targeted `node --test` commands against the built `dist/test/...` files that cover the migrated runtime paths

## Outcome

Completed: 2026-04-01

- Removed deprecated runtime/compiler-owned compatibility fields for `scoreTerms`, `completionScoreTerms`, and `completionGuidance` from the compiled kernel/runtime contracts and schemas.
- Updated diagnostics and runtime-facing test helpers/suites to use `considerations` as the authoritative surface.
- Rewrote the ticket itself before implementation because the originally described runtime feature work was already landed in source; the real remaining scope was contract cleanup plus test migration.

Deviations from original plan:

- The original ticket described runtime implementation work in `policy-eval.ts`, `completion-guidance-eval.ts`, and `policy-evaluation-core.ts`; those changes were already present and were not reimplemented.
- FITL integration assertions still require follow-on migration and full-suite cleanup work that belongs to active tickets `104UNIDECCON-007` and `104UNIDECCON-008`, not this archival pass.

Verification:

- `pnpm -F @ludoforge/engine typecheck`
- `pnpm -F @ludoforge/engine build`
- `node --test "dist/test/unit/agents/completion-guidance-choice.test.js" "dist/test/unit/agents/completion-guidance-eval.test.js" "dist/test/unit/agents/policy-eval.test.js" "dist/test/unit/cnl/compile-considerations.test.js" "dist/test/unit/compile-agents-authoring.test.js"`
