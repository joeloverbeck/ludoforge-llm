# 92ENUSTASNA-005: Equivalence tests — snapshot vs raw state evaluation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: archive/tickets/92ENUSTASNA/92ENUSTASNA-003-thread-snapshot-through-pipeline-policy.md, archive/tickets/92ENUSTASNA/92ENUSTASNA-008-generalize-snapshot-player-access.md

## Problem

The spec's acceptance criterion #3 requires proving that compiled-with-snapshot evaluation produces identical results to compiled-without-snapshot evaluation for ALL pipeline predicates across N random states. This is the correctness proof that the snapshot optimization is safe.

## Assumption Reassessment (2026-03-28)

1. `compileProductionSpec()` helper exists in `packages/engine/test/helpers/production-spec-helpers.ts` — assumed from CLAUDE.md testing conventions.
2. `getCompiledPipelinePredicates(def)` returns a `Map<ConditionAST, CompiledConditionPredicate>` — confirmed from `compiled-condition-cache.ts`.
3. `createEnumerationSnapshot(def, state)` already exists.
4. `initialState(def, seed)` creates a deterministic starting state — standard kernel API.
5. Random state generation can be done by applying N random moves from `legalMoves` with different seeds.
6. Archived ticket `92ENUSTASNA-008` removed the temporary player-match guard and generalized the snapshot to expose the full `perPlayerVars` branch.
7. The repo already contains `packages/engine/test/integration/compiled-condition-equivalence.test.ts` plus `packages/engine/test/helpers/compiled-condition-production-helpers.ts`, which compile FITL, build a deterministic state corpus, and compare compiled predicates against the interpreter.
8. FITL's current compiled production pipeline predicate cache does NOT exercise the full snapshot surface. As of 2026-03-28 it contains 15 compiled predicates; all read `gvar`, 13 also read `binding`, and none read compiled `pvar(active)` or aggregate zone totals.
9. Therefore a FITL-only production equivalence test cannot, by itself, prove the generalized `perPlayerVars` snapshot path or aggregate-count snapshot path. Those require focused unit parity tests in addition to the production integration proof.

## Architecture Check

1. This is a pure test ticket — no production code changes.
2. The clean proof boundary is the compiled-predicate boundary, because that is exactly where Spec 92 adds optional snapshot reads. Creating a second test-only `legalMoves without snapshot` path or monkey-patching enumeration internals would add brittle harness complexity without improving the architectural contract.
3. FITL production integration coverage is still valuable, but it only proves equivalence for the production predicate shapes FITL currently uses (`gvar` plus many binding-driven predicates).
4. To cover the full current snapshot consumer surface cleanly, the test plan must combine:
   - production integration parity for all actual FITL compiled pipeline predicates
   - focused unit parity for executor-shifted `pvar(active)` access
   - focused unit parity for compiled aggregate zone-total access
5. This is more beneficial than a raw-`legalMoves` dual-call architecture because it keeps one canonical enumeration path and proves equivalence exactly where snapshot behavior diverges.

## What to Change

### 1. Extend the existing production compiled-condition equivalence harness with snapshot parity

In `packages/engine/test/integration/compiled-condition-equivalence.test.ts`, extend the existing FITL production predicate corpus so each compiled predicate sample is validated across three semantically equivalent paths:
- compiled WITH snapshot: `compiled(state, activePlayer, bindings, createEnumerationSnapshot(def, state))`
- compiled WITHOUT snapshot: `compiled(state, activePlayer, bindings, undefined)`
- interpreter: `evalCondition(condition, ctx)`

The assertions should compare both boolean results and error compatibility (`MISSING_BINDING`, `MISSING_VAR`, `TYPE_MISMATCH`) so snapshot use cannot change failure semantics either.

Reuse the deterministic FITL state corpus and binding-variant helper that already exist instead of creating a second production harness.

### 2. Add focused unit parity for executor-shifted `pvar(active)` snapshot reads

