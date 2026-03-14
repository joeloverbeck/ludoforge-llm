# Spec 62b: Incremental Choice Protocol For Multi-Selection

**Status**: ✅ COMPLETED
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 25b, Spec 62
**Estimated effort**: 3-4 days
**Source sections**: Follow-up architecture correction from Spec 62 and card 87 playtesting

## Overview

The current `chooseN` protocol submits a completed array atomically. The kernel cannot recompute legality between individual selection steps. This blocks Spec 62's prioritized sourcing (which needs to know what's already selected to determine tier admissibility), prevents per-piece animation in the runner, and forces interaction state into the UI layer where it doesn't belong.

This spec adds an incremental sub-loop for `chooseN` within the existing decision-sequence model. It does not replace the decision model — the outer `resolveMoveDecisionSequence` loop and `Move.params` accumulation remain unchanged.

`GameSpecDoc` remains responsible for game rules and authored data.
`visual-config.yaml` remains responsible for game-specific presentation data.
`GameDef`, the kernel, and simulation remain fully game-agnostic.

## Problem Statement

### 1. `chooseN` submits atomically — kernel can't drive stepwise legality

`chooseN` currently resolves from one submitted array in `Move.params`. The kernel sees either no value yet or one full array. It cannot recompute which candidates remain legal after each individual selection.

In practice, multi-selection is a process:

1. inspect currently legal candidates
2. select one
3. recompute what remains legal (including tier admissibility for prioritized queries)
4. continue or confirm

The kernel currently owns only step 4.

### 2. Prioritized sourcing needs per-step state

Spec 62's `prioritized` query requires knowing what's already selected to determine tier admissibility. With atomic submission, the engine can only validate the final array — it cannot enforce tier ordering during selection.

### 3. Interaction state lives in the wrong layer

The runner owns temporary selected values for `chooseN`. The engine sees only either no value or one full array. The most important legality transitions for prioritized sourcing happen outside the engine's state model.

### 4. One-shot submission prevents per-piece animation

The runner can't animate per-piece movement because all selections arrive batched. Incremental selection enables the runner to animate each piece as it's selected.

## Goals

1. Let the kernel recompute `chooseN` legality after each selection step.
2. Ensure discovery-time legality and apply-time validation use the same tier-admissibility rule.
3. Keep the protocol fully game-agnostic.
4. Preserve the existing AI fast-path — agents continue returning full arrays via the `choose` callback.
5. Enable per-piece animation in the runner.

## Non-Goals

1. Do not replace the outer decision-sequence model (`resolveMoveDecisionSequence`, `Move.params`).
2. Do not change `chooseOne` handling — it already works correctly as an atomic step.
3. Do not force AI agents through the incremental protocol.
4. Do not introduce FITL-specific logic anywhere in kernel/runtime code.
5. Do not attach hidden tier metadata to `evalQuery` results.

## Design Principles

### A. Extend, don't replace

`Move.params` holds finalized decision values. `ChoicePendingRequest` (returned by `legalChoicesDiscover`) represents the in-progress decision. The only gap is that `ChoicePendingRequest` for `chooseN` doesn't include selection state. This is a field addition to an existing type, not a new state model.

### B. The engine owns legality, not the UI

The runner should render and relay commands. It should not be the source of truth for stepwise multi-select legality.

### C. `chooseN` sub-loop is the caller's responsibility

The outer decision sequence loop (`resolveMoveDecisionSequence`) stays unchanged. The `chooseN` incremental protocol is a sub-loop that the caller (runner or test harness) drives by calling a new pure kernel function. Once the sub-loop completes, the finalized array is written into `Move.params[decisionKey]` and the outer loop continues.

### D. Authoring stays declarative

Game-specific rules remain authored in `GameSpecDoc` queries/effects. The kernel provides generic selection semantics only.

## Proposed Architecture

### 1. Extend `ChoicePendingRequest` with selection state

Add two fields to the existing `ChoicePendingRequest` type when `type === 'chooseN'`:

```ts
// In types-core.ts — additions to existing ChoicePendingRequest
selected?: readonly MoveParamScalar[];  // current engine-owned selection state
canConfirm?: boolean;                   // computed from cardinality rules
```

`selected` is engine state, not UI-local state.
`canConfirm` is computed by the engine from current cardinality and legality rules.

### 2. Add `advanceChooseN` pure kernel function

A single new function handles incremental `chooseN` as a sub-loop within the existing decision sequence:

```ts
// New file: packages/engine/src/kernel/advance-choose-n.ts

type ChooseNCommand =
  | { type: 'add'; value: MoveParamScalar }
  | { type: 'remove'; value: MoveParamScalar }
  | { type: 'confirm' };

type AdvanceChooseNResult =
  | { done: false; pending: ChoicePendingRequest }  // updated pending with new selected/canConfirm
  | { done: true; value: readonly MoveParamScalar[] }; // finalized array

function advanceChooseN(
  def: GameDef,
  state: GameState,
  partialMove: Move,        // Move with params resolved so far (NOT including chooseN key)
  decisionKey: DecisionKey,
  currentSelected: readonly MoveParamScalar[],
  command: ChooseNCommand,
  runtime?: GameDefRuntime,
): AdvanceChooseNResult;
```

