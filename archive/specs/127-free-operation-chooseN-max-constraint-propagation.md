# Spec 127 — Free Operation chooseN Max Constraint Propagation

**Status**: COMPLETED

## Problem

When a free-operation grant carries a `zoneFilter` that constrains the
**count** of a pipeline decision binding (e.g.
`count($targetSpaces) == 1`), the engine does not propagate that
constraint to the `chooseN` max parameter during template completion.
The pipeline's `chooseN` advertises its own `max` (e.g. 99 for a full
operation), and `completeTemplateMove`'s random selector picks a count
between `min` and `max`.  Because the zone-filter constraint is only
evaluated **after** the selection, any random count > 1 triggers a
post-selection zone-filter denial, producing `completionUnsatisfiable`.

With `max = 29` (29 valid destination zones) and `min = 1`, the
probability that random selection picks exactly 1 is 1/29 (~3.4%).
Template completion retries up to `NOT_VIABLE_RETRY_CAP` (7) times,
giving a combined success probability of ~22%.  In practice, both the
PolicyAgent and RandomAgent almost always fail, producing `agentStuck`.

## Reassessment Update (2026-04-13)

The original draft correctly identified the singleton binding-count
constraint, but it under-described the live root cause in the current
codebase.

### Verified findings

1. The FITL rule-authoritative source is correct. Card 71 ("An Loc")
   in `data/games/fire-in-the-lake/41-events/065-096.md` explicitly
   encodes a shaded free NVA March into exactly one City via
   `count($targetSpaces) == 1`, followed by two same-city Attacks.

2. In the original seed-1000 stuck witness, the active free-operation context
   includes overlapping applicable March grants:
   - `freeOpEffect:1:nva:2` with `zoneFilter: in($zone, grantContext.selectedSpaces)`
   - `freeOp:1:2:event:0` with the An Loc singleton-city `and` filter

3. The current execution overlay exposes a merged legality
   `zoneFilter` that becomes an `or` across applicable grants. Ticket
   001's extractor intentionally stops at `or`, so directly reading
   `env.freeOperationOverlay?.zoneFilter` is insufficient for this
   witness.

4. The correct clamp source is the **highest-priority applicable
   grant** under the existing free-operation priority contract, not
   the first applicable grant and not the merged legality union.

5. Even after the first `$targetSpaces` request is correctly clamped to
   `max = 1`, `completeTemplateMove` can still return
   `unsatisfiable`. The remaining failure is in later completion
   steps, where discovery-only pending requests lose legality-ranked
   option information that `legalChoicesEvaluate` already knows.

### Corrected root cause

This is a two-part engine coordination bug:

1. **Wrong governing filter at completion time**:
   completion needs the highest-priority applicable grant's concrete
   `zoneFilter` for binding-count extraction, while legality still
   needs the merged union filter.

2. **Later-decision legality loss during template completion**:
   after the first destination choice, completion still samples from
   discovery-only requests that can include many already-illegal
   branches.

The full witness therefore requires more than a narrow
`chooseN.max` clamp in `effects-choice.ts`.

6. The original seed-1000 simulator path has drifted on the live
   codebase and no longer reaches the old stuck state, so the active
   regression proof must use a bounded synthetic overlapping-grant
   witness instead of a stale full-game trace.

### Reproduction

Use a bounded synthetic witness in
`packages/engine/test/integration/fitl-free-operation-march-completion.test.ts`.

That regression should:

1. Build a minimal game-agnostic action pipeline with:
   - `chooseN $targetSpaces`
   - a later branch point that includes one already-illegal path and
     one legal path
2. Construct a witness state with 2 overlapping applicable
   free-operation grants for the same action:
   - a higher-priority singleton grant with
     `and(count($targetSpaces) == 1, in($zone, ...))`
   - a lower-priority overlapping grant that broadens legality and
     causes the merged legality filter to become `or`
3. Assert there are 2 legal free-operation templates for the target
   action.
4. Assert `extractBindingCountBounds` returns no bounds from the
   merged `or` legality filter.
5. Assert the completion-only governing filter still yields
   `$targetSpaces.max === 1`.
6. Assert guided singleton completion succeeds.
7. Assert unguided random completion succeeds end-to-end and chooses
   the legal later branch instead of drifting into the dead branch.

This keeps the proof bounded, deterministic, and directly tied to the
architectural root cause even though the historical full-game seed no
longer reproduces on the live codebase.

## Scope

### In scope

- Diagnose and fix the constraint propagation gap between
  free-operation `zoneFilter` binding-count constraints and `chooseN`
  max parameters during template completion.
