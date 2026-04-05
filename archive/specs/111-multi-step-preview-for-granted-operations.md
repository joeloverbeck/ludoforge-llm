# Spec 111 — Multi-Step Preview for Granted Operations

## Status

COMPLETED

## Priority

High

## Complexity

Medium

## Dependencies

None (the annotation system and preview system already exist).

**Related specs**:
- `specs/112-global-marker-policy-surface.md` — Spec 112 exposes global marker states to the agent policy surface. Together, these two specs address the event card valuation gap: Spec 111 fixes operation-granting events (preview depth), Spec 112 fixes capability-setting events (observation).
- `specs/113-preview-state-policy-surface.md` — Spec 113 broadens what policy scoring can observe from previewed post-move state. The Spec 111 implementation is complete, but audit evidence showed that many real granting-event follow-ups still land at zero immediate margin delta because the preview-visible scoring surface is narrower than the preview execution path.

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
| 10 — Bounded Computation | Multi-step depth is capped at 1 (event → granted operation). No unbounded recursion. |
| 15 — Architectural Completeness | Closes the gap where the preview system ignores a known follow-up action that the game rules guarantee will happen |

## Scope

### What to Change

**1. Detect granted operations during preview evaluation**

In the preview simulation path (`packages/engine/src/agents/policy-preview.ts`), after `tryApplyPreview()` (line 266) applies the event move and produces a post-event state:
- Extract the event card ID and side from the candidate's move parameters: `cardId = candidate.move.params.eventCardId`, `side = candidate.move.params.side`
- Look up the annotation: `def.cardAnnotationIndex?.entries[cardId]?.[side]`
- Check if `annotation.grantsOperation === true`
- If yes, check if the evaluating agent's seat is among `annotation.grantOperationSeats` (resolving `"self"` to the agent's seat ID at runtime)
- If the agent is a grantee, proceed to step 2

**2. Add evaluator callback to preview dependencies**

Add an optional `evaluateGrantedOperation` callback to `PolicyPreviewDependencies` (policy-preview.ts:33). This follows the existing dependency injection pattern used by `applyMove`, `classifyPlayableMoveCandidate`, and `derivePlayerObservation`. The callback signature:

```typescript
readonly evaluateGrantedOperation?: (
  def: GameDef,
  postEventState: GameState,
  agentSeatId: string,
  runtime?: GameDefRuntime,
) => { move: Move; score: number } | undefined;
```

The caller (`policy-eval.ts`) injects a function that enumerates legal moves in the post-event state, evaluates them using the agent's PolicyAgent profile, selects the best via argmax, and returns it. The preview module stays decoupled — it calls the callback without depending on the evaluation pipeline.

**3. Simulate the granted operation as a second preview step**

After the event preview produces a post-event state and the annotation check identifies a granted operation for the agent's seat:
- Call `deps.evaluateGrantedOperation(def, postEventState, agentSeatId, runtime)`
- If the callback returns a move, apply it via `deps.applyMove()` to produce a post-event-plus-operation state
- Use THIS state for the final margin evaluation (instead of the post-event-only state)
- If the callback returns `undefined` (no legal moves for granted operation), fall back to post-event-only state

**4. Handle edge cases**

- If the granted operation has no legal moves (all actions blocked), fall back to the post-event-only state
- If `grantOperationSeats` contains `self`, resolve to the evaluating agent's seat ID at runtime
- If `grantOperationSeats` contains opponent seats only (the event helps an opponent, not the evaluating agent), do NOT extend the preview — the opponent's granted action is adversarial
- **Recursion depth cap**: Multi-step preview depth is capped at 1 (event → granted operation). If the granted operation itself would trigger further events or grant additional operations, stop after the first granted operation. The `evaluateGrantedOperation` callback must not recursively invoke multi-step preview. (Foundation 10: Bounded Computation.)
- **Budget**: The second step enumerates legal moves in the post-event state, evaluates them using the agent's profile, selects the best via argmax, and applies it. This is bounded by: (a) the number of event candidates with `grantsOperation` (typically 1-2 per decision point), and (b) the legal move count for the granted operation (same order as a normal agent decision).

**5. Diagnostic enrichment**

Add to the preview trace output:
- `grantedOperationSimulated: true/false` — whether multi-step preview was used
- `grantedOperationMove: { actionId, params }` — what the agent selected as the granted operation
- `grantedOperationMarginDelta: number` — how much the granted operation improved the projected margin

### Mutable Files

- `packages/engine/src/agents/policy-preview.ts` (modify) — primary: add multi-step logic in `tryApplyPreview()`, extend `PolicyPreviewDependencies` with `evaluateGrantedOperation` callback
- `packages/engine/src/agents/policy-eval.ts` (modify) — inject `evaluateGrantedOperation` callback when constructing preview dependencies
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — wiring changes to pass agent seat context to preview
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

6. **Unit test: recursion depth capped at 1** — Create a scenario where a granted operation could itself trigger another event. Verify the preview stops after the first granted operation (no recursive multi-step). (Foundation 10.)

7. **Regression test: existing FITL golden traces** — Verify no changes to games that don't involve operation-granting events at agent decision points.

## Expected Impact

Events that grant operations to the evaluating agent will be correctly valued as "event effect + best available follow-up action." This should increase event play rates from ~37% to significantly higher for operation-granting events, particularly in COIN-series games where half the strategic depth is in event card decisions.

The annotation-based workaround (cookbook pattern) will remain useful for events whose value can't be captured by preview depth alone. Multi-step preview complements rather than replaces annotation scoring.

For capability-setting events (which don't grant operations), see Spec 112 (`specs/112-global-marker-policy-surface.md`) — it enables agents to observe and value global marker state changes, addressing the other half of the event card valuation gap.

## Outcome

Completed: 2026-04-05

What changed:
- implemented bounded multi-step preview for granted operations in the policy preview pipeline
- added injected granted-operation evaluation from policy evaluation into preview
- extended verbose trace and diagnostics with `grantedOperationSimulated`, `grantedOperationMove`, and `grantedOperationMarginDelta`
- added unit and production FITL proof coverage

Deviations from original plan:
- the original production acceptance claim, that a granting-event candidate would necessarily score higher than under single-step preview, did not hold up under live FITL audit
- real production candidates do simulate the granted follow-up correctly, but several land at `grantedOperationMarginDelta === 0` under the current preview-visible scoring surfaces
- that broader valuation limitation was split into follow-up `specs/113-preview-state-policy-surface.md` rather than reopening Spec 111

Verification:
- `pnpm -F @ludoforge/engine build`
- `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
- `node --test packages/engine/dist/test/unit/agents/policy-diagnostics.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm run check:ticket-deps`
