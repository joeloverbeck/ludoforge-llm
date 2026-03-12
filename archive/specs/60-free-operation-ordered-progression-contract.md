# Spec 60: Free-Operation Ordered Progression Contract

**Status**: COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: Existing free-operation grant architecture, sequence context architecture, FITL event card encoding
**Estimated effort**: 4-6 days
**Source sections**: Fire in the Lake rules 5.1.1, 5.1.2, 5.1.3, 5.5; archived reassessments `FREEOP-002` and `FITLEVENT-069`

## Overview

Introduce an explicit, generic ordered-progression contract for free-operation grant sequences in `GameSpecDoc`.

Today, ordered free-operation sequences already support:

- strict step ordering
- `requireUsableAtIssue`
- `requireUsableForEventPlay`
- required completion
- sequence context capture/require

What they do not support explicitly is a second progression policy where an authored ordered sequence may continue past an earlier step that is not implementable, while still preserving deterministic, game-agnostic semantics.

This spec adds that missing policy as a first-class authoring contract. It does not add a MACV-specific hack. It creates a reusable generic mechanism that any game can use when event text means:

1. execute text in order
2. implement what can
3. later ordered steps may still occur if earlier ordered steps are not implementable

Once implemented, MACV should be reworked to use this new contract and then tested for full rule-5.1.3 fidelity.

## Problem

The current architecture intentionally keeps runtime state minimal:

- only emitted pending grants are stored
- ordered readiness is derived from emitted pending grants
- `requireUsableAtIssue` suppresses grants that are not currently usable

That architecture is clean for the current contract, but it leaves one generic gap:

- the authored data cannot say whether an ordered sequence means:
  - `strict`: later step exists only if earlier step emitted and resolved
  - `implementWhatCanInOrder`: later step may still progress if earlier step is not implementable

This gap is currently visible in FITL card 69 (MACV), but the problem is not FITL-specific. It is a missing generic progression contract.

## Goals

- Add an explicit authoring-level progression contract for ordered free-operation sequences.
- Keep the kernel generic and deterministic.
- Avoid hidden inference from "pending grant missing" or card-specific exceptions.
- Preserve the current clean separation:
  - `GameSpecDoc` authors intent
  - compiler validates and lowers the contract
  - runtime executes one canonical progression model
- Provide thorough validation and regression coverage.
- Rework MACV to use the new system after the generic contract is implemented.

## Non-Goals

- No FITL-specific kernel path.
- No backwards-compatibility aliases or legacy synonyms.
- No implicit heuristic such as "missing earlier emitted grant probably means skipped."
- No bespoke solution only for event cards; effect-issued and event-issued grants must share the same semantics.

## Current State

The existing system already handles:

- ordered sequence gating via `sequence.batch` and `sequence.step`
- readiness from emitted pending grants
- usability probing via `viabilityPolicy`
- required completion and post-resolution turn-flow resumption
- sequence-context capture and follow-up constraints

The missing part is that progression intent is not explicit. `requireUsableAtIssue` currently means "do not emit unusable step", but the system has no separate declarative way to say whether later steps may continue when that happens.

## Proposed Contract

### New Authoring Concept

Add an explicit progression policy for ordered free-operation batches.

Proposed shape:

```yaml
freeOperationGrants:
  - seat: us
    sequence:
      batch: macv-us-then-arvn
      step: 0
      progressionPolicy: implementWhatCanInOrder
    operationClass: specialActivity
    actionIds: [advise, airLift, airStrike]
    viabilityPolicy: requireUsableAtIssue
    completionPolicy: required
    postResolutionTurnFlow: resumeCardFlow
  - seat: arvn
    sequence:
      batch: macv-us-then-arvn
      step: 1
      progressionPolicy: implementWhatCanInOrder
    operationClass: specialActivity
    actionIds: [govern, transport, raid]
    viabilityPolicy: requireUsableAtIssue
    completionPolicy: required
    postResolutionTurnFlow: resumeCardFlow
```

### Policy Values

The new policy should be explicit and closed:

- `strictInOrder`
- `implementWhatCanInOrder`

No aliases.

### Policy Meaning

#### `strictInOrder`

Current default semantics, made explicit.

- Earlier steps that do not emit under their viability contract stop progression.
- Later steps do not become issuable unless each earlier step emitted and reached a terminal runtime outcome under the existing sequence model.