- Regression test using the bounded overlapping-grant witness
  described above.
- The fix must be **game-agnostic** — it cannot hardcode FITL-specific
  logic into the engine.

### Out of scope

- Changing the FITL game spec's `insurgent-march-select-destinations`
  macro (the macro's max computation is correct for the information
  available to it; the engine should handle the zone-filter
  constraint).
- Changing the tournament runner to handle `agentStuck` differently
  (that is a workaround, not a fix).
- Changing the simulator's `agentStuck` handling (same — workaround).
- Adding special-case logic in `legal-choices.ts` for singleton
  chooseN evaluation (see Lessons from Prior Attempt).
- Modifying event-play viability budgets or probe resolution
  classification (see Lessons from Prior Attempt).
- Adding FITL-specific optimizations to PolicyAgent or the kernel
  (Foundation 1 violation).

## Analysis

The root cause is a **coordination gap** between two subsystems:

1. **Pipeline `chooseN` max computation**: Evaluated at effect
   execution time.  Considers `__actionClass` and
   `__freeOperation` bindings, but NOT the free-operation grant's
   `zoneFilter`.

2. **Free-operation zone-filter validation**: Evaluated AFTER the
   `chooseN` selection is committed, during `probeMoveViability` or
   the free-operation legality policy.  Rejects the move if the
   zone filter (which may constrain binding counts) is not satisfied.

The `chooseN` has no mechanism to query the active free-operation
grant's zone filter for binding-count constraints.  The zone filter is
stored on the grant object in `turnOrderState`, not on the pipeline or
the decision.

### Why this only manifests with free operations

Regular operations (full or limited) encode their max directly in the
pipeline's `chooseN` — `max: 1` for limited, `max: 99` for full.
Free operations reuse the full-operation pipeline (`max: 99`) but add
a zone filter that further constrains the selection.  The zone filter
is the grant author's way of restricting the free operation, but it
operates at a different layer than the pipeline's `chooseN`.

### Affected code paths

| Module | Role |
|--------|------|
| `packages/engine/src/kernel/move-completion.ts` | `completeTemplateMove` — random selection uses `chooseN` max |
| `packages/engine/src/kernel/free-operation-viability.ts` | Zone-filter evaluation after selection |
| `packages/engine/src/kernel/legal-choices.ts` | `legalChoicesEvaluate` — where grant context and zone filters are resolved. Note: `mapChooseNOptions` is internal (not exported) and is NOT a modification target |
| `packages/engine/src/agents/prepare-playable-moves.ts` | Template completion retry loop — limited retries hide the issue |

## Lessons from Prior Attempt (MANDATORY — do not repeat these mistakes)

A previous implementation of this spec (commits bab15c01 through
a596d6c1, now reverted) correctly extracted zone-filter constraints
but applied them in the wrong architectural layer, causing simulation
hangs, event test failures, and performance regressions.

### What the prior attempt did

1. **Created `zone-filter-constraint-extraction.ts`** to pattern-match
   zone-filter ASTs and extract binding-count bounds.  **This was
   correct and should be reused.**

2. **Added a 165-line "singleton chooseN probe path"** inside
   `mapChooseNOptions()` in `legal-choices.ts` that evaluated
   free-operation moves through a special recursive probe loop
   (`collapseTrivialPending()`).  **This was the primary cause of
   simulation hangs** — the probe loop had no budget, no cycle
   detection, and could recurse indefinitely through
   `chooseN → probe → chooseN → probe → ...` chains.

3. **Added `classifyExactFreeOperationProbeMoveSatisfiability`** — a
   callback from `legal-choices.ts` back into itself via
   `legalChoicesWithPreparedContextStrict()`.  **This created circular
   evaluation chains** between legal-choices and move-decision-sequence,
   causing unbounded computation.

4. **Changed chooseN option resolution** from `'ambiguous'`/`'stochastic'`
   to `'exact'` for cases where probes returned null or
   pendingStochastic.  **This was semantically incorrect** — marking
   genuinely unknown results as "exact" misled the option resolution
   algorithm.

5. **Added `EVENT_PLAY_GRANT_VIABILITY_BUDGETS`** with
   `maxParamExpansions: 4, maxDecisionProbeSteps: 4` to cap probe
   work during event-play checks.  **These were far too tight**
   (defaults are 500K/4096), causing 9 FITL event tests to fail
   across cards 44 (Ia Drang), 59 (Plei Mei), 62 (Cambodian Civil
   War), and 71 (An Loc).

