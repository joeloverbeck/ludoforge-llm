# ENGINEAGNO-007: Consolidate Duplicate Replay Helpers Across Test Suites

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No kernel semantic change; test architecture consolidation
**Deps**: ENGINEAGNO-004, ENGINEAGNO-005, ENGINEAGNO-006

## Problem

Replay helper duplication is now narrow but still present: `test/e2e/texas-holdem-tournament.test.ts` retains a local `replayTrace` loop that duplicates shared harness behavior already established in `test/helpers/replay-harness.ts`.

Even one remaining bespoke replay path creates avoidable drift risk in semantics/diagnostics and weakens confidence that replay behavior is centralized and game-agnostic.

## Reassessed Assumptions (Code/Test Reality)

1. Shared replay utilities already exist and are covered (`replayScript`, `advancePhaseBounded`).
2. `test/e2e/texas-holdem-real-plays.test.ts` and `test/unit/texas-holdem-properties.test.ts` already use shared replay harness helpers.
3. The primary remaining duplicate replay helper is local tournament e2e `replayTrace`.
4. Existing tournament assertions depend on replayed step snapshots (`before`, `legal`, `move`, `after`) plus per-step expected state-hash checks.
5. No kernel/runtime gap is required to solve this ticket; this is a test architecture consolidation task only.

## Updated Scope

1. Migrate tournament e2e replay reconstruction from local `replayTrace` to shared `replayScript`.
2. Preserve tournament-domain assertions while removing duplicate replay plumbing.
3. Align tournament replay diagnostics inputs (`keyVars`, expected state hashes) with shared harness conventions.
4. Keep helper and test updates game-agnostic at the harness boundary (no engine/game-specific branching in shared utilities).

## What to Change

1. Remove local replay helper implementation from `test/e2e/texas-holdem-tournament.test.ts`.
2. Use `replayScript` to reconstruct replay snapshots from trace move logs with `expectedStateHash` validation per step.
3. Keep tournament-specific assertions local to e2e test code.
4. Add/adjust focused test coverage only where needed to lock the migrated replay path and invariants.
5. Keep implementation surgical (avoid unrelated refactors and no kernel semantic changes).

## Architectural Rationale

- Consolidation is more robust than the current architecture because a single replay execution path is easier to harden and reason about than multiple near-equivalent loops.
- Centralized replay diagnostics improve maintainability and debugging consistency across games without introducing aliases or backward-compat layers.
- Surgical migration preserves readability (local domain assertions remain local) while reducing long-term divergence risk.

## Invariants

1. Replay execution semantics are centralized in one shared helper path.
2. Existing deterministic assertions (state hashes, per-step legality checks) remain preserved.
3. Test suites remain readable: domain assertions local, replay mechanics shared.
4. No regression in shared harness behavior or tournament-specific assertions.

## Tests

1. E2E: tournament replay-dependent assertions pass after migration to shared harness.
2. Unit regression: replay harness suite remains green.
3. Determinism regression: replayed tournament traces still match expected per-step state hashes and final-state checks.

## Outcome

- Completion date: 2026-02-16
- What was actually changed:
  - Updated this ticket to reflect current code/test reality: replay-helper duplication was scoped to tournament e2e only.
  - Migrated `test/e2e/texas-holdem-tournament.test.ts` replay reconstruction from local `replayTrace` plumbing to shared `replayScript` harness usage.
  - Preserved existing tournament domain assertions while centralizing replay step execution and expected hash validation through shared helper contracts.
- Deviations from original plan:
  - Narrowed scope from broad "across suites" consolidation to a surgical single-suite migration because prior tickets already migrated real-play and property suites.
- Verification results:
  - `npm run lint` passed.
  - `node --test dist/test/unit/replay-harness.test.js` passed.
  - `node --test dist/test/e2e/texas-holdem-tournament.test.js` passed.
  - `npm test` passed.
  - `npm run test:all` passed.