This function:

1. Reconstructs the discovery context for the `chooseN` decision (same path `legalChoicesDiscover` uses)
2. For `add`: validates the item is legal given `currentSelected`, appends it, recomputes options legality
3. For `remove`: removes the item, recomputes options legality
4. For `confirm`: validates cardinality, returns finalized array
5. Uses the shared tier-admissibility helper for `prioritized` queries

### 3. Add shared tier-admissibility helper

Extract tier-admissibility logic into a shared helper consumed by both `advanceChooseN` (discovery-time) and `effects-choice.ts` (apply-time validation):

```ts
// New file: packages/engine/src/kernel/prioritized-tier-legality.ts

function computeTierAdmissibility(
  tiers: readonly PrioritizedTier[],
  alreadySelected: readonly MoveParamScalar[],
  qualifierKey?: string,
): { admissibleValues: readonly MoveParamScalar[]; tierIndex: number };
```

This is the building block identified by ticket 62CONPIESOU-005. Both discovery and apply-time validation delegate to it, ensuring parity.

### 4. Materialize final arrays only at completion boundary

When `confirm` succeeds, `advanceChooseN` returns `{ done: true, value: finalizedArray }`. The caller writes the finalized array into `Move.params[decisionKey]` and the outer decision sequence continues.

This preserves declarative downstream effects that expect a bound collection after the choice is complete.

### 5. Make prioritized legality stateful by construction

Once `advanceChooseN` has engine-owned incremental state, prioritized legality becomes straightforward. At each step, the tier-admissibility helper computes legality from:

- the authored `prioritized` query tiers
- the current selected items for this decision
- the remaining candidates in each tier
- optional `qualifierKey`

`evalQuery` remains pure and game-agnostic.

## What Changes

| Component | Change |
|-----------|--------|
| `types-core.ts` | Add `selected?: readonly MoveParamScalar[]` and `canConfirm?: boolean` to `ChoicePendingRequest` |
| `advance-choose-n.ts` | New file — pure `advanceChooseN` function |
| `prioritized-tier-legality.ts` | New file — shared tier-admissibility helper (from ticket 005) |
| `effects-choice.ts` | Apply-time validation uses shared tier-admissibility helper |
| `legal-choices.ts` | Discovery-time legality uses shared tier-admissibility helper |
| Runner store | Replace `chooseN(fullArray)` with `addChooseNItem`, `removeChooseNItem`, `confirmChooseN` |
| Runner bridge/worker | Add `advanceChooseN` bridge method |
| Runner ChoicePanel | Render `selected` from pending request, issue incremental commands |

## What Does NOT Change

| Component | Why Unchanged |
|-----------|---------------|
| `resolveMoveDecisionSequence` | Outer loop stays the same — chooseN sub-loop is caller's responsibility |
| `chooseOne` handling | Already works correctly as atomic step |
| AI agents / `choose` callback | Fast-path preserved — agents return full arrays, engine auto-validates |
| `GameState` | No new fields — in-progress chooseN state is transient |
| `Move` type | Unchanged — finalized array still written to `Move.params` |

## Interaction Flow (Runner)

```
1. selectAction(actionId) -> legalChoices({actionId, params: {}})
2. Kernel returns ChoicePendingRequest { type: 'chooseOne', ... }
3. Runner submits scalar -> builds Move, calls legalChoices(updatedMove)
   [... repeat for each chooseOne ...]
4. Kernel returns ChoicePendingRequest { type: 'chooseN', selected: [], canConfirm: false, ... }
5. Runner enters chooseN sub-loop:
   a. User clicks item -> runner calls bridge.advanceChooseN(move, key, selected, {type:'add', value})
   b. Kernel returns updated ChoicePendingRequest { selected: [item], canConfirm: false|true, options with updated legality }
   c. Runner animates the selection (e.g., piece movement)
   d. Repeat until user confirms
   e. User clicks confirm -> runner calls bridge.advanceChooseN(move, key, selected, {type:'confirm'})
   f. Kernel returns finalized array
6. Runner writes finalized array into Move.params[decisionKey], continues decision sequence
```

## AI Flow (Unchanged)

```
1. resolveMoveDecisionSequence(def, state, baseMove, { choose: agent.choose })
2. Loop hits chooseN -> choose callback returns full MoveParamScalar[]
3. Engine validates the full array (including tier-admissibility via shared helper)
4. Move.params[decisionKey] = fullArray, loop continues
```

## Consequences For Spec 62

Spec 62 remains correct in its query-level architecture:

- `prioritized` is the right generic query primitive
- `evalQuery` should stay pure
- no tier metadata should be attached to query results

Spec 62's interaction-model assumption that one-shot array submission is sufficient for prioritized multi-selection UX is superseded by this spec. The `advanceChooseN` function provides the incremental re-evaluation that Spec 62 assumed already existed.

