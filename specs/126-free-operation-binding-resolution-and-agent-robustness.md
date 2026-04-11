# Spec 126 — Free-Operation Binding Resolution and Agent Robustness

- **Status**: PROPOSED
- **Priority**: High
- **Complexity**: Medium
- **Dependencies**: None (Spec 66 checkpoint-phase-gating is prerequisite context, already completed)

## Problem

Simulation canary tests reveal three classes of game-ending failures when running FITL seeds with `PolicyAgent` profiles:

1. **Crash — `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`**: The zone filter probe for free-operation eligibility references per-zone interpolated bindings (e.g., `$movingTroops@{$zone}`) that only exist for zones previously selected in `$targetSpaces`. When the filter is probed against a *candidate* zone outside the target set, the binding doesn't exist and the evaluation throws `MISSING_VAR`.

2. **Infinite hang — `enumerateLegalMoves` never returns**: Certain game states cause the legal-move enumerator to enter an unbounded loop, violating Foundation 10 (Bounded Computation). The hang occurs inside a single call to `enumerateLegalMoves()`, so the simulator's `maxTurns` guard never triggers.

3. **Agent stuck — `agentStuck` stop reason**: `PolicyAgent` cannot derive a playable move from the classified legal moves, even though `enumerateLegalMoves()` returns a non-empty list. The agent's template completion fails for all legal move templates.

### Observed Evidence

Seed scan across 1000–2200 with 4 FITL `PolicyAgent` profiles (`us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline`), `MAX_TURNS=300`:

| Outcome | Example seeds | Approximate frequency |
|---|---|---|
| `terminal` (correct) | 1020, 1049, 2046, 2057 | ~10% |
| Crash (`FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`) | 1010, 1012, 1014, 1015, 1019, 1025, 1030, 1035, 1042, 1043, 1046, 1047, 1051 | ~40% |
| Hang (never returns) | 1040, 1054 | ~10% |
| `agentStuck` | 1021, 1022, 1023, 1041, 1044, 1048, 1050, 1053 | ~30% |
| `maxTurns` (300 moves, no winner) | 1011, 1016 | ~10% |

### Crash Stack Trace

```
TurnFlowRuntimeError: free-operation zoneFilter evaluation failed
  on turnFlowEligibility context={
    "surface": "turnFlowEligibility",
    "actionId": "march",
    "moveParams": {
      "$targetSpaces": ["an-loc:none"],
      "$movingGuerrillas@an-loc:none[0]": [],
      "$movingTroops@an-loc:none[0]": ["tok_nva-troops_170"],
      "$chainSpaces": []
    },
    "zoneFilter": { op: "and", args: [..., { op: ">", left: { aggregate: { op: "count", query: { query: "binding", name: "$movingTroops@{$zone}" } } }, right: 0 }] },
    "candidateZone": "can-tho:none",
    "causeName": "EvalError",
    "causeMessage": "Binding not found: $movingTroops@can-tho:none",
    "causeCode": "MISSING_VAR"
  }
```

The root cause: the zone filter contains `{ query: binding, name: '$movingTroops@{$zone}' }` which interpolates `$zone` to the *candidate* zone during the probe. But `$movingTroops@can-tho:none` only exists if `can-tho:none` was previously selected in `$targetSpaces`. Since the binding was created for `an-loc:none` only, the probe for `can-tho:none` fails.

### FITL Rules Context

The crash manifests in the NVA/VC March action (FITL Rules Section 3.3.3). March selects destination spaces, then per-space the player chooses which troops/guerrillas to move. The free-operation zone filter tries to check whether the operation-plus-free-operation combination is valid across candidate zones, but the per-zone bindings from the operation's `forEach` scope aren't available for zones that weren't part of the operation.

## Root Cause Analysis

### Issue 1: Zone filter probe binding scope mismatch

In `packages/engine/src/kernel/free-operation-zone-filter-probe.ts`, the `evaluateFreeOperationZoneFilterProbe` function handles `MISSING_BINDING` errors by rebinding missing aliases to the candidate zone. However, the binding name `$movingTroops@can-tho:none` is a `MISSING_VAR` error (from `eval-query.ts` binding query resolution), not a `MISSING_BINDING` error. The probe's retry logic only catches `MISSING_BINDING`, so `MISSING_VAR` from interpolated per-zone bindings propagates as an unrecoverable error.

The `shouldDeferFreeOperationZoneFilterFailure` function in `missing-binding-policy.ts` does have a `MISSING_VAR` clause for the `legalChoices` surface, but the crash occurs on the `turnFlowEligibility` surface, where the deferral policy is stricter.

### Issue 2: Unbounded legal-move enumeration

The hang in `enumerateLegalMoves()` likely stems from the same binding resolution issue causing infinite retry loops or combinatorial explosion in the decision-sequence enumerator when free-operation zone filters produce inconsistent results.

### Issue 3: Agent template completion fragility

`PolicyAgent` classifies legal moves by template and attempts to complete parameters. When the legal-move set contains moves with complex per-zone bindings that the agent's template matcher can't handle, all templates fail and the agent throws `NoPlayableMoveError`.

## Proposed Solution

### Part A: Extend zone filter probe to handle per-zone interpolated bindings (engine-agnostic)

**Scope**: `packages/engine/src/kernel/`

The zone filter probe must recognize that `MISSING_VAR` for interpolated per-zone bindings (pattern `$name@{$zone}`) is an expected condition during probing, not a fatal error. The fix must be engine-agnostic (Foundation 1) — it handles the general case of `forEach`-scoped bindings being unavailable during cross-zone probing.