6. **Added FITL-specific hardcoding** in PolicyAgent (`enableFitl-
   Optimizations`, `chooseMoveCache`, single-move fast-path keyed on
   `metadata.id === 'fire-in-the-lake'`).  **This violated
   Foundation 1** (engine-agnosticism).

### Root causes of the failures

| Failure | Cause | Lesson |
|---------|-------|--------|
| Simulation hangs (seed 1001+ with RandomAgent) | Unbounded `collapseTrivialPending()` recursion in legal-choices singleton path | **Do not add recursive probe loops without budgets** |
| Card-62/44/71/59 event test failures | Event-play viability budgets too tight (4/4 vs default 500K/4096) | **Do not add budgets as a fix for combinatorial explosion — fix the explosion** |
| Performance regression | Circular callback: legal-choices → move-decision-sequence → legal-choices | **Do not create circular evaluation dependencies** |
| Foundation 1 violation | FITL-specific caching and branching in PolicyAgent | **All fixes must be game-agnostic** |

### What the prior attempt got right (reuse these)

1. **Zone-filter AST constraint extraction**: The `extractBinding-
   CountConstraints()` / `extractBindingCountBoundsMap()` logic is
   correct, pure, and well-tested.  Pattern-matching `count($binding)`
   comparisons in zone-filter `and` nodes is the right approach.

2. **Problem diagnosis**: The spec's analysis of the coordination gap
   between `chooseN` max and zone-filter binding-count constraints is
   accurate.

### What the prior attempt got wrong (avoid these)

1. **Applied constraints in evaluation layers, not at the source.**
   Constraints were extracted but never used to clamp `chooseN.max`.
   Instead, the implementation added special probe logic to
   legal-choices to work around the unclamped max.  **The fix must
   clamp max BEFORE option enumeration, not during evaluation.**

2. **Modified legal-choices.ts extensively.** Adding 165+ lines of
   singleton probe logic to legal-choices violated KISS and introduced
   unbounded recursion.  **legal-choices.ts must not be modified
   beyond minimal changes to thread constraint data.**

3. **Modified resolution classification.** Changing `'ambiguous'` to
   `'exact'` was a cosmetic attempt to mask unresolved probes.
   **Do not change resolution semantics.**

4. **Used budgets to hide bugs.** Adding tight budgets to event-play
   viability checks masked the combinatorial explosion without fixing
   it.  **Do not add new budget constants to work around issues
   introduced by the fix.**

## Recommendation

## Outcome

- Completion date: 2026-04-13
- What changed:
  - added a completion-only governing free-operation filter sourced from the highest-priority applicable grant
  - clamped free-operation `chooseN.max` from that governing filter instead of the merged legality union
  - constrained later-step legality-guided completion to free-operation templates only
  - replaced the stale seed-1000 simulator witness with a bounded synthetic overlapping-grant regression
- Deviations from original plan:
  - the historical seed-1000 reproducer no longer existed on the live codebase, so the final proof surface shifted to a bounded synthetic witness
  - the final implementation avoided global completion-path widening after verification showed that broader change caused unrelated regressions
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-free-operation-march-completion.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:integration:fitl-events`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
  - all passed on the final patch

**Option A (engine-level max clamping)** is now the recommended
approach, informed by the lessons from the prior attempt.

The implementation should:

1. **Extract binding-count constraints from the zone filter** (reuse
   the `extractBindingCountConstraints` approach from the prior
   attempt's first commit).

2. **Clamp `chooseN.max` at the source** — in `effects-choice.ts`
   (`applyChooseN`, around line 772) where chooseN requests are built,
   BEFORE options are enumerated.  If
   `env.freeOperationOverlay?.zoneFilter` exists, call
   `extractBindingCountBounds(zoneFilter, bind)` — the function
   returns null when the binding name does not appear in the filter,
   making a separate `moveZoneBindings` check redundant.  When a
   bound is returned, intersect the constraint's upper bound with the
   pipeline's `max`.  Concretely, the existing line
   `const clampedMax = Math.min(maxCardinality, normalizedOptions.length)`
   at `effects-choice.ts:772` gains a third argument for the
   extracted upper bound.

3. **Do not modify `legal-choices.ts`** beyond minimal changes (if
   any) to pass the active grant's constraints into the effects
   context.  The zone filter is already available in `EffectEnv` via
   `freeOperationOverlay`, so no new threading may be needed.  No
   new probe paths, no singleton special cases, no resolution changes.

4. **Do not modify event-execution.ts, free-operation-viability.ts,
   policy-agent.ts, or move-decision-sequence.ts.** The fix lives
   in the constraint-extraction layer and the chooseN construction
   layer only.

5. **Do not add new budget constants or modify existing ones.**

### Why Option A over Option B

The original spec recommended Option B (retry on denial) as the
immediate fix.  However, the prior attempt showed that:

- Retrying in a different module creates coupling between the retry
  layer and the zone-filter evaluation layer.
- The retry still wastes a completion attempt per denial.
- Option A (clamping at the source) is straightforward when using
  AST extraction: extract the constraint, clamp the max, done.
  The prior attempt's first commit proved the extraction is feasible
  and correct.

### Implementation sketch

```
1. Create zone-filter-constraint-extraction.ts (pure utility)
   - extractBindingCountBounds(zoneFilter, bindingName) → { min?, max? } | null
   - Pattern-match: and-nodes containing count($binding) {==,<=,<,>=,>} N
   - Stop at or-nodes (constraints inside or are not universal)
   - Unit test thoroughly

