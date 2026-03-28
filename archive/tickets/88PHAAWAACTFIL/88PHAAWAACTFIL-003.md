# 88PHAAWAACTFIL-003: Reassess stale phase-aware test-split ticket

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No additional engine changes or new tests expected unless verification finds a gap
**Deps**: archive/tickets/88PHAAWAACTFIL/88PHAAWAACTFIL-001.md, archive/tickets/88PHAAWAACTFIL/88PHAAWAACTFIL-002.md

## Problem

The original `003` ticket assumes the phase-aware action-filtering change still needs
dedicated tests added in a separate follow-up after `001` and `002`.

That assumption is stale. The repository already contains the relevant proof:

- `packages/engine/test/unit/kernel/phase-action-index.test.ts`
- phase-aware behavior coverage in `packages/engine/test/unit/kernel/legal-moves.test.ts`
- source-guard coverage in `packages/engine/test/unit/kernel/legal-moves.test.ts`

The ticket must be corrected before any implementation work proceeds. The remaining work
for `003` is verification and archival of the stale split-ticket, not creation of a
second layer of overlapping tests.

## Assumption Reassessment (2026-03-28)

1. The assumption that dedicated phase-index unit tests still need to be created is false. [phase-action-index.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/phase-action-index.test.ts) already exists and covers grouping, dual-phase membership, missing buckets, cache identity, and distinct-action-array behavior.
2. The assumption that legal-move integration tests still need to be added is false. [legal-moves.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts) already contains:
   - public-behavior proof that only current-phase actions are emitted
   - source-guard proof that `legal-moves.ts` imports `getPhaseActionIndex`
   - source-guard proof that both raw loops iterate `actionsForPhase`
   - source-guard proof that raw `def.actions` scans are not reintroduced
3. The assumption that no parity-oriented test exists is false in practice. The repo already has a dedicated integration suite at `dist/test/integration/classified-move-parity.test.js` in the engine test run, and the phase-aware change’s behavioral proof is already captured by the existing `legal-moves` tests. A separate `phase-action-index-parity.test.ts` file would duplicate ownership.
4. The original proposed FITL-specific parity file is not the cleanest architecture for this repo anymore. The more robust design is:
   - generic unit proof in `phase-action-index.test.ts`
   - behavioral + source-guard proof in `legal-moves.test.ts`
   rather than an extra file that partially overlaps both.
5. The `001` / `002` / `003` split was not the right architectural unit. The durable design was to land implementation plus proof together. Archived `001` already documents that integrated ownership.

## Architecture Check

1. The current architecture is better than the original `003` proposal because the tests already sit at the natural ownership boundaries: the index module owns index-unit proof; `legal-moves.test.ts` owns enumeration behavior and source-shape proof.
2. Adding the originally proposed `phase-action-index-parity.test.ts` now would create duplicated proof and another place for drift. That is less robust than the current architecture.
3. If future regressions appear, they should be fixed where ownership already exists:
   - index structure/caching in `phase-action-index.test.ts`
   - enumeration semantics/source-shape in `legal-moves.test.ts`
4. No backwards-compatibility shims, redundant tests, or split follow-up tickets are warranted here.

## What to Change

### 1. Correct the ticket

- Rewrite this ticket so it accurately reflects the current code and test state.
- Narrow scope from "add tests" to "verify the already-landed proof surface and archive the stale ticket".

### 2. Verify the existing proof

- Run targeted tests for the phase index and `legal-moves` phase-aware coverage.
- Run repo-level `typecheck`, `lint`, and `test` commands required by ticket finalization.

### 3. Archive this ticket

- Mark the ticket completed once verification passes.
- Add an `Outcome` section explaining that the tests already existed and that this ticket was stale after the integrated implementation in archived `001`.

## Files to Touch

- `tickets/88PHAAWAACTFIL-003.md` (correct, then archive)

## Out of Scope

- Adding `packages/engine/test/unit/kernel/phase-action-index.test.ts` again.
- Creating `packages/engine/test/unit/kernel/phase-action-index-parity.test.ts`.
- Re-editing existing test files unless verification exposes an actual missing invariant.
- Engine, compiler, CNL, or runner changes.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck`
2. `pnpm turbo lint`
3. `pnpm turbo test`
4. Targeted engine tests covering the existing phase-index and phase-aware legal-move proof

### Invariants

1. Generic index proof remains owned by `phase-action-index.test.ts`.
2. Enumeration behavior/source-shape proof remains owned by `legal-moves.test.ts`.
3. This ticket does not introduce redundant FITL-only parity tests where existing ownership is already sufficient.
4. The stale split-ticket pattern is not preserved.

## Test Plan

### New/Modified Tests

None expected. Existing tests already cover the architecture this ticket originally proposed.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/phase-action-index.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `pnpm turbo test`

## Outcome

Completed: 2026-03-28

What actually changed:
- Corrected this ticket to reflect the real test ownership in the repo instead of the stale split-ticket plan.
- Verified that the relevant tests already exist in `packages/engine/test/unit/kernel/phase-action-index.test.ts` and `packages/engine/test/unit/kernel/legal-moves.test.ts`.
- Verified repo health with targeted tests plus workspace `typecheck`, `lint`, and `test`.

Deviations from original plan:
- No new tests were added because the intended proof had already landed in the correct ownership files.
- No dedicated FITL parity test file was added because that would now duplicate existing proof and weaken architectural clarity.
- The corrected scope of this ticket is verification and archival of a stale test-split, not further implementation.

Verification results:
- `pnpm turbo build`
- `node --test packages/engine/dist/test/unit/kernel/phase-action-index.test.js`
- `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
