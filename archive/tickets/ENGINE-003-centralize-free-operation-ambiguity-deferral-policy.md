# ENGINE-003: Centralize free-operation ambiguity deferral policy for discovery and move enumeration

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — free-operation legality/viability internals and kernel architecture guard coverage
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/src/kernel/legal-choices.ts`, `packages/engine/src/kernel/legal-moves-turn-order.ts`, `packages/engine/test/unit/kernel/free-operation-viability-export-surface-guard.test.ts`, `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts`, `packages/engine/test/unit/kernel/legal-moves.test.ts`, `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`

## Problem

`legal-moves-turn-order.ts` still falls back to `legalChoicesDiscover()` to decide whether a provisional free-operation variant should survive an ambiguous-overlap denial. That works functionally, but it couples move enumeration to the public legal-choices entrypoint instead of sharing a narrow internal policy abstraction. The architecture is cleaner if ambiguity-deferral probing lives behind one kernel-internal helper owned by the viability layer rather than through the legal-choices surface.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/src/kernel/legal-moves-turn-order.ts` currently calls `legalChoicesDiscover()` when `isFreeOperationGrantedForMove()` returns false, so move enumeration still depends on a higher-level public surface for this policy.
2. `packages/engine/src/kernel/legal-choices.ts` still contains the concrete logic that distinguishes resolvable from non-resolvable ambiguous-overlap denials for discovery.
3. `packages/engine/src/kernel/free-operation-viability.ts` now exists as the dedicated internal home for adjacent free-operation usability probing, so extracting this policy into an all-new discovery helper would be a step sideways rather than forward.
4. No active ticket currently covers moving this ambiguity-deferral policy onto the narrower viability boundary.

## Architecture Check

1. The cleaner design is one internal ambiguity-deferral helper that evaluates whether a denied free operation can become usable through future move decisions, with `legalChoices` and `legalMoves` both depending on it.
2. This preserves the game-agnostic boundary because the helper operates only on generic move/grant legality and decision-sequence probing, not on game-specific GameSpecDoc content or visual configuration.
3. The best ownership boundary is `free-operation-viability.ts`, not `free-operation-discovery-analysis.ts`, because viability already owns the narrower question of whether a free operation can be used in the current state after probing completion paths.
4. No backwards-compatibility aliasing should be introduced. The old `legalMoves -> legalChoicesDiscover()` dependency should be replaced, not supported in parallel.

## What to Change

### 1. Move shared ambiguity-deferral policy onto the viability boundary

Introduce or export a small helper on `free-operation-viability.ts` that answers the narrow question “can this ambiguous free-operation denial be deferred because later move decisions can resolve it?”

### 2. Repoint discovery and move enumeration to the shared helper

Have `legalChoices` and `legalMoves` consume the same helper rather than having `legalMoves` call the higher-level public legal-choices API.

### 3. Guard the ownership boundary with tests

Add or strengthen architecture coverage so future changes do not reintroduce a dependency from move enumeration to the public legal-choices surface for this policy, and so the viability module remains the explicit owner of the shared helper.

## Files to Touch

- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify only if behavior coverage needs adjustment)
- `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-viability-export-surface-guard.test.ts` (modify if helper becomes part of the curated internal export surface)

## Out of Scope

- Changing free-operation authorization semantics.
- Any game-specific GameSpecDoc or `visual-config.yaml` changes.
- Runner/UI changes.

## Acceptance Criteria

### Tests That Must Pass

1. `legalChoices` and `legalMoves` still agree on resolvable vs non-resolvable free-operation ambiguity.
2. `legal-moves-turn-order.ts` no longer depends on the public `legalChoicesDiscover()` API for ambiguity-deferral policy.
3. The shared ambiguity-deferral helper is owned by the viability boundary rather than embedded privately inside `legal-choices.ts`.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation ambiguity deferral remains a single kernel-internal policy with one source of truth.
2. `GameDef`, simulation, and runtime remain fully game-agnostic.
3. No public API gains a duplicate alias for the same internal policy.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — keep behavioral coverage for provisional free-operation variants while asserting the turn-order helper no longer imports `legalChoicesDiscover()`.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — retain resolvable/non-resolvable ambiguity coverage after moving the shared helper.
3. `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts` — add or adjust a boundary guard so shared probing routes through `free-operation-viability.ts`.
4. `packages/engine/test/unit/kernel/free-operation-viability-export-surface-guard.test.ts` — update curated viability export coverage if the shared helper becomes part of that module’s contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/kernel/legal-moves.test.js dist/test/unit/kernel/legality-surface-parity.test.js dist/test/unit/kernel/free-operation-probe-boundary-guard.test.js dist/test/unit/kernel/free-operation-viability-export-surface-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completed: 2026-03-10
- What changed:
  - Centralized ambiguous free-operation overlap deferral behind `packages/engine/src/kernel/free-operation-viability.ts` via `canResolveAmbiguousFreeOperationOverlapInCurrentState(...)`.
  - Repointed `packages/engine/src/kernel/legal-choices.ts` and `packages/engine/src/kernel/legal-moves-turn-order.ts` to the shared viability helper so move enumeration no longer depends on `legalChoicesDiscover()` for this policy.
  - Strengthened architecture guards in `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts` and `packages/engine/test/unit/kernel/free-operation-viability-export-surface-guard.test.ts`.
- Deviations from original plan:
  - `packages/engine/test/unit/kernel/legal-moves.test.ts` and `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` did not need source edits because the existing behavioral coverage remained valid after the ownership move.
  - Repo-wide validation exposed an unrelated stale runner bootstrap fixture and brittle assertion in `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts`; those were refreshed separately so the workspace could finish green.
- Verification:
  - Passed `pnpm -F @ludoforge/engine build`.
  - Passed `node --test dist/test/unit/kernel/legal-moves.test.js dist/test/unit/kernel/legality-surface-parity.test.js dist/test/unit/kernel/free-operation-probe-boundary-guard.test.js dist/test/unit/kernel/free-operation-viability-export-surface-guard.test.js`.
  - Passed `pnpm -F @ludoforge/engine test`.
  - Passed `pnpm -F @ludoforge/engine lint`.
  - Passed `pnpm -F @ludoforge/runner exec node scripts/bootstrap-fixtures.mjs check`.
  - Passed `pnpm -F @ludoforge/runner test -- --run test/bootstrap/resolve-bootstrap-config.test.ts`.
  - Passed `pnpm turbo lint`.
  - Passed `pnpm turbo test`.