2. In effects-choice.ts (applyChooseN, around line 772):
   - When building a chooseN for a free-operation move:
     a. Check env.freeOperationOverlay?.zoneFilter
     b. If zoneFilter exists:
        call extractBindingCountBounds(zoneFilter, bind)
        (returns null when the binding name does not appear in the
        filter — no separate moveZoneBindings check needed)
     c. If bounds.max exists: clamp chooseN.max = min(chooseN.max, bounds.max)
        (add as third argument to the existing Math.min on line 772)
   - This is the ONLY behavioral change

3. No changes to legal-choices.ts (zone filter already threaded via
   freeOperationOverlay), move-decision-sequence.ts,
   free-operation-viability.ts, event-execution.ts, or policy-agent.ts
```

## Hard constraints for implementation

These are non-negotiable. Violation of any of these is grounds for
rejecting the implementation:

1. **All existing CI workflows must remain green.** Specifically:
   determinism, engine-fitl-events, engine-memory, engine-performance,
   engine-fitl-rules, grant-determinism, engine-e2e-all, ci,
   runner-tests, engine-texas-cross-game.

2. **No new files > 200 lines.** The extraction utility should be
   small and focused.

3. **No modifications to `legal-choices.ts` beyond 10 lines.**
   If the implementation requires larger changes to legal-choices,
   the approach is wrong.

4. **No modifications to resolution classification** (`'exact'`,
   `'ambiguous'`, `'stochastic'`, `'provisional'`).

5. **No new budget constants** in event-execution.ts or
   free-operation-viability.ts.

6. **No game-specific logic** in any kernel or agent file.

7. **No circular evaluation chains.** No callback from legal-choices
   into itself, no callback from move-decision-sequence into
   legal-choices.

8. **Run `pnpm turbo test` and `pnpm turbo typecheck` before marking
   any ticket complete.** A ticket is not done until all tests pass.

## Test plan

### Existing related test

`packages/engine/test/integration/fitl-march-free-operation.test.ts` already
tests card-71 (An Loc) free-operation zone-filter evaluation at the unit
level (isolated state, forced zone-filter checks). The regression test
below covers the bounded overlapping-grant completion scenario that now
serves as the active proof surface.

### Regression test (pin the bug)

File: `packages/engine/test/integration/fitl-free-operation-march-completion.test.ts`

1. **Setup**: Build the bounded overlapping-grant witness state.
2. **Assert legal templates**: 2 legal free-operation templates for
   the target action.
3. **Assert merged filter remains broad**: The merged legality filter
   is `or`, and ticket 001's extractor returns no count bounds from it.
4. **Assert governing clamp applies**: The completion-only governing
   filter clamps the first `$targetSpaces` request to `max = 1`.
5. **Assert guided completion succeeds**: Force a singleton
   `$targetSpaces` choice and assert `completed`.
6. **Assert random completion succeeds (post-fix)**: Call
   `completeTemplateMove` with no custom `choose` callback (pure
   random), assert `completed` and verify the legal later branch was
   taken.

### Broader verification

- **Full CI green**: `pnpm turbo test`, `pnpm turbo typecheck`,
  `pnpm turbo lint` — all must pass.
- **Determinism canary**: the FITL-heavy seeds in
  `draft-state-determinism-parity.test.ts` and
  `fitl-policy-agent-canary.test.ts` must complete without hanging.
- **Event card canary**: all 153 FITL event card suites must pass
  (838 tests, 0 failures).
- **Memory canary**: `draft-state-gc-measurement.test.ts` must
  complete within its 120s timeout.