#### `implementWhatCanInOrder`

New semantics.

- Ordered steps are still evaluated in order.
- If an earlier step is implementable, it must remain an actual blocker until terminal.
- If an earlier step is not implementable under its authored viability contract at the progression point, that step becomes explicitly non-blocking for this batch progression.
- Later steps may then progress.

This policy must be defined generically for both event-issued and effect-issued sequences.

## Runtime Model

The runtime should no longer rely on inference from emitted pending grants alone for batches that use `implementWhatCanInOrder`.

### Required Runtime State

Rather than introducing a standalone batch state structure, extend the existing `TurnFlowFreeOperationSequenceBatchContext` (defined in `types-turn-flow.ts:191`, stored at `runtime.freeOperationSequenceContexts[batchId]`). The existing structure already carries per-batch metadata (captured move zones). Adding a parallel structure would fragment batch state across multiple locations.

Extended shape:

```ts
interface TurnFlowFreeOperationSequenceBatchContext {
  readonly capturedMoveZonesByKey: Readonly<Record<string, readonly string[]>>;
  readonly progressionPolicy?: 'strictInOrder' | 'implementWhatCanInOrder';
  readonly skippedStepIndices?: readonly number[];
}
```

The three status values `pendingEvaluation`, `pendingIssued`, and `consumed` from the original draft are not needed — they duplicate information already tracked by the presence/absence of grants in `pendingFreeOperationGrants`. Only the concept of "skipped because unimplementable" is genuinely new state, represented minimally as `skippedStepIndices`.

### Why Explicit State Is Now Justified

This spec intentionally does what archived `FREEOP-002` should not have done under the old contract: it introduces explicit batch-step state only because there is now an explicit authoring policy that requires it.

That is the critical architectural difference:

- old proposal: add full lifecycle state to compensate for an implicit contract
- this spec: add *minimal* state (just `skippedStepIndices` and `progressionPolicy`) because authored progression intent is now explicit and must be represented faithfully

The new state is a small extension of an existing structure (`TurnFlowFreeOperationSequenceBatchContext`), not a full lifecycle rewrite. This keeps the architectural distinction from `FREEOP-002` even cleaner.

## Compiler and Validation Requirements

### Compiler

The compiler must:

- accept the new `sequence.progressionPolicy` field
- enforce one canonical lowered representation
- reject mixed policy values within the same logical batch

### Validation Rules

The validator must reject:

- batches where steps in the same batch disagree on `progressionPolicy`
- `implementWhatCanInOrder` on unordered or malformed sequence declarations
- invalid combinations where sequence-context requirements depend on a step that may be skipped without explicit author acknowledgement
- ambiguous overlap semantics caused by multiple grants sharing one step and conflicting progression behavior

### Sequence Context Rules

`implementWhatCanInOrder` interacts with sequence context and must be made explicit:

- capture from a skipped step never occurs
- require-from-skipped-step must fail deterministically
- **Hard rejection rule**: if a batch uses `implementWhatCanInOrder`, no later step may `requireMoveZoneCandidatesFrom` an earlier step in the same batch. The compiler must reject this combination at validation time. The rationale: if an earlier step can be skipped, any context it would have captured is unreliable. Rather than introducing speculative optionality fields, the compiler enforces a clean separation. If a future card genuinely needs optional cross-step context under skip-capable progression, a future spec can add that contract.

## Runtime Semantics

The kernel must use one shared batch progression engine for:

- event play viability
- pending grant extraction
- free-operation discovery
- legal move enumeration
- apply-time consumption
- denial diagnostics

### Progression Point

Viability evaluation for skip decisions happens at **grant emission time** — that is, when the batch's effects execute (either from event `freeOperationGrants` or effect-issued `grantFreeOperation`). At that moment, each step is probed in order via the existing viability machinery. Steps that are not implementable under their `viabilityPolicy` are recorded as skipped in `skippedStepIndices`. This is a **one-time evaluation**, not re-probed at legal-move enumeration time.

This is critical for determinism: the viability probe result can differ depending on game state, so the moment of evaluation must be fixed and explicit.

### Progression Rules

For `strictInOrder`:

- preserve current behavior

For `implementWhatCanInOrder`:

