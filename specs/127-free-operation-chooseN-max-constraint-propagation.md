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

## Options

### Option A: Engine-level max clamping during template completion

Before calling `chooseAtRandom` in `completeTemplateMove`, inspect the
active free-operation grant's `zoneFilter` for binding-count equality
constraints (patterns like `count($binding) == N`).  If found, clamp
the `chooseN` max to `N`.

**Pros**: Fixes the root cause at the right layer; game-agnostic.
**Cons**: Requires the engine to parse and pattern-match zone-filter
ASTs, which is fragile if zone-filter patterns evolve.

### Option B: Retry with reduced count on zone-filter denial

When `probeMoveViability` rejects a completed move due to a
zone-filter count mismatch, extract the required count from the denial
context and retry template completion with `max = requiredCount`.

**Pros**: Doesn't require AST pattern matching; works for any
constraint shape.
**Cons**: Wastes a completion attempt; the retry logic is in a
different module than the selection logic.

### Option C: Propagate grant zone-filter constraints into the `chooseN` request

When building the `ChoicePendingRequest` for a `chooseN` whose `bind`
appears in the grant's `moveZoneBindings`, intersect the pipeline's
`max` with the grant's zone-filter count constraint.  This requires
the decision-sequence evaluator to have access to the active grant's
metadata.

**Pros**: Clean architectural solution; the `chooseN` request is
accurate from the start.
**Cons**: Requires threading grant metadata deeper into the pipeline
evaluation context.

## Recommendation

**Option B** as the immediate fix (lowest risk, no AST parsing), with
**Option C** as a follow-up for architectural cleanliness.  Option B
can be implemented in `prepare-playable-moves.ts` or
`move-completion.ts` by catching the zone-filter denial and retrying
with a clamped max.

## Test plan

### Regression test (pin the bug)

File: `packages/engine/test/agents/free-operation-march-completion.test.ts`

1. **Setup**: Compile FITL, run seed 1000 to move 140 (`agentStuck`),
   capture `finalState`.
2. **Assert legal moves**: 2 legal march moves, both
   `freeOperation: true`.
3. **Assert 1-target completion succeeds**: Force `$targetSpaces =
   ['an-loc:none']`, assert `completed`.
4. **Assert 2-target completion fails (pre-fix)**: Force
   `$targetSpaces = ['an-loc:none', 'binh-dinh:none']`, assert
   `unsatisfiable`.  After the fix, this test changes: either the
   `chooseN` max is clamped to 1 (so the test never reaches
   2 targets), or the retry produces a single-target completion.
5. **Assert random completion succeeds (post-fix)**: Call
   `completeTemplateMove` with no custom `choose` callback (pure
   random), assert `completed` (not `unsatisfiable`).  This is the
   green-light test.

### Broader verification

- Run the FITL tournament harness with seed 1000 — game should no
  longer hit `agentStuck`.
- Run the full engine test suite — no regressions.
- Run seeds 1000-1014 with all FITL profiles — no new `agentStuck`
  occurrences.
