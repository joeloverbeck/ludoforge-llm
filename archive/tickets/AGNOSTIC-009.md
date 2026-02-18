# AGNOSTIC-009: Data-Driven Runner Bootstrap Registry (No Game-Specific Branches)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Runner + optional compile metadata plumbing
**Deps**: None

## What Needs to Change

1. Replace hardcoded bootstrap selector branches (for example `game === 'fitl'`) with a manifest/registry contract.
2. Define a bootstrap descriptor format containing:
   - game id / query key
   - fixture/module path
   - default seed/player metadata
   - optional validation/source metadata
3. Update bootstrap resolver to resolve from this registry only.
4. Keep default behavior deterministic when no query is provided or unknown ids are requested.
5. Document the process for adding a new game bootstrap target without editing resolver logic.

## Invariants

1. Adding a new bootstrap game does not require new conditional branches in resolver code.
2. Unknown/invalid bootstrap ids degrade predictably to default policy (or explicit error policy).
3. Existing default and FITL bootstrap routes continue to work.
4. Bootstrap resolution remains game-agnostic and extensible for future GameSpecDoc-derived games.

## Tests That Should Pass

1. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts`
   - New cases for registry lookup, unknown ids, and default fallback behavior.
2. New tests for bootstrap registry descriptor validation/parsing.
3. `packages/runner/test/ui/App.test.ts`
   - Regression: app initialization still consumes resolved config correctly.
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- **Completed**: 2026-02-18
- **What changed**:
  - Added descriptor-based bootstrap registry in `packages/runner/src/bootstrap/bootstrap-registry.ts`.
  - Updated `resolveBootstrapConfig` to resolve exclusively through the registry (removed game-specific branch logic).
  - Added registry validation/parsing tests in `packages/runner/test/bootstrap/bootstrap-registry.test.ts`.
  - Extended resolver tests for unknown-id fallback and retained FITL/default behavior in `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts`.
  - Documented bootstrap target onboarding flow in `packages/runner/src/bootstrap/README.md`.
- **Deviations from original plan**:
  - Kept default fallback behavior (unknown ids resolve to default descriptor) to preserve deterministic bootstrap behavior.
  - No engine/compiler metadata plumbing was required for this scope.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