1. **In `free-operation-zone-filter-probe.ts`**: Extend the retry logic to also catch `MISSING_VAR` errors where the missing binding matches the pattern `<name>@<candidateZone>` (i.e., per-zone interpolated bindings). When such an error is encountered during probing, treat the zone filter result as `inconclusive` rather than failing — the zone is neither confirmed nor denied as eligible, which is the correct semantic for a probe that can't evaluate because the required bindings don't exist yet.

2. **In `missing-binding-policy.ts`**: Extend `shouldDeferFreeOperationZoneFilterFailure` to apply the `MISSING_VAR` deferral policy on the `turnFlowEligibility` surface as well, not just `legalChoices`. The rationale: if a per-zone binding doesn't exist because the zone wasn't selected in the parent operation, the filter probe for that zone is inherently inconclusive regardless of which surface is asking.

3. **In `eval-query.ts`**: Where `applyZonesFilter` catches and wraps zone filter errors into `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`, verify that the catch/rethrow path respects the updated deferral policy before escalating.

### Part B: Bound the legal-move enumerator to prevent infinite hangs (Foundation 10)

**Scope**: `packages/engine/src/kernel/legal-moves.ts`

The legal-move enumerator must always terminate. Even if Part A fixes the immediate binding resolution, defensive bounds are needed.

1. Add a configurable budget (e.g., `maxLegalMoveEnumerationSteps`) to the legal-move enumeration loop. When the budget is exhausted, the enumerator stops and returns the moves discovered so far, plus a diagnostic warning.

2. This budget should be part of `GameDef.terminal` or a kernel-level option (not game-specific), defaulting to a generous bound (e.g., 100,000 steps) that well-formed games never approach.

3. The simulator must treat budget-exhausted enumeration gracefully: the game continues with whatever moves were found, or stops with a new `'enumerationBudgetExhausted'` stop reason if zero moves were found.

### Part C: Improve agent robustness for complex per-zone bindings

**Scope**: `packages/engine/src/agents/`

1. **Investigate** why `PolicyAgent` can't complete templates for the legal moves produced by the enumerator. The per-zone binding pattern (`$movingTroops@{$space}`) may require the agent's template matcher to understand interpolated binding names.

2. If the legal moves themselves are valid but the agent can't map them, the agent should fall back to random selection from the legal-move list rather than throwing `NoPlayableMoveError`. This aligns with Foundation 10: the game should always be able to advance.

3. If the legal moves are malformed (contain unresolvable bindings), the issue is in the enumerator (Part A) and should be fixed there, not papered over in the agent.

### Part D: FITL march zone filter correction (if needed)

**Scope**: `data/games/fire-in-the-lake/30-rules-actions.md`

After implementing Parts A–C, re-run the seed scan. If the march zone filter's use of `$movingTroops@{$zone}` is inherently problematic for free-operation eligibility (because it references per-target-space bindings that don't exist at filter evaluation time), the filter should be restructured:

- The zone filter for march free-operation eligibility should only reference bindings that are available at probe time — global vars, the candidate `$zone`, and top-level action bindings.
- Per-space troop/guerrilla selection bindings belong in the per-space `forEach` scope, not in the top-level zone filter.

Consult FITL Rules Section 3.3.3 (March) and Section 4.1 (Special Activities) to verify the correct eligibility semantics. The march zone filter should express "is this zone a valid *destination* for march given the current game state" — not "were troops selected for this zone in a prior decision."

## Testing Strategy

### Unit Tests

- `free-operation-zone-filter-probe.test.ts`: Test that `MISSING_VAR` for interpolated per-zone bindings produces `inconclusive` rather than `failed`.
- `missing-binding-policy.test.ts`: Test that `turnFlowEligibility` surface defers `MISSING_VAR` for per-zone bindings.
- `legal-moves-enumeration-budget.test.ts`: Test that the enumeration budget halts runaway enumeration and produces a diagnostic.

### Integration Tests

- `fitl-march-free-operation.test.ts`: Reproduce the crash state (NVA march with `$targetSpaces = ['an-loc:none']` probed against `can-tho:none`) and verify no crash.
- `fitl-seed-stability.test.ts`: Run the full set of previously-crashing seeds (1010, 1012, 1014, 1015, 1019) and verify they either reach terminal, maxTurns, or agentStuck — never crash or hang.

### Determinism Canary

- After the fix, re-scan seeds 1000–2200 and select 4–6 seeds that produce `terminal` results as permanent canaries.
- Update `fitl-policy-agent-canary.test.ts` with the validated seeds.

## Foundations Alignment

| Foundation | Alignment |
|---|---|
| F1 (Engine Agnosticism) | All fixes are in generic kernel code. No FITL-specific logic in the engine. FITL-specific changes (Part D) are data-only. |
| F8 (Determinism) | Same seeds will produce same results after the fix. No non-deterministic fallbacks. |
| F10 (Bounded Computation) | Part B adds explicit enumeration budgets. Part A prevents infinite retries. |
| F12 (Compiler-Kernel Boundary) | Zone filter evaluation is a kernel runtime concern. The compiler already validated the filter structure. |
| F15 (Architectural Completeness) | Addresses root cause (binding scope mismatch), not symptoms (seed selection). |
| F16 (Testing as Proof) | Each fix is proven by targeted tests and validated by the seed scan. |

## Out of Scope

- Full `PolicyAgent` overhaul (Spec 30 covers non-player AI strategy). This spec only addresses crash/hang robustness.
- Evolution pipeline or CLI integration.
- `maxTurns` seeds that play 300 moves without a winner — these are a game-design quality issue, not an engine bug.
