# 88PHAAWAACTFIL-002: Reassess phase-aware enumeration integration ticket scope

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No additional engine changes expected unless verification finds a regression
**Deps**: archive/tickets/88PHAAWAACTFIL/88PHAAWAACTFIL-001.md, archive/specs/88-phase-aware-action-filtering.md

## Problem

The original `002` ticket assumed `enumerateRawLegalMoves` still scanned `def.actions`
directly and that this ticket should perform the phase-index integration as an isolated
follow-up to `001`.

That assumption is no longer true. The codebase already contains:

- `packages/engine/src/kernel/phase-action-index.ts`
- the `getPhaseActionIndex` import in `packages/engine/src/kernel/legal-moves.ts`
- a single `actionsForPhase` lookup in `enumerateRawLegalMoves`
- both raw enumeration loops narrowed to `actionsForPhase`
- dedicated tests proving the index behavior and the `legal-moves.ts` integration

The ticket must be corrected before any implementation work proceeds. The remaining work
for `002` is verification and archival of the stale split-ticket, not a second code change
to re-implement architecture that already landed.

## Assumption Reassessment (2026-03-28)

1. The original assumption that `legal-moves.ts` still had two `for (const action of def.actions)` loops is false. The file already computes `const actionsForPhase = getPhaseActionIndex(def).actionsByPhase.get(state.currentPhase) ?? [];` and both raw enumeration loops iterate `actionsForPhase`.
2. `packages/engine/src/kernel/phase-action-index.ts` already exists and matches the intended architecture: a module-level WeakMap cache keyed by `def.actions`, returning `actionsByPhase: ReadonlyMap<PhaseId, readonly ActionDef[]>`.
3. The preflight phase check in [packages/engine/src/kernel/action-applicability-preflight.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/action-applicability-preflight.ts) is still present and should remain. The index narrows iteration; preflight remains the semantic guardrail.
4. The original scope statement "no new tests in this ticket" is wrong for the current repo state. Tests already exist in [packages/engine/test/unit/kernel/phase-action-index.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/phase-action-index.test.ts) and [packages/engine/test/unit/kernel/legal-moves.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts).
5. The original split of `001` module, `002` integration, and `003` tests is not a good architectural unit. The robust architecture was to land the index, integration, and proof together. That work is already documented in archived `001`.
6. The next cleaner architectural improvement in this area was not another phase-index edit; it was removal of repeated action-pipeline scans through a shared lookup. That follow-up already exists separately in archived `88PHAAWAACTFIL-004`.

## Architecture Check

1. The current architecture is better than the original ticket proposal because it already implements the right ownership boundary: a dedicated phase-index module, single lookup in `legal-moves.ts`, and retained semantic checks in preflight.
2. Reapplying the original `002` proposal would add no value and would risk redundant churn. The beneficial change has already been absorbed into the cleaner architecture.
3. The main architectural correction needed in this ticket is process-level, not code-level: remove the stale assumption that this integration is still pending and record that the split-ticket plan was inferior to the implemented cohesive change.
4. No backwards-compatibility shims, aliases, or alternate code paths are warranted here.

## What to Change

### 1. Correct the ticket

- Rewrite this ticket so it accurately reflects the current code and test state.
- Narrow scope from "implement integration" to "verify the already-landed architecture and archive the stale ticket".

### 2. Verify the existing implementation

- Run targeted tests for the phase index and legal-move integration.
- Run repo-level typecheck, lint, and test commands required by the ticket finalization rules.

### 3. Archive this ticket

- If verification passes and no discrepancy remains, mark the ticket completed.
- Add an `Outcome` section explaining that the code change had already landed under archived `001`, and that `002` was corrected and archived as a stale split-ticket.

## Files to Touch

- `tickets/88PHAAWAACTFIL-002.md` (correct, then archive)

## Out of Scope

- Re-implementing the phase-action index.
- Re-editing `packages/engine/src/kernel/legal-moves.ts` unless verification exposes a real defect.
- Removing the preflight phase check.
- Any compiler or CNL changes.
- Broad follow-up architecture work already handled by archived `88PHAAWAACTFIL-004`.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck`
2. `pnpm turbo lint`
3. `pnpm turbo test`
4. Targeted engine tests covering the existing phase-index and legal-move integration

### Invariants

1. The phase index remains a module-level WeakMap cache keyed by `def.actions`.
2. `legal-moves.ts` continues to derive `actionsForPhase` once and use it in both raw enumeration loops.
3. The preflight phase check remains intact.
4. This ticket does not reintroduce split ownership for implementation and tests.

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
- Corrected this ticket to reflect the real codebase state instead of the stale split-ticket plan.
- Verified that the phase-aware enumeration integration already exists in `packages/engine/src/kernel/legal-moves.ts`.
- Verified that dedicated proof already exists in `packages/engine/test/unit/kernel/phase-action-index.test.ts` and `packages/engine/test/unit/kernel/legal-moves.test.ts`.
- Verified repo health with targeted tests plus workspace `typecheck`, `lint`, and `test`.

Deviations from original plan:
- No engine code changes were needed because the proposed integration had already landed under archived `88PHAAWAACTFIL-001`.
- No new tests were added because the relevant behavioral and source-guard coverage already exists and passed unchanged.
- The corrected scope of this ticket is verification and archival of a stale implementation split, not a second implementation pass.

Verification results:
- `pnpm turbo build`
- `node --test packages/engine/dist/test/unit/kernel/phase-action-index.test.js`
- `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
