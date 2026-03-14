# Spec 62b: Incremental Choice Protocol For Multi-Selection

**Status**: Draft
**Priority**: P0
**Complexity**: L
**Dependencies**: Spec 25b, Spec 62
**Estimated effort**: 4-6 days
**Source sections**: Follow-up architecture correction from Spec 62 and card 87 playtesting

## Why This Is A Spec, Not A Ticket

This issue is larger than a ticket.

It changes the engine's decision model, the kernel/runner interaction contract, pending-choice types, move materialization, legality/apply parity, AI decision sequencing, and the authoring assumptions behind interactive multi-selection.

That is architecture, not a local bugfix.

## Overview

The current array-based `chooseN` protocol is the wrong abstraction.

Today, the runner holds a local multi-select state, submits one final array, and the engine validates that array only when it is already complete enough to execute. This makes tier-aware legality awkward, pushes interaction state into the UI, and causes a deeper architectural mismatch:

- the kernel cannot drive stepwise legality transitions
- move params are being used as in-progress interaction state
- `legalChoices` and apply-time validation have to reason about an interaction protocol they do not actually own

This spec replaces one-shot array submission with a first-class incremental decision protocol for multi-selection.

`GameSpecDoc` remains responsible for game rules and authored data.
`visual-config.yaml` remains responsible for game-specific presentation data.
`GameDef`, the kernel, and simulation remain fully game-agnostic.

## Problem Statement

### 1. `chooseN` is modeled as a completed value, not a decision process

`chooseN` currently resolves from one submitted array in `Move.params`.
That is convenient for serialization, but it is the wrong architecture for interactive selection.

In practice, multi-selection is a process:

1. inspect currently legal candidates
2. select one
3. recompute what remains legal
4. continue or confirm

The kernel currently owns only step 4.

### 2. Partial interaction state is living in the wrong place

The runner owns temporary selected values for `chooseN`.
The engine sees only either:

- no value yet, or
- one full array

That means the most important legality transitions for prioritized sourcing are happening outside the engine's state model.

### 3. Spec 62's interaction assumption is wrong

Spec 62 assumed the existing decision-sequence model already supported incremental `chooseN` re-evaluation.
It does not.

The current model is incremental across decisions, not within a single `chooseN` decision.

### 4. One-shot array collection is a poor gameplay fit

For many real interactions, especially piece movement and piece placement, players do not think in terms of "submit the final set now".
They choose one item, see the consequences, then continue.

Even when downstream effects remain batched, the selection interaction itself should be engine-driven and stepwise.

## Goals

1. Make multi-selection a first-class engine protocol rather than a runner-local convenience.
2. Let the kernel recompute legality after each `chooseN` selection step.
3. Ensure discovery-time legality and apply-time validation use the same state model and the same rule.
4. Keep the protocol fully game-agnostic.
5. Remove array-submission semantics as the authoritative model for interactive `chooseN`.
6. Enable prioritized tier legality to work naturally from current selection state.

## Non-Goals

1. Do not put visual behavior in `GameSpecDoc`.
2. Do not introduce FITL-specific logic anywhere in kernel/runtime code.
3. Do not attach hidden tier metadata to `evalQuery` results.
4. Do not keep backwards compatibility with the one-shot `chooseN(choice[])` API.
5. Do not solve every future interaction pattern in this spec.

## Design Principles

### A. Separate finalized move data from in-progress decision state

Final move params and interactive selection state are different things.
The architecture should model them separately.

### B. The engine owns legality, not the UI

The runner should render and relay commands.
It should not be the source of truth for stepwise multi-select legality.

### C. Multi-selection is stateful

`chooseN` is not just "an array-typed value".
It is a decision with evolving state and explicit completion.

### D. Authoring stays declarative

Game-specific rules remain authored in `GameSpecDoc` queries/effects.
The kernel provides generic selection semantics only.

## Proposed Architecture

### 1. Introduce first-class decision-sequence state

Add a serializable engine-owned state object for interactive decision resolution.

Conceptually:

```ts
type DecisionSequenceState = {
  actionId: ActionId;
  resolvedParams: Record<string, MoveParamValue>;
  pendingDecision?: PendingDecisionState;
  complete: boolean;
}
```

This state is not the same thing as a final `Move`.

The final `Move` is materialized only when the sequence is complete.

### 2. Replace raw `chooseN` array submission with decision commands

Add a generic command protocol for pending decisions.

Conceptually:

```ts
type DecisionCommand =
  | { type: 'chooseOne.commit'; decisionKey: string; value: MoveParamScalar }
  | { type: 'chooseN.add'; decisionKey: string; value: MoveParamScalar }
  | { type: 'chooseN.remove'; decisionKey: string; value: MoveParamScalar }
  | { type: 'chooseN.confirm'; decisionKey: string };
```

Important:

- `chooseN` becomes incremental by protocol, not by runner convention
- the engine validates each command against current pending state
- the runner no longer submits a completed array as the primary API

### 3. Redefine pending `chooseN` as a collection decision with current state

Pending `chooseN` requests should include the current selection and current admissibility surface.

Conceptually:

```ts
type PendingChooseNRequest = {
  kind: 'pending';
  type: 'chooseN';
  decisionKey: DecisionKey;
  name: string;
  options: readonly ChoiceOption[];
  selected: readonly MoveParamScalar[];
  min: number;
  max: number;
  canConfirm: boolean;
}
```

`selected` is engine state, not UI-local state.

`canConfirm` is computed by the engine from current cardinality and legality rules.

