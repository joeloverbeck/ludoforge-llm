# Spec 109 — Agent Preview System Audit

## Status

Proposed

## Priority

High

## Complexity

Medium

## Dependencies

- Builds on completed Spec 105 (`archive/specs/105-explicit-preview-contracts.md`) — Spec 105 defines the preview mode system (`tolerateStochastic`, `exactWorld`, `disabled`). Spec 109 ensures event moves reach the preview pipeline that Spec 105 governs. Without Spec 109's fix, Spec 105's modes have no effect on event candidates.

## Problem

The agent preview system fails silently for event card candidates, causing the agent to fall back to `feature.selfMargin` (a constant across all candidates at a decision point). This eliminates candidate-level differentiation for event moves — the agent cannot distinguish between playing the shaded vs unshaded side of an event card, one of the most important strategic decisions in games like FITL.

**Evidence from fitl-vc-agent-evolution campaign**: Every event card in the tournament traces shows identical `preferProjectedSelfMargin` contributions for shaded and unshaded candidates:

```
event (shaded)   card-116: projectedMargin=-40
event (unshaded) card-116: projectedMargin=-40
event (shaded)   card-15:  projectedMargin=-15
event (unshaded) card-15:  projectedMargin=-15
```

Card-116's shaded side ("VC Rally+Agitate in base zones") and unshaded side ("VC Terror/Agitate costs 2 guerrillas") have opposite effects for VC, yet score identically.

### Root Cause Hypothesis

The code path for event preview has been traced through the codebase. Two failure paths can cause identical event scores:

**Path A — Template completion failure:**

1. `enumerateCurrentEventMoves` (legal-moves.ts:1071-1156) correctly creates separate Move objects with distinct `side` params and different `stableMoveKey` values.
2. `preparePlayableMoves` (prepare-playable-moves.ts:55-148) classifies each legal move via viability probing. Event moves with inner decision effects (`chooseOne`/`chooseN` for target zone selection within the event) are classified as having pending decisions.
3. These pending-decision event moves enter `attemptTemplateCompletion` (prepare-playable-moves.ts:155-211), which calls `evaluatePlayableMoveCandidate` to resolve decisions. If completion fails (unsatisfiable decision domain, budget exceeded), the event moves never enter `trustedMoveIndex`.
4. In `policy-preview.ts:239-242`, moves NOT in `trustedMoveIndex` fall through to `classifyPlayableMoveCandidate` (playable-candidate.ts:91-100), which re-probes without template completion context and returns `rejected` with `notDecisionComplete`.
5. `classifyPreviewOutcome` (policy-preview.ts:247-253) converts any non-`playableComplete` result to `{ kind: 'unknown', reason: 'unresolved' }`.
6. The `projectedSelfMargin` candidateFeature's `coalesce` falls back to `feature.selfMargin` — the same value for all candidates.

**Path B — Enumeration-time rejection:**

1. `isMoveDecisionSequenceAdmittedForLegalMove` (legal-moves.ts:1136-1148) may reject event moves during enumeration before they ever reach `preparePlayableMoves`. This filter evaluates decision sequence satisfiability and can discard event moves whose effect tree has unsatisfiable decision paths — potentially removing valid event candidates that would have been satisfiable with proper side-aware context.

**Net effect**: Both shaded and unshaded event candidates get `feature.selfMargin` instead of their actual projected margins. The agent is blind to event card quality.

**Note**: If both sides' effects genuinely produce the same margin change (identical effects), identical scores are correct behavior. The fix targets cases where preview FAILS silently, not cases where preview correctly evaluates to the same margin.

## Goals

1. **Audit all preview failure modes** — identify every category of legal move where preview silently falls back to the coalesce default.
2. **Fix event card differentiation** — shaded and unshaded sides of the same card must produce different projected margins reflecting their distinct effects.
3. **Verify capability card handling** — capability events (persistent effects) should be previewed honestly. If the margin doesn't change immediately, that's truthful — no artificial heuristic bonuses.
4. **Ensure multi-branch events preview independently** — each branch of a sided event is a separate legal move and must get its own preview.
5. **Verify stochastic events under `tolerateStochastic`** — events with random elements should produce projected states (with RNG divergence noted), not silently fail.

## Non-Goals

- No game-designer card annotations or heuristic quality scores. Event effects are already fully encoded in YAML — the preview system must evaluate them, not rely on hand-authored shortcuts.
- No multi-step preview (2+ moves ahead). The 1-move preview is the design boundary.
- No changes to non-event preview (regular operations preview correctly).
- No changes to the victory margin calculation itself.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| 1 — Engine Agnosticism | Fix is generic: applies to any game with sided events or decision-containing event effects, not FITL-specific |
| 7 — Specs Are Data | Event effects are already encoded in YAML. The fix ensures the engine evaluates them correctly during preview rather than requiring hand-authored annotations |
| 8 — Determinism | Preview must produce deterministic results for the same move + state |
| 14 — No Backwards Compat | No compatibility shims — fix the classification/completion path directly |
| 15 — Architectural Completeness | Fix the root cause (preview classification of event moves) not the symptom (identical scores) |

