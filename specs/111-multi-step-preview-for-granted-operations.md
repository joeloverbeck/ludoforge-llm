# Spec 111 — Multi-Step Preview for Granted Operations

## Status

Proposed

## Priority

High

## Complexity

Medium

## Dependencies

None (the annotation system and preview system already exist).

## Problem

The PolicyAgent preview system evaluates candidates by simulating one move ahead and measuring the projected margin. For most actions, this captures the strategic value correctly — terror increases opposition, rally places guerrillas, attack removes enemies.

However, **events that grant free operations** are systematically undervalued. When the preview evaluates such an event, it simulates the event's immediate effect (e.g., setting a capability marker) but does NOT simulate the granted operation that follows. The agent sees:

```
Terror: projected margin -4 (opposition increased)     → score: -20
Event (grants free Rally): projected margin -8 (marker set, no margin change) → score: -40
```

The agent picks terror. But the event + free Rally combination is objectively better: the event's immediate effect PLUS an entire extra Rally action. The preview only sees step 1 of a 2-step sequence.

### Scale of the Problem

In FITL (130 event cards), 26 card sides grant free operations. Of these, 7 grant operations to VC specifically. When VC faces an event-or-operation choice with an operation-granting card, the preview consistently undervalues the event by the full value of the granted operation (roughly 2-4 margin points).

Across 15 test seeds, the VC agent plays events only 37.5% of the time they're available (15/40). In many cases, terror or rally beats the event purely because the preview can't see the granted operation's value.

### Annotation Workaround

The current workaround is to use `activeCard.annotation.<side>.grantsOperation` as a heuristic bonus in the agent profile (documented in the cookbook). This is a static bonus — it doesn't evaluate HOW GOOD the granted operation would be. A granted Rally in a zone with 0 guerrillas is worth less than a granted Rally in a zone with 5 guerrillas. The annotation just says "yes, there's a free operation."

## Goals

1. When the preview evaluates an event candidate that grants a free operation, automatically simulate the granted operation as a second step and evaluate the resulting state
2. The multi-step preview should use the same PolicyAgent profile to select the best granted operation (the agent's own strategy determines what it would do with the free action)
3. Maintain determinism — same inputs always produce the same preview result
4. No changes to games that don't have operation-granting events

## Non-Goals

- General N-step lookahead (this is specifically for granted operations, not arbitrary multi-move planning)
- Preview of opponent responses (this only extends the CURRENT player's evaluation)
- Changing how non-event candidates are previewed

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| 1 — Engine Agnosticism | The mechanism is generic: any game with events that grant operations benefits. The engine detects granted operations from the compiled annotation, not from game-specific logic |
| 8 — Determinism | Multi-step preview is deterministic: same event + same state + same agent profile = same preview result |
| 11 — Immutability | Preview already creates temporary state copies; the second step does the same |
| 15 — Architectural Completeness | Closes the gap where the preview system ignores a known follow-up action that the game rules guarantee will happen |

## Scope

### What to Change

**1. Detect granted operations during preview evaluation**

In the preview evaluation path (`packages/engine/src/agents/policy-evaluation-core.ts`), after simulating an event candidate:
- Check if the event's compiled annotation indicates `grantsOperation === true`
- If yes, identify which seat(s) receive the granted operation
- If the evaluating agent's seat is among the grantees, proceed to step 2

The annotation is already available at compile time via `gameDef.cardAnnotationIndex.entries[cardId][side].grantsOperation` and `.grantOperationSeats`.

**2. Simulate the granted operation as a second preview step**

After the event preview produces a post-event state:
- Enumerate legal moves for the granted operation in the post-event state
- Use the agent's PolicyAgent profile to evaluate and select the best granted move (same scoring logic as normal move selection)
- Apply the selected granted move to produce a post-event-plus-operation state
- Use THIS state for the final margin evaluation (instead of the post-event-only state)

**3. Handle edge cases**

- If the granted operation has no legal moves (all actions blocked), fall back to the post-event-only state
- If `grantOperationSeats` contains `self`, resolve to the evaluating agent's seat at runtime
- If `grantOperationSeats` contains opponent seats only (the event helps an opponent, not the evaluating agent), do NOT extend the preview — the opponent's granted action is adversarial
- Budget: the second step adds one more `runGame` simulation per event candidate that grants operations. This is bounded by the number of such candidates (typically 1-2 per decision point)

**4. Diagnostic enrichment**

Add to the preview trace output:
- `grantedOperationSimulated: true/false` — whether multi-step preview was used
- `grantedOperationMove: { actionId, params }` — what the agent selected as the granted operation
- `grantedOperationMarginDelta: number` — how much the granted operation improved the projected margin

### Mutable Files

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — extend preview evaluation for granted operations
- `packages/engine/src/agents/policy-eval.ts` (modify) — pass annotation index to evaluation context
- `packages/engine/src/agents/policy-diagnostics.ts` (modify) — add granted operation trace fields
- `packages/engine/src/kernel/types-core.ts` (modify) — extend preview trace types

### Immutable

- `packages/engine/src/cnl/compile-event-annotations.ts` — annotations already compiled correctly
- Game spec data — no game changes needed
- `packages/engine/src/agents/policy-expr.ts` — expression system unchanged
- Agent profile YAML structure — no new DSL constructs needed

## Testing Strategy

1. **Unit test: multi-step preview activates for operation-granting events** — Create a minimal game with an event that grants a free operation. Verify the preview evaluates both the event and the granted operation.

2. **Unit test: preview uses agent profile for granted operation selection** — Verify the agent's scoring considerations (rally preference, population targeting) apply when selecting the granted operation.

3. **Unit test: non-granting events are unaffected** — Verify events without `grantsOperation` produce identical preview scores before and after the change.

4. **Unit test: opponent-granting events are not extended** — Verify events that grant operations to opponents only do NOT get multi-step preview (the opponent's action is adversarial, not optimizable).

5. **Integration test: FITL VC agent prefers operation-granting events** — Run a game evaluation where the active card grants VC a free Rally. Verify the event candidate scores higher than it would with single-step preview.

6. **Regression test: existing FITL golden traces** — Verify no changes to games that don't involve operation-granting events at agent decision points.

## Expected Impact

Events that grant operations to the evaluating agent will be correctly valued as "event effect + best available follow-up action." This should increase event play rates from ~37% to significantly higher for operation-granting events, particularly in COIN-series games where half the strategic depth is in event card decisions.

The annotation-based workaround (cookbook pattern) will remain useful for capability cards and other events whose value can't be captured by any preview depth. Multi-step preview complements rather than replaces annotation scoring.
