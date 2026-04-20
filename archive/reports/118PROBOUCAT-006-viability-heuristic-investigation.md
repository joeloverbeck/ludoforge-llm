# 118PROBOUCAT-006: Viability Heuristic Investigation

**Status**: COMPLETED

**Date**: 2026-04-07
**Ticket**: `archive/tickets/118PROBOUCAT-006.md` (after archival)

## Context

`doesCompletedProbeMoveChangeGameplayState` in `free-operation-viability.ts:470` tries to fully execute a move's effects and compare before/after state via `doesMaterialGameplayStateChange`. When effect execution hits `CHOICE_RUNTIME_VALIDATION_FAILED` (a sub-decision fails validation mid-execution), it falls back to `hasTransportLikeStateChangeFallback` — a 68-line heuristic (lines 348–415) that guesses state-change potential from move params.

Called from 2 sites:
- `apply-move.ts:1908` — outcome policy enforcement during move application
- `free-operation-viability.ts:653` — free-operation viability during legal move enumeration

## Question 1: Can the viability probe evaluate state-change potential before hitting choice validation?

**Answer: No — not without significant new infrastructure.**

The effect execution pipeline (`applyEffects`) processes effects sequentially. `CHOICE_RUNTIME_VALIDATION_FAILED` is thrown from deep inside `effects-choice.ts` during choice domain evaluation (normalizing tier items, validating encodability, checking cardinality). There is no "run up to first choice point" mechanism.

To run effects partially would require:
1. A new effect execution context variant that catches choice errors and returns partial results (similar to `createDiscoveryProbeEffectContext`)
2. An `EffectExecutionResult` extension that carries "effects applied so far" alongside the error
3. State comparison against the partial result — but a partial execution may include moveToken effects that are later undone by a conditional branch, so the partial state is not necessarily representative

**Complexity assessment**: This is a non-trivial extension to the effect execution pipeline. The existing context variants (`strict`, `probe`, `discovery`) don't support partial result capture. Adding one would touch `effect-context.ts`, `effects.ts`, `effects-choice.ts`, and likely `choose-n-option-resolution.ts`.

## Question 2: Is `hasTransportLikeStateChangeFallback` empirically correct?

**Answer: The heuristic is structurally sound but conservative (may produce false positives, not false negatives).**

The heuristic's logic:
1. **Explicit destination bindings** (`paramName@tokenId` → zoneId): If any token's current zone differs from the destination → `true` (state changes). If all tokens stay → `false`. This is exact for the transport case.
2. **Implicit selection fallback**: If tokens > 0 AND zones > 1 → `true`. This is conservative — it assumes any move selecting multiple zones with tokens is likely to change state.

False positive risk: A move could select tokens and zones without actually moving them (e.g., a selection that's validated but not acted upon). The heuristic would return `true` but the actual state change is zero.

False negative risk: None identified. The heuristic defaults to `false` only when no tokens are selected or all selected zones are the same — which correctly indicates no transport.

**Empirical measurement was not performed** (would require temporarily modifying the heuristic and running canary seeds, which is out of scope for an investigation-only ticket). The structural analysis shows the heuristic is correct for the FITL transport case (moveToken with explicit destination bindings) and conservatively correct for other patterns.

The canary seeds (`fitl-policy-agent-canary.test.ts`) exercise free-operation viability extensively — the test suite passes with the heuristic in place, and the determinism tests confirm identical results across runs.

## Question 3: Can the choice validation error be made recoverable?

**Answer: Not without the Group C migration (making evalCondition/evalQuery result-returning).**

`CHOICE_RUNTIME_VALIDATION_FAILED` is thrown from 8+ sites in `effects-choice.ts` during choice domain evaluation. Each throw is deep inside the evaluation stack:
- `normalizeChoiceDomain` callbacks
- `chooseN` selection validation
- Prioritized tier item normalization
- Qualifier key validation

Making these recoverable would require wrapping each throw site in a result type and propagating through the entire choice resolution chain (`effects-choice.ts` → `choose-n-option-resolution.ts` → `effects.ts`). This is essentially the Group C migration that Spec 118 explicitly defers — making `evalCondition`/`evalQuery` result-returning is a prerequisite.

## Recommendation: No action

The heuristic is:
- **Deterministic** — same inputs always produce the same output (F8 satisfied)
- **Bounded** — inspects only move params, no iteration or recursion (F10 satisfied)
- **Correct for the current game set** — FITL transport moves use explicit destination bindings, which the heuristic handles exactly
- **Conservative** — false positives (reporting state change when there is none) are safe (the move is kept); false negatives would be unsafe (move incorrectly filtered) but none are identified

The architectural strain on F15 is real but acceptable given:
1. Eliminating the heuristic requires partial effect execution (Q1) — significant new infrastructure
2. Making choice validation recoverable (Q3) is blocked on the Group C migration
3. The heuristic is only triggered when choice validation fails, which is an edge case during viability probing

**No follow-up spec or ticket is recommended at this time.** The heuristic should be revisited if/when the Group C migration (making `evalCondition` result-returning) lands — at that point, `CHOICE_RUNTIME_VALIDATION_FAILED` would become a result type rather than a thrown error, and the catch + heuristic fallback can be eliminated naturally.

## Outcome

- Completion date: 2026-04-20
- What actually changed:
  - preserved the completed ticket investigation and archived the report because its conclusion is already captured in the historical ticket trail and it no longer functions as an active report
- Deviations from original plan:
  - none; the report already concluded with a no-action recommendation
- Verification results:
  - archival classification reviewed against current active references before moving the file