## Scope

### Audit Targets

1. **Event move classification in `preparePlayableMoves`**
   - Trace the classification path for event-type moves (actionId containing 'event' or tagged as event)
   - Determine: are event moves classified as `complete`, `stochastic`, or `pending`?
   - If `pending`: why does template completion fail or produce identical results for shaded vs unshaded?

2. **Template completion for events (`attemptTemplateCompletion`)**
   - Does the completion path respect the `side` parameter when resolving inner decisions?
   - Are completion choices (zone selection within events) deterministic?
   - Does completion produce meaningfully different trusted moves for shaded vs unshaded?

3. **Preview fallback chain and diagnostics**
   - When event moves are NOT in `trustedMoveIndex`, what does `classifyPlayableMoveCandidate` return?
   - Is the `coalesce` fallback in `projectedSelfMargin` masking preview failures?
   - Enrich preview failure diagnostics in the trace to include the specific failure reason (completion failure, empty decision domain, probe classification mismatch). Currently the trace shows `unknown/unresolved` with no detail on WHY.

4. **Multi-branch event preview**
   - Cards with multiple branches per side produce multiple legal moves
   - Each branch must get its own preview evaluation
   - Verify branches with different effects produce different projected margins

5. **Stochastic event preview**
   - Events with `rollRandom` or other stochastic elements in their effect tree
   - Under `tolerateStochastic` mode, these should still produce projected states
   - Verify they don't silently fall to `unknown` outcome

6. **Capability card preview**
   - Capability events install persistent game-state modifiers
   - Preview applies the move honestly — if the projected margin doesn't change, that's correct
   - No special handling needed beyond ensuring the effect tree executes in preview

7. **Enumeration-time event filtering (`isMoveDecisionSequenceAdmittedForLegalMove`)**
   - At legal-moves.ts:1136-1148, event moves are filtered by decision sequence satisfiability BEFORE reaching `preparePlayableMoves`
   - This filter may incorrectly reject valid event moves whose decision tree is satisfiable for one side but not the other
   - Audit: are event moves being lost at enumeration time? Does the filter have access to the side-specific effect tree?

### Mutable Files

- `packages/engine/src/agents/prepare-playable-moves.ts` — event move classification and completion
- `packages/engine/src/agents/policy-preview.ts` — preview cache, classification fallback, application
- `packages/engine/src/agents/policy-agent.ts` — trustedMoveIndex construction
- `packages/engine/src/kernel/playable-candidate.ts` — `evaluatePlayableMoveCandidate` classification
- `packages/engine/src/agents/policy-diagnostics.ts` — preview failure diagnostics (if enrichment needed)

### Potentially Mutable (pending audit findings)

- `packages/engine/src/kernel/legal-moves.ts` — enumeration-time event filter (audit target 7)

### Immutable

- `packages/engine/src/kernel/event-execution.ts` — event side resolution works correctly
- Game spec data (`data/games/*`)
- `docs/FOUNDATIONS.md`

## Testing Strategy

1. **Unit test: event preview differentiation** — Compile a game with a dual-sided event card where shaded and unshaded sides have materially different effects (e.g., shaded places tokens, unshaded removes them). Run preview for both candidates. Assert different projected margins.

2. **Unit test: capability event preview** — Preview a capability card. Assert the preview completes (not `unknown`) and returns a projected state, even if the margin doesn't change significantly.

3. **Unit test: multi-branch event preview** — Card with 2 branches on one side. Assert each branch gets a distinct preview with a different projected state.

4. **Unit test: stochastic event preview** — Event with `rollRandom`. Under `tolerateStochastic`, assert preview returns `stochastic` outcome (not `unknown`).

5. **Integration test: FITL event card scoring** — Run a PolicyAgent evaluation on a FITL game state where both shaded and unshaded event candidates are available. Assert they have different `preferProjectedSelfMargin` contributions.

6. **Regression: non-event preview unchanged** — Assert that regular operation moves (rally, terror, attack) continue to preview correctly with no performance regression.

## Expected Impact

After the fix, the VC agent will be able to evaluate "is the shaded or unshaded side of this event better for me?" based on actual projected outcomes — the same reasoning a human player performs when looking at the card. Combined with the existing `preferProjectedSelfMargin` scoring, the agent will naturally prefer event sides that improve its margin.

This unlocks a major strategic dimension that was previously invisible to the agent, potentially improving win rates on seeds where event card choices are decisive.

**Note**: Events whose shaded and unshaded effects genuinely produce the same margin change will correctly continue to score identically after the fix. The fix targets silent preview failures, not genuinely equivalent outcomes.