### 4. Materialize final arrays only at completion boundary

When `chooseN.confirm` succeeds, the engine writes the finalized array into `resolvedParams[decisionKey]`.

That preserves declarative downstream effects that expect a bound collection after the choice is complete, while removing the incorrect assumption that in-progress arrays belong in `Move.params`.

### 5. Make prioritized legality stateful by construction

Once `chooseN` has engine-owned incremental state, prioritized legality becomes straightforward.

At each step, legality is computed from:

- the authored `prioritized` query
- the current selected items for this decision
- the remaining candidates in each tier
- optional `qualifierKey`

This is the right layer for the rule.

`evalQuery` remains pure and game-agnostic.

### 6. Unify discovery and apply through the same transition logic

There should not be separate ad hoc logic for:

- pending-choice rendering
- mid-selection command validation
- final confirmation validation

All three should delegate to the same transition function over pending `chooseN` state.

Conceptually:

```ts
advanceChooseNState(
  request: PendingChooseNRequest,
  command: ChooseNCommand,
  context: ChooseNTransitionContext,
): PendingChooseNRequest | FinalizedChooseNResult
```

This is the core invariance boundary for the feature.

## Consequences For Spec 62

Spec 62 remains correct in its query-level architecture:

- `prioritized` is the right generic query primitive
- `evalQuery` should stay pure
- no tier metadata should be attached to query results

Spec 62 is not correct in its interaction-model assumptions:

- the current engine does not already provide incremental `chooseN` re-evaluation
- true stepwise legality cannot be delivered cleanly under the one-shot array contract

This spec supersedes Spec 62 anywhere Spec 62 implies that one-shot array submission is sufficient for prioritized multi-selection UX or legality.

## Runner Changes

The runner should stop owning authoritative `chooseN` selection state.

Required changes:

1. replace `chooseN(selectedValues)` with command submission
2. render `pending.selected` from engine state
3. issue `add` / `remove` / `confirm` commands back to the engine
4. stop deriving legality from stale local state

This keeps the runner thin and deterministic.

## AI And Decision-Sequence Changes

Decision-sequence helpers and agents must operate over the new pending-decision protocol.

Required behavior:

1. enumerate or choose commands, not raw completed arrays
2. preserve deterministic state transitions through the engine
3. materialize final `Move` only once all pending decisions are complete

This is cleaner than teaching every agent to synthesize speculative array payloads.

## Authoring Consequences

Interactive multi-selection remains declarative, but authoring semantics become clearer:

- `chooseN` means "collect a bounded set through the engine-owned decision protocol"
- downstream effects consume the finalized collection only after confirmation

This spec does not add game-specific authoring constructs.

## Card 87 Implication

Card 87 should not be implemented by patching the one-shot array flow.

It should be re-authored on top of:

1. `prioritized` query for sourcing
2. incremental `chooseN` protocol for current-step legality
3. engine-owned per-step recalculation of admissible items

That gives the rules-correct behavior without FITL-specific code.

## Recommended Migration Strategy

Because backwards compatibility is explicitly not required, the recommended migration is direct:

1. Introduce the new decision-sequence state and command protocol.
2. Migrate `chooseOne` and `chooseN` pending-choice handling to the new protocol.
3. Remove the one-shot `chooseN(choice[])` runner/store API.
4. Re-implement prioritized legality on top of the new `chooseN` transition model.
5. Re-author card 87 and any similar interactions against the new engine behavior.

Do not add aliases.
Do not keep both protocols alive.

## Acceptance Criteria

1. The engine has a first-class serializable decision-sequence state separate from finalized `Move`.
2. `chooseN` selection progresses through engine-validated commands rather than one-shot array submission.
3. Pending `chooseN` requests expose current engine-owned selection state.
4. Prioritized legality is recomputed after each selection step inside the engine.
5. Discovery-time legality, command-time validation, and final confirmation all use the same transition logic.
6. `evalQuery` remains pure and carries no hidden tier metadata.
7. The runner no longer owns authoritative multi-select legality state.
8. Game-specific logic remains in authored data, not in kernel/runtime code.

## Implementation Plan

1. Define new decision-sequence state and command types in the kernel type system.
2. Add kernel APIs to start a decision sequence and advance it by command.
3. Rework `chooseOne` and `chooseN` effect execution to operate through pending-decision state transitions.
4. Remove one-shot array submission from the runner/store contract.
5. Port decision-sequence helpers, move completion, and agents to the new protocol.
6. Implement prioritized `chooseN` legality on top of incremental engine-owned state.
7. Re-author card 87 and add end-to-end tests.

## Required Tests

### Kernel Unit Tests

- pending `chooseN` exposes current `selected` state
- `chooseN.add` rejects illegal or duplicate additions
- `chooseN.remove` updates state deterministically
- `chooseN.confirm` rejects confirmation below `min`
- prioritized legality updates after each step with `qualifierKey`
- prioritized legality updates after each step without `qualifierKey`
- discovery/apply/confirm parity holds for the same pending state

### Runner Tests

- runner renders engine-owned current selections
- runner submits add/remove/confirm commands instead of arrays
- runner does not permit stale-local legality drift

### Integration Tests

- card 87: map pieces of a type remain unavailable while available pieces of that type still exist
- card 87: once higher-tier pieces of a type are exhausted by prior selections, lower-tier pieces of that type become selectable
- generic non-FITL prioritized example with another qualifier key

## Notes

This spec intentionally does not preserve the array-submission architecture.

That architecture is not merely inconvenient.
It is the wrong ownership boundary for interactive multi-selection.
