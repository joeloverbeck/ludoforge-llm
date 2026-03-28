# 92ENUSTASNA-004: Wire snapshot creation in enumerateRawLegalMoves

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No production change expected; ticket now scopes regression coverage plus archival
**Deps**: archive/tickets/92ENUSTASNA/92ENUSTASNA-003-thread-snapshot-through-pipeline-policy.md

## Problem

The original ticket assumed one final production step remained: create the enumeration snapshot at the top of `enumerateRawLegalMoves` and pass it through the legal-move discovery evaluation path. That assumption is stale against the current codebase.

## Assumption Reassessment (2026-03-28)

1. The ticket path assumption was wrong: the implementation lives in [packages/engine/src/kernel/legal-moves.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts), not under `src/agents/`.
2. `enumerateRawLegalMoves` is defined in [packages/engine/src/kernel/legal-moves.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts) and already creates `const snapshot = createEnumerationSnapshot(def, state);` once per raw enumeration call.
3. The current file already threads that snapshot through the direct `evaluateDiscoveryPipelinePredicateStatus(...)` call sites and through the `enumerateParams(...)` options path that feeds the nested discovery evaluation branch.
4. Snapshot-aware compiled predicate behavior is already covered in [packages/engine/test/unit/kernel/condition-compiler.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/condition-compiler.test.ts) and [packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts), including the non-`state.activePlayer` evaluation-player case.
5. What is still missing is a direct regression guard at the `legal-moves.ts` integration boundary so the already-landed snapshot wiring cannot silently regress during future refactors.

## Architecture Check

1. Re-implementing snapshot wiring in production code would be the wrong move. It would duplicate architecture that is already correct and violate the repo's no-alias/no-redundant-path rules.
2. The clean architecture is the current one: one snapshot per `enumerateRawLegalMoves` invocation, threaded explicitly into compiled-predicate consumers, with raw-state fallback only outside enumeration paths.
3. The valuable work left for this ticket is to codify that architecture in tests and then archive the ticket as completed.
4. A larger architectural rethink is not justified here. The current snapshot transport is simpler and more extensible than introducing extra wrappers, hidden global state, or alternate evaluator entrypoints.

## What to Change

### 1. Keep production code unchanged unless a discrepancy is discovered during verification

The intended snapshot wiring already exists. Do not rewrite `legal-moves.ts` unless verification finds a real defect.

### 2. Add a legal-moves integration regression guard

Strengthen `packages/engine/test/unit/kernel/legal-moves.test.ts` so the test suite directly asserts:

- `enumerateRawLegalMoves` creates one enumeration snapshot from `(def, state)`
- root-state `enumerateParams(...)` calls receive that `snapshot`
- `evaluateDiscoveryPipelinePredicateStatus(...)` call sites in `legal-moves.ts` continue to pass `snapshot`

### 3. Archive this ticket after verification

Once the regression coverage is in place and the relevant engine tests/lint pass, mark this ticket completed and archive it under `archive/tickets/92ENUSTASNA/`.

## Files to Touch

- [tickets/92ENUSTASNA-004-wire-snapshot-in-legal-moves.md](/home/joeloverbeck/projects/ludoforge-llm/tickets/92ENUSTASNA-004-wire-snapshot-in-legal-moves.md)
- [packages/engine/test/unit/kernel/legal-moves.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts)

## Out of Scope

- Re-landing production snapshot wiring already completed by archived ticket `92ENUSTASNA-003`
- Broad refactors of the legal-moves architecture
- The player-generalization follow-up already tracked separately in archived ticket `92ENUSTASNA-008`
- Performance benchmarking (ticket 006)
- Any new compiled aggregate consumer of `snapshot.zoneTotals`; that follow-up belongs in `92ENUSTASNA-007`

## Acceptance Criteria

### Tests That Must Pass

1. No implementation should proceed from this ticket as currently written.
2. The test suite must directly guard the `legal-moves.ts` snapshot creation and propagation boundary.
3. The ticket must be archived after verification so the active ticket set no longer implies that production wiring is missing.

### Invariants

1. The active ticket set should not duplicate already-delivered architecture.
2. `enumerateRawLegalMoves` remains the single owner of enumeration snapshot creation.
3. Snapshot transport inside legal-move discovery remains explicit, not implicit or global.

## Test Plan

### New/Modified Tests

1. Add/strengthen `packages/engine/test/unit/kernel/legal-moves.test.ts` to guard snapshot creation and propagation in `legal-moves.ts`.

### Commands

1. Run the relevant engine unit coverage for snapshot/compiler/pipeline/legal-moves behavior.
2. Run engine lint so the archived ticket reflects a clean verified state.

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Reassessed the ticket against the live codebase and corrected stale assumptions.
  - Confirmed the production snapshot wiring was already implemented in `packages/engine/src/kernel/legal-moves.ts`.
  - Added a regression guard in `packages/engine/test/unit/kernel/legal-moves.test.ts` to lock in one-shot snapshot creation plus explicit snapshot threading through raw legal-move discovery entrypoints.
- Deviations from original plan:
  - No production code changes were needed. The original implementation plan was stale because the architecture had already landed.
  - The ticket was narrowed from "wire snapshot into legal moves" to "verify, guard, and archive the already-landed wiring."
- Verification results:
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js packages/engine/dist/test/unit/kernel/pipeline-viability-policy.test.js packages/engine/dist/test/unit/kernel/condition-compiler.test.js packages/engine/dist/test/unit/kernel/enumeration-snapshot.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm run check:ticket-deps`
