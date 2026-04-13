# Spec 127 — Free Operation chooseN Max Constraint Propagation

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

### Reproduction

Run the FITL game with seed 1000 using the `arvn-evolved` agent
profile (see campaign `fitl-arvn-agent-evolution`).  After 140 moves
the NVA agent (player 2) receives a free-operation march grant from
the An Loc event card.  The game reaches `agentStuck` because neither
of the 2 legal march moves can be completed by the PolicyAgent.

#### Minimal reproduction (no full game required)

Build a regression test that:

1. Compiles the FITL game spec.
2. Runs the game with seed 1000, 4 players, max 200 turns,
   using profiles `us-baseline`, `arvn-evolved`, `nva-baseline`,
   `vc-baseline`.
3. Captures the `finalState` from the trace (stop reason will be
   `agentStuck`).
4. Calls `enumerateLegalMoves` on the final state — asserts 2 legal
   moves (both `march`, both `freeOperation: true`).
5. Calls `completeTemplateMove` on the first legal move, forcing
   `$targetSpaces` selection to `['an-loc:none']` (1 target) —
   asserts the result is `completed`.
6. Calls `completeTemplateMove` on the first legal move, forcing
   `$targetSpaces` selection to `['an-loc:none', 'binh-dinh:none']`
   (2 targets) — asserts the result is `unsatisfiable` (this is the
   bug; after the fix, it should either complete or the `chooseN`
   `max` should be 1).

Steps 5-6 pin down the exact failure: the pipeline accepts 1 target
but rejects 2+, even though the `chooseN` max allows up to 29.

#### Frozen game state at the stuck point

| Field | Value |
|-------|-------|
| `activePlayer` | 2 (NVA) |
| `currentPhase` | `main` |
| `globalVars.nvaResources` | 33 |
| `globalVars.marchCount` | 0 |

**NVA tokens by zone** (69 total: 39 troops, 18 guerrillas, 12 bases):

| Zone | Tokens |
|------|--------|
| `available-NVA:none` | 10 troops, 4 guerrillas, 4 bases |
| `central-laos:none` | 2 troops, 3 guerrillas, 2 bases |
| `southern-laos:none` | 3 troops, 4 guerrillas, 1 base |
| `north-vietnam:none` | 2 troops, 3 guerrillas, 1 base |
| `northeast-cambodia:none` | 5 troops |
| `the-parrots-beak:none` | 5 troops, 1 guerrilla, 1 base |
| `the-fishhook:none` | 4 troops |
| `sihanoukville:none` | 3 troops |
| `quang-nam:none` | 5 troops |
| `kien-phong:none` | 3 guerrillas |
| `loc-can-tho-chau-doc:none` | 2 guerrillas |

**Active free-operation grants for NVA** (from turn order state):

The grant `freeOp:1:2:event:0` is the one that produces the 2 legal
march moves.  Its critical fields:

```yaml
grantId: "freeOp:1:2:event:0"
phase: ready
seat: nva
operationClass: operation
actionIds: [march]
moveZoneBindings: [$targetSpaces]
zoneFilter:
  op: and
  args:
    - op: "=="                              # <-- THE CONSTRAINT
      left:
        aggregate:
          op: count
          query: { query: binding, name: "$targetSpaces" }
      right: 1                              # count($targetSpaces) must equal 1
    - op: in
      item: { ref: zoneProp, zone: "$zone", prop: id }
      set: [hue:none, da-nang:none, kontum:none, qui-nhon:none,
            cam-ranh:none, an-loc:none, saigon:none, can-tho:none]
    - op: ">"
      left:
        aggregate:
          op: count
          query: { query: binding, name: "$movingTroops@{$zone}" }
      right: 0
```

The `count($targetSpaces) == 1` clause means the free operation only
permits a single march destination.  But the `insurgent-march-select-
destinations` macro's non-limited-operation branch computes:

