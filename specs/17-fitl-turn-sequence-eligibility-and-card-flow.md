# Spec 17: Fire in the Lake Turn Sequence, Eligibility, and Card Flow

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 15, Spec 16
**Estimated effort**: 3-4 days
**Source sections**: rules 2.0-2.4, 3.1.2, 5.0-5.5
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Implement FITL campaign turn flow as declarative game data interpreted by generic sequencing primitives:

- one-card lookahead deck/play progression,
- eligibility/ineligibility transitions,
- first/second eligible option matrix,
- passing and replacement behavior,
- Limited Operation gating,
- monsoon and pivotal-event windows,
- coup-card boundary transitions.

Spec 17 owns closure of two P0 gaps from Spec 15:

- Event lifecycle model.
- Deterministic ordering contracts.

## Architecture Contract

- Canonical path is `GameSpecDoc` YAML -> compiler -> `GameDef` -> simulation.
- FITL-specific sequencing values (faction order tables, eligibility effects, monsoon windows, pivotal constraints) must live in FITL `GameSpecDoc` data.
- Runtime/compiler additions must be game-agnostic and reusable by non-FITL titles.
- No required runtime reads from `data/fitl/...`; those files are optional fixtures only.

## In Scope

- Start/reveal/play sequencing with one-card lookahead (2.2, 2.3.7).
- Eligibility baseline and transition semantics (2.3.1, 2.3.6, 3.1.2).
- First/second eligible options and pass replacement chain (2.3.2-2.3.4).
- Limited Operation constraints (2.3.5).
- Event-produced eligibility overrides with explicit duration windows (2.3.6, 5.x references).
- Pivotal event timing/trumping hook windows and cancellation semantics (2.3.8).
- Monsoon restrictions when Coup is next (2.3.9).
- Coup-card handoff semantics needed for card-flow correctness (2.4, handoff of coup phase execution to Spec 19).

## Out of Scope

- Full pivotal-event payload implementation beyond lifecycle/timing semantics.
- Full event-card pack transcription (owned by Spec 20).

## Rule Semantics to Encode

### Card lifecycle sequence

- On game start, reveal first card to played slot and second card to lookahead slot.
- At end of each played card, promote lookahead card to played slot and reveal next lookahead card, including when played card is Coup.
- Card/sequence state must be trace-visible.

### Eligibility and execution window

- Only currently Eligible factions may act; at most two factions execute non-pass actions per card.
- Faction order for candidate selection is card symbol order, scanning left-to-right and skipping Ineligible factions.
- Passing by first or second eligible faction keeps that faction Eligible for next card and grants resource reward:
- Insurgent pass grants +1 faction Resource.
- COIN pass grants +3 ARVN Resources.
- After a pass, the next leftmost Eligible faction replaces the passer in first/second candidate slot and receives normal options.
- If rightmost Eligible faction passes, card ends after eligibility adjustment.

### First/second eligible option matrix

- If first eligible executes Event, second eligible may execute full Operation with optional Special Activity.
- If first eligible executes Operation only, second eligible may execute Limited Operation only.
- If first eligible executes Operation plus Special Activity, second eligible may execute either Limited Operation or Event.
- Limited Operation counts as an Operation for eligibility transitions.

### Limited Operation definition

- Limited Operation is one-space operation with no Special Activity.
- Patrol/Sweep/March limited-op exception: pieces may originate from multiple spaces but must end in one destination space.

### Eligibility adjustment and duration windows

- Default post-card adjustment sets any faction that executed Operation or Event to Ineligible next card.
- Default post-card adjustment keeps any faction that did not execute as Eligible next card.
- Free Operations granted by events must not change eligibility for non-executing factions per rule 3.1.2 exception semantics.
- Event-based eligibility overrides (remain Eligible, force other faction Ineligible) must have explicit duration metadata.
- Default override duration is one next-card window unless event data encodes a different window.
- Lasting-effect window types (for example card-scoped, next-card, coup-scoped, campaign-scoped) must be declared explicitly in data.

### Pivotal and monsoon windows

- Pivotal event is only playable before first eligible has acted, while faction is Eligible, precondition is met, and Coup is not the next card.
- Pivotal trump ordering/cancellation is represented as deterministic interrupt precedence data.
- Monsoon window is detected by next-card-is-coup condition and enforces:
- no Sweep or March operations.
- US Air Lift and Air Strike limited to 2 spaces.
- no pivotal events.
- event text override support where rule text allows exceptions.

### Coup-card boundary

- When coup card is played, execute immediate card instruction, move coup card into RVN leader slot, then hand off to coup-round sequence (Spec 19).
- Final coup termination decision remains owned by Spec 19 but card-flow trigger point is owned here.

## Deterministic Ordering Contract (Spec 17 Ownership)

Define and enforce the global ordering policy for every non-choice sequencing site used by turn/card flow:

- Faction scan order is card symbol order left-to-right.
- Pass replacement order is same left-to-right scan from current slot.
- Eligibility adjustment writes are committed in stable faction-id order after execution window closes.
- Deck promotion/reveal is strictly one step per completed card and trace-logged.
- Any interrupt window (pivotal/trump) must define deterministic precedence where multiple actors qualify.

Compiler/runtime must reject unresolved unordered semantics in these sites.

## GameSpecDoc/Data Requirements

FITL `GameSpecDoc` must encode, as data:

- Faction identity mapping and card symbol order.
- Eligibility states and temporary override windows.
- Pass reward table by faction class.
- First/second eligible option matrix.
- Limited-operation constraints and movement exception metadata.
- Monsoon restriction package and window trigger.
- Pivotal eligibility and trump precedence metadata.
- Card lifecycle slots (`played`, `lookahead`, `leader`) and transitions.
- Lasting-effect duration declarations and expiration triggers.

No FITL-specific runtime hardcoding of these values.

## Trace Requirements

For each card and each acting/passing faction, trace must include:

- played card id and lookahead card id before/after transition,
- candidate first/second eligible factions,
- action class (`Pass`, `Event`, `Operation`, `LimitedOperation`, `OperationPlusSpecialActivity`),
- eligibility state before and after adjustment,
- any event override window creation/expiration,
- lasting-effect window creation/expiration events,
- monsoon active flag and restricted-action diagnostics when applicable.

## Acceptance Criteria

- Event lifecycle model is implemented as reusable generic capability and proven with FITL data.
- Deterministic ordering contract is codified and enforced for all turn/card flow ordering sites listed above.
- All first/second eligible matrix permutations execute rule-correctly and deterministically.
- Pass chains and left-to-right replacement behavior are rule-correct and trace-visible.
- Monsoon and pivotal windows are enforced with correct exceptions.
- Turn sequencing executes via `GameSpecDoc` -> `GameDef` -> simulation with no required filesystem FITL runtime dependency.
- No FITL-specific branch logic added to generic runtime/compiler modules.

## Testing Requirements

- `fitl-card-lifecycle.spec.ts`: one-card lookahead lifecycle and coup-boundary promotion behavior.
- `fitl-eligibility-window.spec.ts`: default and override eligibility duration windows, including free-op exceptions.
- `fitl-ordering-contract.spec.ts`: deterministic ordering assertions for faction scan, pass replacement, adjustment commits, and interrupt precedence.
- `fitl-card-flow-determinism.spec.ts`: same seed + same moves => byte-identical trace across mixed pass/event/op sequences.
- Integration tests for all first/second eligible option matrix permutations.
- Integration tests for monsoon restrictions and pivotal disallow rules when Coup is next.
- Golden trace covering at least one pass chain, one event-based eligibility override, one monsoon card, and one coup handoff.
