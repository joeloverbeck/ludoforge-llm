# 91FIRDECDOMCOM-004: Production parity tests for runtime first-decision guards

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — tests/helpers plus a targeted compiler fix exposed by parity testing
**Deps**: archive/tickets/91FIRDECDOMCOM/91FIRDECDOMCOM-003.md

## Problem

The original ticket assumed a broader architecture than the codebase actually
implements: compiled first-decision checks returning `ChoiceOption[]`,
single-decision full bypass, and direct action-level equivalence against
`legalChoicesDiscover`. That is not the current design.

Today the kernel uses **runtime-owned compiled first-decision rejection
guards**:
- `FirstDecisionDomainResult` is `{ compilable, check(ReadContext), description }`
  in `packages/engine/src/kernel/first-decision-compiler.ts`.
- `GameDefRuntime.firstDecisionDomains` owns the immutable compiled results.
- `legal-moves.ts` uses those results as **additive early-rejection guards**
  for:
  - plain actions only when `probePlainActionFeasibility === true`
  - matched pipeline profiles during template admission
- Event-card admission and unsupported paths stay on the canonical interpreter
  path.

The problem this ticket should solve is therefore narrower and better defined:
prove that enabling the runtime first-decision guards does **not change
observable legal-move behavior** on the FITL production game, while still
proving that production FITL exposes meaningful compiled coverage.

## Assumption Reassessment (2026-03-28)

1. The current runtime/compiler surface does **not** expose compiled
   `domain`, `isSingleDecision`, or any synthesized `ChoiceOption[]`.
   `FirstDecisionCheckResult` currently contains `admissible` only.
2. `isMoveDecisionSequenceAdmittedForLegalMove(...)` is still the canonical
   interpreter-backed admission check. The compiled first-decision logic is an
   additive rejection guard, not a replacement.
3. Direct comparison against `legalChoicesDiscover(...).options` is not a valid
   ticket target for the current architecture, because the compiler does not
   attempt to reproduce the downstream choice-legality pipeline.
4. Plain-action first-decision guards do **not** run at bare action-id scope.
   They run in `enumerateParams(...)` after action params are fully bound and a
   real `ReadContext` exists. Equivalence testing must therefore mirror the
   actual `legalMoves` integration boundary rather than comparing raw action ids.
5. Pipeline first-decision guards are evaluated against the matched
   pipeline-profile preflight `ReadContext`, not a generic `(state, activePlayer)`
   surface. `ReadContext` is the right architectural boundary because query
   evaluation needs bindings, adjacency, runtime tables, and overlay state.
6. `packages/engine/test/integration/compiled-condition-equivalence.test.ts`
   and `packages/engine/test/helpers/compiled-condition-production-helpers.ts`
   provide a good production-test pattern to reuse partially:
   validated FITL compilation plus a deterministic progressed-state corpus.
   The parity assertion itself must differ because the first-decision feature is
   integrated at `legalMoves`, not at a standalone predicate API.
7. A fixed percentage coverage gate such as `>30%` is too brittle as a long-term
   architectural contract. Production FITL content can evolve legitimately.
   The better regression guard is:
   - compiled coverage is reported descriptively
   - both action and pipeline compiled coverage remain non-zero
   - legal-move parity holds across the deterministic corpus

## Architecture Check

1. The current architecture is better than the original ticket proposal.
   Runtime-owned rejection guards in `GameDefRuntime` are explicit, testable,
   and aligned with the actual evaluation surface. A compiled `ChoiceOption[]`
   layer would duplicate `legal-choices.ts` semantics without proof that it can
   preserve legality metadata, illegal reasons, deferred predicates, and later
   decision-path behavior.
2. The most valuable proof is **observable parity at the `legalMoves` boundary**:
   same validated FITL definition, same deterministic states, same legal moves
   with compiled guards enabled versus disabled. That is stronger than comparing
   internal booleans in isolation because it verifies the real integration path.
3. A future "ideal architecture" for full bypass would need a broader,
   structurally faithful plan compiler for the first pending choice plus its
   downstream legality semantics. That is a separate design problem. It should
   not be smuggled into this ticket through speculative tests that assume the
   bypass already exists.
4. This ticket should stay conservative: prove the current guard architecture,
   and only make production edits if the parity suite reveals a real defect.

## What to Change

### 1. Add FITL production helper coverage for first-decision parity

Create a dedicated helper module for this ticket, reusing the production FITL
compilation and deterministic state-corpus approach from the compiled-condition
helpers where appropriate.

Suggested helper responsibilities:

```typescript
interface FirstDecisionCoverageSummary {
  readonly compiledActions: number;
  readonly totalActionsWithDecisions: number;
  readonly compiledPipelines: number;
  readonly totalPipelineProfilesWithDecisions: number;
}

function compileFitlValidatedGameDef(): GameDef;
function buildDeterministicFitlStateCorpus(def: GameDef): readonly GameState[];
function summarizeFirstDecisionCoverage(def: GameDef): FirstDecisionCoverageSummary;
function createRuntimeWithDisabledFirstDecisionGuards(runtime: GameDefRuntime): GameDefRuntime;
```

Notes:
- Reuse existing helper logic instead of copy-pasting FITL compilation or corpus
  generation.
- The "disabled" runtime should keep the same runtime-owned architecture and
  simply replace `firstDecisionDomains` with non-compilable/empty maps for the
  parity comparison. Do not introduce a hidden global cache or alternate code
  path.

### 2. Add an integration parity suite at the real behavioral boundary

Create a new integration test that, for each state in the deterministic FITL
corpus, compares:

1. `legalMoves(def, state, undefined, compiledRuntime)` against
   `legalMoves(def, state, undefined, runtimeWithDisabledGuards)`