1. At grant emission time, evaluate steps in ascending order.
2. If step is implementable, emit its grant(s) and block later steps until terminal.
3. If step is not implementable under its viability contract, record its index in `skippedStepIndices`. Do not emit grants for it.
4. Continue evaluating later steps.
5. Sequence completion occurs when every step is terminal: consumed or skipped.

### Key Function: `isPendingFreeOperationGrantSequenceReady`

The central function that must change is `isPendingFreeOperationGrantSequenceReady` (`free-operation-grant-authorization.ts:61`). Currently, it checks whether any earlier-indexed pending grant exists in the same batch. For `implementWhatCanInOrder` batches, it must additionally consult `skippedStepIndices` from the batch context (`runtime.freeOperationSequenceContexts[batchId]`), so that a later step is considered ready if all earlier steps are either:

- already consumed (no longer in `pendingFreeOperationGrants`), OR
- recorded in `skippedStepIndices`

This is the single most important runtime change for this spec.

### Determinism Requirements

- Progression must be deterministic across legal move generation and apply-time validation.
- Discovery must never surface a move that apply-time progression rejects under the same batch state.
- Diagnostics must identify whether a step is blocked by:
  - earlier issued step
  - earlier required context
  - malformed contract
  - ambiguous overlap

## Event-Issued and Effect-Issued Parity

This system must be shared by:

- declarative event `freeOperationGrants`
- effect-issued `grantFreeOperation`

No separate semantics.

Both issuance paths must lower into one canonical batch progression model with the same validation and runtime behavior.

## MACV Rework Requirement

Once this system exists, MACV must be reworked to use it.

### MACV Acceptance After Generic System Lands

Card 69 should then prove:

- `US -> ARVN`, both usable
- `NVA -> VC`, both usable
- `US` unusable but `ARVN` usable
- `NVA` unusable but `VC` usable
- both unusable in chosen branch
- executing faction remains eligible
- no FITL-specific kernel logic

The MACV rework must be done in game data and tests, not by special-casing the card in the runtime.

## Implementation Tasks

### Task 60.1: Contract Surface (schema + types + validation)

- Extend free-operation sequence schema/types with explicit `progressionPolicy`.
- Update shared Zod and JSON schema artifacts.
- Add validator diagnostics for malformed progression contracts.
- Add hard rejection rule: `implementWhatCanInOrder` batches cannot have later steps that `requireMoveZoneCandidatesFrom` earlier steps.
- Reject mixed `progressionPolicy` values within the same batch.

### Task 60.2: Emission and Batch State (event-issued + effect-issued parity)

- Extend `TurnFlowFreeOperationSequenceBatchContext` with `progressionPolicy` and `skippedStepIndices`.
- At grant emission time, probe viability of each step in order and populate `skippedStepIndices` for unimplementable steps.
- Ensure both event-issued (`freeOperationGrants`) and effect-issued (`grantFreeOperation`) paths lower into the same batch context with identical semantics.
- Update trace/runtime schemas to reflect the extended batch context.

### Task 60.3: Sequence Readiness Engine

- Update `isPendingFreeOperationGrantSequenceReady` (`free-operation-grant-authorization.ts:61`) to consult `skippedStepIndices` from batch context, so skipped earlier steps do not block later ones.
- Integrate with discovery (`free-operation-discovery-analysis.ts`) and legal-move enumeration.
- Ensure discovery/apply-time parity: discovery never surfaces a move that apply-time rejects under the same batch state.

### Task 60.4: MACV Data Rework

- Rework card 69 authoring to use the new generic `implementWhatCanInOrder` policy.
- Update MACV compile-shape and runtime tests.

### Task 60.5: Regression Matrix

- Add broad unit and integration coverage for the progression model.
- Cover all required regression cases (see Testing Strategy).

## Files Likely Affected

**Critical** (core logic changes):
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` — contains `isPendingFreeOperationGrantSequenceReady`, the key function to update
- `packages/engine/src/kernel/types-turn-flow.ts` — `TurnFlowFreeOperationSequenceBatchContext` extension
- `packages/engine/src/kernel/effects-turn-flow.ts` — grant emission logic, batch context population

**Schema/Contract** (type surface):
- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`
- `packages/engine/src/kernel/schemas-extensions.ts`
- `packages/engine/schemas/GameDef.schema.json`
- `packages/engine/schemas/Trace.schema.json`