In `packages/engine/test/unit/kernel/condition-compiler.test.ts`, add a parity test where:
- `state.activePlayer` and the evaluation context's `activePlayer` differ
- the compiled condition reads `pvar(active)`
- evaluation WITH snapshot equals evaluation WITHOUT snapshot equals interpreter behavior

This closes the exact gap left by the FITL production corpus.

### 3. Add focused unit parity for compiled aggregate snapshot reads

In `packages/engine/test/unit/kernel/condition-compiler.test.ts`, add a parity test where a compiled aggregate zone-token count is evaluated:
- WITH a real `createEnumerationSnapshot(def, state)`
- WITHOUT snapshot
- via `evalCondition`

This proves the current aggregate snapshot consumer path is semantically identical without inventing a second enumeration architecture.

## Files to Touch

- `packages/engine/test/integration/compiled-condition-equivalence.test.ts` (modify)
- `packages/engine/test/unit/kernel/condition-compiler.test.ts` (modify)

## Out of Scope

- Modifying any production code
- Performance benchmarking (ticket 006)
- Adding a test-only alternate `legalMoves` or pipeline-evaluation path that disables snapshots
- Testing non-compiled conditions (they don't use the snapshot — spec explicitly states this)
- Testing snapshot correctness in isolation (covered by ticket 001 tests)
- Proving equivalence for future structured zone-total snapshot consumers; that belongs with `92ENUSTASNA-007` and any later aggregate-compiler ticket

## Acceptance Criteria

### Tests That Must Pass

1. The FITL production integration suite explicitly iterates ALL predicates from `getCompiledPipelinePredicates(def)` and proves compiled WITH snapshot == compiled WITHOUT snapshot == interpreter semantics across the deterministic state/binding corpus.
2. Snapshot parity coverage preserves error semantics as well as boolean results.
3. A focused unit test proves executor-shifted compiled `pvar(active)` evaluation remains equivalent with and without snapshot.
4. A focused unit test proves compiled aggregate zone-total evaluation remains equivalent with and without snapshot.
5. Existing suite: `pnpm turbo test --force`

### Invariants

1. No production code modified by this ticket.
2. The test is deterministic — uses fixed seeds for state generation.
3. The test does not weaken any existing assertion.
4. The final test design does not introduce a second snapshot-disabled legal-moves architecture just for comparison.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compiled-condition-equivalence.test.ts` — extend the FITL production compiled-predicate corpus to assert snapshot vs raw compiled parity and interpreter parity across deterministic states/bindings.
2. `packages/engine/test/unit/kernel/condition-compiler.test.ts` — add executor-shifted `pvar(active)` snapshot parity and aggregate snapshot parity coverage.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/compiled-condition-equivalence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js`
4. `pnpm turbo test --force`

## Outcome

- Outcome amended: 2026-03-28
- Completion date: 2026-03-28
- What changed:
  The ticket was corrected to match the real codebase: FITL production compiled predicates already had an integration equivalence harness, but that production corpus only exercises `gvar` plus binding-driven predicates, not compiled `pvar(active)` or aggregate snapshot reads. The implementation therefore extended `packages/engine/test/integration/compiled-condition-equivalence.test.ts` to prove snapshot-vs-raw-vs-interpreter parity across the FITL production corpus, and strengthened `packages/engine/test/unit/kernel/condition-compiler.test.ts` with focused parity coverage for executor-shifted `pvar(active)` access and compiled aggregate zone-total access.
- Deviations from original plan:
  The original ticket proposed a brand-new FITL-only unit file and floated a raw-`legalMoves` comparison path. That was not the clean architecture. The final implementation reused the existing production integration harness and proved parity at the compiled-predicate boundary, which is where snapshot behavior actually diverges, while adding focused unit coverage for the snapshot surfaces FITL does not currently hit.
- Verification results:
  `pnpm turbo build` passed.
  `node --test packages/engine/dist/test/integration/compiled-condition-equivalence.test.js` passed.
  `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js` passed.
  `pnpm turbo test --force` passed.
  `pnpm turbo lint` passed.
  At finalization, a follow-up workspace-resolution fix in `packages/runner/tsconfig.json` restored `pnpm turbo typecheck`; `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck` all passed.