2. `legalMoves(def, state, { probePlainActionFeasibility: true }, compiledRuntime)`
   against
   `legalMoves(def, state, { probePlainActionFeasibility: true }, runtimeWithDisabledGuards)`

Assertions:
- Move sets are identical.
- Ordering is identical.
- No state in the corpus produces a move that exists only when compiled guards
  are disabled.
- No state in the corpus loses a move when compiled guards are enabled.

This directly proves that the current compiled first-decision guards preserve
observable behavior for both pipeline admission and plain-action feasibility
probing.

### 3. Add descriptive production coverage assertions

In the same integration suite, compute and log first-decision compiled coverage
for FITL production:
- total actions with a structural first decision
- compiled actions
- total pipeline profiles with a structural first decision
- compiled pipeline profiles
- state corpus size

Assert:
- there is at least one structurally decided plain action
- there is at least one structurally decided pipeline profile
- there is at least one compiled plain action
- there is at least one compiled pipeline profile
- the deterministic corpus contains multiple progressed states

Do **not** add a brittle fixed-percentage assertion unless the measured ratio
and product goals justify it explicitly in a future ticket.

### 4. Only patch production code if parity testing proves a bug

If the new suite exposes a discrepancy, use TDD:
- keep the failing parity/assertion coverage
- make the smallest architecturally correct production fix
- avoid speculative refactors unless the failure demonstrates a real design gap

If the suite passes without code changes, keep this ticket test-only and record
that explicitly in the Outcome section when archiving.

## Files to Touch

- `packages/engine/test/integration/first-decision-runtime-parity.test.ts` (new)
- `packages/engine/test/helpers/first-decision-production-helpers.ts` (new)
- `packages/engine/src/kernel/*.ts` only if the parity suite reveals a verified bug

## Out of Scope

- Synthesizing compiled `ChoiceOption[]` domains.
- Single-decision full bypass of `legalChoicesDiscover`.
- Reworking `FirstDecisionCheckResult` to add `domain` or `isSingleDecision`.
- Event-card first-decision compilation.
- Replacing `GameDefRuntime.firstDecisionDomains` with a hidden cache layer.
- Arbitrary fixed-percentage production coverage gates.
- Broad refactors unrelated to a parity failure exposed by the new tests.

## Acceptance Criteria

### Tests That Must Pass

1. Ticket assumptions are corrected to match the live codebase before
   implementation begins.
2. A deterministic FITL production state corpus is built and reused by the new
   parity suite.
3. `legalMoves` returns identical results with compiled first-decision guards
   enabled versus disabled across the corpus.
4. `legalMoves(..., { probePlainActionFeasibility: true })` also returns
   identical results with compiled first-decision guards enabled versus disabled
   across the corpus.
5. FITL production coverage is reported and proves non-zero compiled coverage
   for both plain actions and pipeline profiles.
6. If the parity suite exposes a defect, the fix lands with the failing test
   retained and strengthened as needed.
7. Relevant engine tests, lint, and type checks pass.

### Invariants

1. The proof target is observable `legalMoves` parity, not speculative
   `ChoiceOption[]` equivalence that the runtime does not currently implement.
2. The runtime-owned architecture remains explicit:
   `GameDefRuntime.firstDecisionDomains` is the only compiled first-decision
   cache owner in scope for this ticket.
3. Unsupported or runtime-resolved paths continue to fall through to the
   canonical interpreter path.
4. No backwards-compatibility aliases, duplicate cache paths, or hidden global
   state are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/first-decision-runtime-parity.test.ts` —
   FITL production parity for `legalMoves` with compiled first-decision guards
   enabled vs disabled, covering both default enumeration and
   `probePlainActionFeasibility`.
2. `packages/engine/test/helpers/first-decision-production-helpers.ts` —
   shared FITL production compilation, deterministic corpus, coverage summary,
   and runtime-disabling helpers for the parity suite.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Added `packages/engine/test/helpers/first-decision-production-helpers.ts`
    to reuse FITL production compilation/state-corpus setup and summarize
    compiled first-decision coverage.
  - Added `packages/engine/test/integration/first-decision-runtime-parity.test.ts`
    to compare `legalMoves` output with compiled first-decision guards enabled
    versus disabled across a deterministic FITL production corpus, for both
    default enumeration and `probePlainActionFeasibility`.
  - Strengthened
    `packages/engine/test/unit/kernel/first-decision-compiler.test.ts` with the
    missing invariant exposed by the parity suite: empty-domain `chooseN`
    remains admissible when `min = 0`, but not when selections are required.
  - Fixed `packages/engine/src/kernel/first-decision-compiler.ts` so compiled
    direct `chooseN` guards respect resolved cardinality instead of treating
    every empty option set as unsatisfiable.
- Deviations from original plan:
  - The corrected ticket started as parity/coverage work centered on the
    current architecture. Production code changed only because the new FITL
    parity suite exposed a real false negative in the compiled guard path.
  - The original ticket proposal around compiled `ChoiceOption[]` domain
    fidelity and single-decision bypass remained out of scope; the completed
    work kept the existing runtime-owned rejection-guard architecture.
  - The FITL coverage assertion was kept descriptive/non-zero rather than using
    a brittle fixed-percentage gate.
- Verification results:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/first-decision-compiler.test.js` ✅
  - `node --test packages/engine/dist/test/integration/first-decision-runtime-parity.test.js` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm -F @ludoforge/engine test` ❌
    - Fails in the current repo on missing `dist` test artifacts / missing
      `dist/src/kernel/perf-profiler.js`, which is broader than this ticket's
      change surface and not caused by the first-decision parity fix.