## Runner Changes

The runner stops owning authoritative `chooseN` selection state. Required changes:

1. Replace `chooseN(selectedValues)` with `addChooseNItem` / `removeChooseNItem` / `confirmChooseN` store actions
2. Render `pending.selected` from engine-returned state
3. Issue `add` / `remove` / `confirm` commands back to the engine via the bridge
4. Stop deriving legality from stale local state

`chooseOne` submission is unchanged.

## Authoring Consequences

Interactive multi-selection remains declarative, but authoring semantics become clearer:

- `chooseN` means "collect a bounded set through the engine-owned decision protocol"
- downstream effects consume the finalized collection only after confirmation

This spec does not add game-specific authoring constructs.

## Card 87 Implication

Card 87 should be implemented on top of:

1. `prioritized` query for sourcing (Spec 62)
2. incremental `chooseN` protocol via `advanceChooseN` for per-step legality
3. shared tier-admissibility helper for per-step recalculation of admissible items

That gives the rules-correct behavior without FITL-specific code.

## Acceptance Criteria

1. `ChoicePendingRequest` for `chooseN` exposes engine-owned `selected` state and `canConfirm`.
2. `advanceChooseN` validates each add/remove/confirm command against current state and recomputes legality.
3. Prioritized tier-admissibility is recomputed after each selection step inside the engine.
4. A shared tier-admissibility helper is used by both discovery-time (`advanceChooseN`) and apply-time (`effects-choice`) validation.
5. `evalQuery` remains pure and carries no hidden tier metadata.
6. AI agents continue using the `choose` callback with full arrays — no forced protocol change.
7. The runner no longer owns authoritative multi-select legality state for `chooseN`.
8. Game-specific logic remains in authored data, not in kernel/runtime code.

## Implementation Plan

1. **Shared tier-admissibility helper** — extract `computeTierAdmissibility` into `prioritized-tier-legality.ts`. Wire into `effects-choice.ts` and `legal-choices.ts`.
2. **Extend `ChoicePendingRequest`** — add `selected` and `canConfirm` fields to `types-core.ts`.
3. **`advanceChooseN` kernel function** — new file `advance-choose-n.ts` implementing the incremental sub-loop.
4. **Runner bridge/worker** — add `advanceChooseN` bridge method.
5. **Runner store** — replace `chooseN(fullArray)` with incremental store actions.
6. **Runner ChoicePanel** — render `selected` from pending request, issue incremental commands.
7. **Card 87 re-authoring** — implement on top of the new protocol with end-to-end tests.

## Required Tests

### Kernel Unit Tests

- pending `chooseN` exposes current `selected` state and `canConfirm`
- `advanceChooseN` with `add` command rejects illegal or duplicate additions
- `advanceChooseN` with `add` command recomputes options legality
- `advanceChooseN` with `remove` command updates state deterministically
- `advanceChooseN` with `confirm` command rejects confirmation below `min`
- `advanceChooseN` with `confirm` command returns finalized array at valid cardinality
- prioritized tier-admissibility updates correctly after each step with `qualifierKey`
- prioritized tier-admissibility updates correctly after each step without `qualifierKey`
- shared tier-admissibility helper produces same result at discovery-time and apply-time
- AI fast-path: full array submission still works via `choose` callback

### Runner Tests

- runner renders engine-owned current selections from `pending.selected`
- runner submits add/remove/confirm commands instead of arrays
- runner does not permit stale-local legality drift

### Integration Tests

- card 87: map pieces of a type remain unavailable while available pieces of that type still exist
- card 87: once higher-tier pieces of a type are exhausted by prior selections, lower-tier pieces of that type become selectable
- generic non-FITL prioritized example with another qualifier key

## Notes

The outer decision-sequence model (`resolveMoveDecisionSequence`, `Move.params` accumulation) is not changed by this spec. The only new concept is the `chooseN` sub-loop driven by `advanceChooseN`, which slots into the existing architecture as a caller-side loop between the point where a `chooseN` pending request is received and the point where the finalized array is written into `Move.params`.

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Delivered the incremental `chooseN` protocol across archived tickets `62BINCCHOPRO-001` through `62BINCCHOPRO-009`, including engine-owned pending selection state, shared prioritized tier admissibility, the pure `advanceChooseN` kernel API, runner/store/ChoicePanel incremental commands, and the final pending-choice cardinality narrowing.
  - Preserved the intended architecture from this spec: the outer decision sequence stayed intact, `chooseOne` remained atomic, AI full-array submission stayed supported, and runner UI remained downstream of engine-owned legality state.
  - Re-authored and verified the downstream FITL behavior on top of the generic protocol rather than adding game-specific engine logic.
- Deviations from original plan:
  - The implementation landed incrementally across multiple small tickets rather than one monolithic change.
  - The final cleanup ticket confirmed there was no separate pending-choice runtime schema artifact to narrow; the remaining work was type-contract and consumer/test cleanup only.
- Verification results:
  - `pnpm turbo build`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