```yaml
max:
  if:
    when: { op: "==", left: { ref: binding, name: __actionClass }, right: limitedOperation }
    then: 1
    else:
      if:
        when: { op: "==", left: { ref: binding, name: __freeOperation }, right: true }
        then: 99
        else: ...
```

For `__freeOperation = true`, `max = 99`.  The engine resolves this to
`max = 29` (29 valid destinations).  The zone-filter constraint
(`count == 1`) is invisible to the `chooseN`.

**Legal moves at the stuck point:**

```json
{"actionId":"march","params":{},"freeOperation":true,"actionClass":"operation"}
{"actionId":"march","params":{},"freeOperation":true}
```

Both are `viable: true, complete: false` — template moves awaiting
completion.  Both fail with `completionUnsatisfiable` when the
random selector picks `count > 1`.

## Scope

### In scope

- Diagnose and fix the constraint propagation gap between
  free-operation `zoneFilter` binding-count constraints and `chooseN`
  max parameters during template completion.
- Regression test using the frozen game state described above.
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
| `packages/engine/src/kernel/legal-choices.ts` | `legalChoicesEvaluate` — where grant context and zone filters are resolved |
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

**Option A (engine-level max clamping)** is now the recommended
approach, informed by the lessons from the prior attempt.

The implementation should:

1. **Extract binding-count constraints from the zone filter** (reuse
   the `extractBindingCountConstraints` approach from the prior
   attempt's first commit).

2. **Clamp `chooseN.max` at the source** — in the `effects-choice.ts`
   or `effects-pipeline.ts` path where chooseN requests are built,
   BEFORE options are enumerated.  When a free-operation grant's
   `moveZoneBindings` includes the `chooseN.bind` name, and the
   grant's `zoneFilter` contains a binding-count constraint for that
   binding, intersect the constraint's upper bound with the pipeline's
   `max`.

3. **Do not modify `legal-choices.ts`** beyond minimal changes to
   pass the active grant's constraints into the effects context.
   No new probe paths, no singleton special cases, no resolution
   changes.

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

2. In effects-choice.ts (or effects-pipeline.ts):
   - When building a chooseN for a free-operation move:
     a. Look up the active grant from the effect context
     b. If grant has zoneFilter and moveZoneBindings includes chooseN.bind:
        call extractBindingCountBounds(grant.zoneFilter, chooseN.bind)
     c. If bounds.max exists: clamp chooseN.max = min(chooseN.max, bounds.max)
   - This is the ONLY behavioral change

3. No changes to legal-choices.ts, move-decision-sequence.ts,
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

### Regression test (pin the bug)

File: `packages/engine/test/integration/fitl-free-operation-march-completion.test.ts`

1. **Setup**: Compile FITL, run seed 1000 to move 140 (`agentStuck`),
   capture `finalState`.
2. **Assert legal moves**: 2 legal march moves, both
   `freeOperation: true`.
3. **Assert 1-target completion succeeds**: Force `$targetSpaces =
   ['an-loc:none']`, assert `completed`.
4. **Assert 2-target selection is impossible (post-fix)**: The
   `chooseN` max should now be 1 (clamped by zone-filter constraint),
   so selecting 2 targets is structurally impossible.
5. **Assert random completion succeeds (post-fix)**: Call
   `completeTemplateMove` with no custom `choose` callback (pure
   random), assert `completed` (not `unsatisfiable`).

### Broader verification

- **Full CI green**: `pnpm turbo test`, `pnpm turbo typecheck`,
  `pnpm turbo lint` — all must pass.
- Run the FITL tournament harness with seed 1000 — game should no
  longer hit `agentStuck`.
- Run seeds 1000-1014 with all FITL profiles — no new `agentStuck`
  occurrences.
- **Determinism canary**: seeds 1000-1002 in
  `draft-state-determinism-parity.test.ts` must complete within
  60 seconds each (no hangs).
- **Event card canary**: all 153 FITL event card suites must pass
  (838 tests, 0 failures).
- **Memory canary**: `draft-state-gc-measurement.test.ts` must
  complete within its 120s timeout.