**Validation** (compiler rejection rules):
- `packages/engine/src/kernel/validate-events.ts`
- `packages/engine/src/kernel/validate-effects.ts`

**Integration** (delegation-based, likely minimal changes):
- `packages/engine/src/kernel/turn-flow-eligibility.ts`
- `packages/engine/src/kernel/free-operation-viability.ts`
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts`

**Game data**:
- `data/games/fire-in-the-lake/41-events/065-096.md` — MACV rework

**Tests**:
- `packages/engine/test/integration/fitl-events-macv.test.ts`
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`
- `packages/engine/test/unit/kernel/*.test.ts`
- `packages/engine/test/unit/validate-gamedef.test.ts`

**Not affected** (delegate to authorization/discovery, no direct progression logic):
- `legal-moves.ts` — delegates to discovery and authorization
- `apply-move.ts` — delegates to authorization

## Testing Strategy

### Unit Coverage

- progression engine state transitions
- strict vs implement-what-can progression
- sequence-context interactions with skipped steps
- event/effect parity
- validation diagnostics

### Integration Coverage

- generic ordered declarative event sequence fixtures
- generic ordered effect-issued sequence fixtures
- MACV full-fidelity cases
- existing strict ordered cards remain unchanged

### Required Regression Cases

1. Earlier step implementable, later step blocked until consumption.
2. Earlier step unimplementable, later step proceeds under `implementWhatCanInOrder`.
3. Earlier step unimplementable, later step does not proceed under `strictInOrder`.
4. Skipped step does not capture sequence context.
5. Required context from skipped step is rejected or denied deterministically.
6. Event-issued and effect-issued contracts behave identically.
7. Discovery/apply parity holds.
8. MACV uses the new generic contract without kernel hacks.

## Acceptance Criteria

1. Ordered free-operation progression intent is authored explicitly in `GameSpecDoc`.
2. Runtime progression is represented explicitly and generically.
3. `strictInOrder` preserves existing behavior.
4. `implementWhatCanInOrder` supports rules-faithful partial ordered execution.
5. Event-issued and effect-issued sequences share one canonical contract.
6. Validation rejects contradictory or unsafe sequence-context combinations.
7. MACV is reworked to use the generic system and passes full-fidelity regression coverage.
8. No FITL-specific runtime path or backwards-compatibility alias is introduced.

## Risks

- If a future card needs cross-step context capture under `implementWhatCanInOrder`, the hard rejection rule will require a new spec to add an explicit optionality contract. This is intentional (YAGNI) but could delay that future card.
- Runtime trace/schema growth must remain disciplined and well-documented.
- Existing ordered cards must not regress under the preserved default `strictInOrder` behavior.

## Recommendation

If implemented, this spec should become the sole architectural path for partial ordered free-operation progression. Do not revive ticket-level workaround logic for MACV or any other card once this spec exists.

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - Added the shared `sequence.progressionPolicy` contract surface with `strictInOrder` and `implementWhatCanInOrder` across types, schemas, lowering, and validation.
  - Extended runtime batch context to carry canonical progression metadata, including `progressionPolicy` and `skippedStepIndices`, for both event-issued and effect-issued free-operation batches.
  - Implemented shared emission-time skip evaluation and canonical sequence-status handling so ordered progression, readiness, and blocker reporting stay aligned.
  - Reworked FITL card 69 (MACV) data to use the generic `implementWhatCanInOrder` policy and expanded regression coverage around skip behavior and required-seat parity.
  - Landed the remaining regression-matrix coverage in the existing generic integration harness instead of a duplicate test matrix.
- Deviations from original plan:
  - Task 60.3 did not land exactly as originally written. An intermediate ticket retired the first readiness-layer proposal, then later work reinstated a narrower generic readiness/status fix after implementation exposed a real consumed-step blocking bug.
  - The regression matrix was completed by extending existing generic and MACV-specific tests rather than by introducing a separate new matrix file.
- Verification results:
  - The implementation ticket outcomes record passing engine unit, integration, and e2e coverage, including targeted MACV and progression regression tests.
  - `pnpm turbo test`, `pnpm -F @ludoforge/engine test:e2e`, `pnpm turbo typecheck`, `pnpm turbo lint`, and `pnpm turbo schema:artifacts` were all recorded as passing during the completion of the ticket series, with lint only reporting pre-existing repository warnings.
