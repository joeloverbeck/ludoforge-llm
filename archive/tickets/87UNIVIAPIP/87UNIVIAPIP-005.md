# 87UNIVIAPIP-005: Reassess discovery-cache coverage and close remaining proof gap

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Tests only unless reassessment finds a real behavioral gap
**Deps**: [archive/tickets/87UNIVIAPIP/87UNIVIAPIP-004.md](archive/tickets/87UNIVIAPIP/87UNIVIAPIP-004.md)

## Problem

This ticket was written as if discovery-cache coverage for Spec 87 had not yet been established and as if the cache plumbing were still pending.

That assumption is no longer true. The current repo already contains:

1. The cache type and resolve-time option surface in `move-decision-sequence.ts`
2. Classification-side cache threading in `legal-moves.ts`
3. Probe-side cache forwarding in `apply-move.ts`
4. Existing unit guards for resolve-time cache hit/miss behavior and classification threading
5. The production integration parity suite at `packages/engine/test/integration/classified-move-parity.test.ts`

The remaining question is narrower:

Do we still need extra coverage to prove the architecture is correct end to end, or are the current runtime tests plus architecture guards already sufficient?

## Assumption Reassessment (2026-03-27)

1. `DiscoveryCache` already exists and is exported from `packages/engine/src/kernel/move-decision-sequence.ts`.
2. `ResolveMoveDecisionSequenceOptions` already includes `discoveryCache`.
3. `MoveDecisionSequenceSatisfiabilityOptions` already includes `discoverer`.
4. `probeMoveViability` already accepts an optional `discoveryCache` parameter and already forwards it into `resolveMoveDecisionSequence`.
5. `enumerateRawLegalMoves` already creates a per-enumeration `DiscoveryCache` and `enumerateLegalMoves` already uses it during classification.
6. The ticket's original claim of "Cache mechanism needs explicit coverage" is only partially true. Explicit coverage already exists in:
   - `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
   - `packages/engine/test/unit/kernel/apply-move.test.ts`
   - `packages/engine/test/unit/kernel/legal-moves.test.ts`
   - `packages/engine/test/integration/classified-move-parity.test.ts`
7. The original dependency path was stale. Ticket 004 is already archived at `archive/tickets/87UNIVIAPIP/87UNIVIAPIP-004.md`.
8. `compileProductionSpec()` exists, but the more direct production fixture helper for FITL runtime tests is `getFitlProductionFixture()` from `packages/engine/test/helpers/production-spec-helpers.ts`.

## Architecture Reassessment

1. The current architecture is better than any alternative that attaches cache state to `Move`, `ClassifiedMove`, or other hot-path runtime objects. The existing parallel `Map<Move, ChoiceRequest>` remains the cleanest approach.
2. The explicit threading path
   `enumerateRawLegalMoves -> enumerateLegalMoves -> classifyEnumeratedMoves -> probeMoveViability -> resolveMoveDecisionSequence`
   is still preferable to introducing a larger session abstraction today. It is explicit, testable, and does not hide mutable cross-stage state behind a new object boundary.
3. The current design already follows the repo's no-alias / no-backwards-compatibility rule. There is one canonical cache type and one canonical resolve-time option field.
4. The real architectural risk here is not implementation quality; it is stale ticket scope that no longer matches the codebase.

## Updated Scope

1. Correct this ticket so it reflects the current code and test landscape.
2. Reassess whether an additional runtime proof test is still justified.
3. If a real coverage gap remains, add the smallest robust test that proves it.
4. Run the relevant engine test suites plus typecheck and lint.
5. Mark the ticket completed and archive it with an accurate outcome.
6. Archive `specs/87-unified-viability-pipeline.md` once the ticket is complete.

## Proposed Test Work

### Existing Coverage Already Present

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
   - direct resolve-time cache hit by move identity
   - direct resolve-time cache miss for structurally equal but different move objects
   - injected discoverer coverage for satisfiability helpers
2. `packages/engine/test/unit/kernel/apply-move.test.ts`
   - direct `probeMoveViability(..., discoveryCache)` behavior
   - architecture guard for forwarding `discoveryCache` into `resolveMoveDecisionSequence`
3. `packages/engine/test/unit/kernel/legal-moves.test.ts`
   - architecture guard that cached discoverer is threaded only through root-state admission sites
   - architecture guard that `discoveryCache` reaches classified move probing
4. `packages/engine/test/integration/classified-move-parity.test.ts`
   - production parity for classified enumeration on FITL and Texas Hold'em

### Only Additional Test Justified If Needed

If reassessment still finds a missing proof, add one focused runtime test that proves the public enumeration pipeline preserves the move-identity contract needed for event cache reuse while still missing for distinct parameterized variants.

Do not add broad duplicate coverage for behavior already directly exercised in the existing unit suite.

## Files Expected To Change

- `tickets/87UNIVIAPIP-005.md` — correct assumptions and scope
- `packages/engine/test/...` — only if reassessment finds a real remaining proof gap
- `archive/tickets/87UNIVIAPIP/87UNIVIAPIP-005.md` — archived completed record
- `archive/specs/87-unified-viability-pipeline.md` — archived spec after completion

## Out of Scope

- Re-implementing discovery-cache plumbing already present in kernel code
- Adding cache state to hot-path runtime objects
- Introducing compatibility aliases, alternate cache APIs, or shim layers
- Premature refactor to a session object unless reassessment uncovers a concrete design failure
- Agent-completion caching or cross-turn caching
- Performance retuning beyond verification that current behavior has not regressed materially

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
2. `packages/engine/test/unit/kernel/apply-move.test.ts`
3. `packages/engine/test/unit/kernel/legal-moves.test.ts`
4. `packages/engine/test/integration/classified-move-parity.test.ts`
5. Relevant performance verification for the Spec 87 cache path
6. `pnpm turbo test`
7. `pnpm turbo typecheck`
8. `pnpm turbo lint`

### Invariants

1. The cache remains a per-enumeration parallel structure, not a field on hot-path runtime objects.
2. `probeMoveViability` still executes the full validation pipeline; the cache only deduplicates discovery work inside `resolveMoveDecisionSequence`.
3. Distinct move objects remain distinct cache keys; there is no aliasing by structural equality.
4. Ticket and spec records must describe the actual landed architecture, not a superseded plan.

## Test Plan

### Existing Tests

1. `pnpm -F @ludoforge/engine test -- test/unit/kernel/move-decision-sequence.test.ts`
2. `pnpm -F @ludoforge/engine test -- test/unit/kernel/apply-move.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/unit/kernel/legal-moves.test.ts`
4. `pnpm -F @ludoforge/engine test -- test/integration/classified-move-parity.test.ts`

### Broader Verification

1. `pnpm -F @ludoforge/engine test -- test/performance/policy-agent.perf.test.ts`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-27
- Actual changes vs originally planned:
  - Corrected the ticket to match the already-landed discovery-cache architecture and current test surface.
  - Added one focused architecture-guard test in `packages/engine/test/unit/kernel/legal-moves.test.ts` to prove the remaining unguarded invariant: filtered raw-enumeration `Move` objects are passed into classification without losing identity, which is what makes `DiscoveryCache` reuse viable.
  - Did not add new kernel behavior because reassessment showed the cache plumbing, probe threading, and parity coverage were already in place.
- Architectural conclusion:
  - The current architecture is preferable to any redesign that stores cache state on hot-path runtime objects or introduces aliasing.
  - The explicit threading path remains clean, robust, and extensible enough for the current scope.
  - A larger session abstraction is still unnecessary at this complexity level.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- test/unit/kernel/move-decision-sequence.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- test/unit/kernel/apply-move.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- test/unit/kernel/legal-moves.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- test/integration/classified-move-parity.test.ts` passed.
  - `node --test dist/test/performance/policy-agent.perf.test.js` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
- Notes:
  - `pnpm -F @ludoforge/engine test -- test/performance/policy-agent.perf.test.ts` is not a valid way to run engine performance coverage in this repo because the default test lane excludes `dist/test/performance/**`. The correct entrypoint is `pnpm -F @ludoforge/engine test:performance` or a direct `node --test dist/test/performance/...` invocation after build.
