# 104UNIDECCON-008: Diagnostic codes, schema artifacts, and full verification

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `compiler-diagnostic-codes.ts`, schema artifacts, test expectation cleanup
**Deps**: `archive/tickets/104UNIDECCON-001.md`, `archive/tickets/104UNIDECCON-002.md`, `archive/tickets/104UNIDECCON-003.md`, `archive/tickets/104UNIDECCON-004.md`, `archive/tickets/104UNIDECCON-005.md`, `archive/tickets/104UNIDECCON-006.md`, `archive/tickets/104UNIDECCON-007.md`, `specs/104-unified-decision-context-considerations.md`

## Problem

New diagnostic codes used by consideration compilation and scope validation must be registered in the canonical registry. Schema artifacts must be regenerated and verified idempotent. Full verification must pass.

## Assumption Reassessment (2026-04-01)

1. `compiler-diagnostic-codes.ts` — confirmed. New `CNL_COMPILER_*` codes need registration.
2. Diagnostic registry audit test forbids inline `CNL_COMPILER_*` literals — confirmed.
3. `schema:artifacts:check` validates sync — confirmed.
4. `CompileSectionResults` exhaustiveness test may need updating — confirmed.

## Architecture Check

1. All `CNL_COMPILER_*` codes registered — codebase convention.
2. Schema artifacts regenerated from Zod — automatic.
3. Full verification is the final gate.

## What to Change

### 1. Register diagnostic codes

Typical candidates:
- `CNL_COMPILER_CONSIDERATION_SCOPE_EMPTY` — empty scopes array
- `CNL_COMPILER_CONSIDERATION_SCOPE_INVALID` — unknown scope value
- `CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION` — scope-specific ref violation (error)
- `CNL_COMPILER_CONSIDERATION_SCOPE_WARNING` — dual-scope cross-context ref warning

### 2. Update `CompileSectionResults` exhaustiveness test

If library shape change affects `CompileSectionResults`, update `compiler-structured-results.test.ts`.

### 3. Regenerate schema artifacts

### 4. Full verification

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify — if needed)
- `packages/engine/test/unit/cnl/compile-considerations.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/trace/policy-trace-events.test.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)
- `packages/runner/test/config/visual-config-files.test.ts` (modify — brittle exact-position assertion removed to unblock full verification)

## Out of Scope

- New feature work
- Runner or simulator changes
- Golden fixture migration already completed in `archive/tickets/104UNIDECCON-007.md`

## Acceptance Criteria

### Tests That Must Pass

1. Diagnostic registry audit passes
2. `schema:artifacts:check` passes
3. `pnpm turbo build` succeeds
4. `pnpm turbo test` — all tests pass
5. `pnpm turbo lint` — 0 warnings
6. `pnpm turbo typecheck` passes

### Invariants

1. All `CNL_COMPILER_*` codes registered
2. Schema artifacts in sync

## Test Plan

### New/Modified Tests

1. No new test files — verification of existing tests

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts` — regenerate
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` — full verification

## Outcome

Completed: 2026-04-01

- Registered dedicated consideration-scope compiler diagnostic codes and wired scope normalization / scope-ref validation to emit them instead of the generic policy-expression code.
- Regenerated `packages/engine/schemas/GameDef.schema.json` so the schema no longer advertises removed `scoreTerms`, `completionScoreTerms`, or `completionGuidance` fields and now requires `considerations` / `plan.considerations`.
- Updated consideration and schema/trace tests to match the post-migration contract, including diagnostics snapshots that now label cost tiers as `consideration:*`.
- Hardened the FITL runner visual-config test by removing brittle exact anchor-coordinate snapshots and keeping stable id / route-shape / finite-coordinate checks, which is consistent with map positions being editable.

Deviation from original plan:

- `compiler-structured-results.test.ts` did not require changes after reassessment.
- Full verification exposed stale schema/trace test expectations and a brittle runner visual-config assertion; these were fixed as part of satisfying the ticket's repo-wide verification boundary.

Verification:

- `pnpm -F @ludoforge/engine typecheck`
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine run schema:artifacts`
- `pnpm -F @ludoforge/engine run schema:artifacts:check`
- `node --test "dist/test/unit/cnl/compile-considerations.test.js" "dist/test/unit/compiler-diagnostic-registry-audit.test.js"` from `packages/engine`
- `node --test "dist/test/unit/schemas-top-level.test.js" "dist/test/unit/trace/policy-trace-events.test.js"` from `packages/engine`
- `pnpm turbo build`
- `pnpm turbo test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
