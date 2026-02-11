# Spec 20: Fire in the Lake Event Framework and Initial Card Pack

**Status**: ✅ COMPLETED
**Priority**: P1 (required for foundation deliverable)
**Complexity**: M
**Dependencies**: Spec 15, Spec 15a, Spec 16, Spec 17, Spec 18, Spec 19
**Estimated effort**: 2-3 days
**Source sections**: rules 5.0-5.5, card appendix (Card 82 and Card 27)
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Implement foundation event execution semantics using generic declarative event primitives, then encode the first two concrete cards from the brainstorming appendix as data in an initial FITL card pack.

## In Scope

- Data format for card/event definitions consumed by generic runtime event execution.
- `GameSpecDoc` schema profile for event cards, including deterministic ordering metadata and branch/effect validation.
- Dual-use selection (unshaded vs shaded).
- Event precedence and partial execution semantics.
- Lasting-effect hooks for capabilities/momentum (minimal infrastructure even if no lasting effect in first two cards).
- Free operation semantics and eligibility interactions using generic primitives.
- Card 82: Domino Theory (both sides).
- Card 27: Phoenix Program (both sides).
- Event definitions are embedded in `GameSpecDoc` YAML and compiled to `GameDef` with no required runtime filesystem FITL card lookup.

## Out of Scope

- Full deck transcription and balancing.
- FITL-specific runtime branches keyed on card id, faction id, or map ids.

## Prerequisite Readiness Check

- Specs 16-19 are archived as completed foundation specs in `archive/specs/` and define prerequisite capabilities consumed by Spec 20.
- Before implementing Spec 20 work in the active codebase, verify that those capabilities are present (or intentionally reintroduced) for:
  - map/state typing and validation,
  - turn sequence and event lifecycle windows,
  - operation/targeting primitives,
  - coup and scoring interactions that events can mutate.

## Generic Event Semantics Contract

- Execute event text in declared order.
- Event text overrides normal rules when conflicting, except these hard invariants remain enforced:
  - stacking constraints,
  - no illegal placement source (available by default unless event states otherwise),
  - track bounds (0-75 for Aid/Resources/Patronage),
  - no forced removal of Tunneled Bases unless text explicitly permits it.
- If full resolution is impossible, execute all implementable effects deterministically and trace skipped portions (`rule 5.1.3` behavior).
- Dual-use cards must permit either side regardless of acting faction.
- Free operations granted by events must be zero-cost and must not change eligibility unless event text explicitly says otherwise.
- Capability/Momentum infrastructure must be generic and data-driven:
  - capabilities persist for campaign duration,
  - momentum persists until next Coup Reset window.

## Data Contract (`GameSpecDoc` -> `GameDef`)

- Card/event definitions are declared inside `GameSpecDoc` YAML (for example under `dataAssets` payloads).
- Compiler must lower cards into generic `GameDef` action/effect structures without FITL-specific lowering branches.
- Compiler diagnostics must reject:
  - missing dual-use branch payloads for dual-use cards,
  - invalid target cardinality constraints,
  - unordered non-choice effect sets that could become nondeterministic,
  - event definitions that can violate hard invariants above.

## Trace Contract

- Each event execution trace must include:
  - card id/title,
  - selected side (unshaded or shaded),
  - selected branch for A-or-B text where applicable,
  - chosen targets in deterministic order,
  - skipped/unapplied steps with reason when partial execution occurs,
  - resulting eligibility/lasting-effect state deltas.

## Card-Specific Acceptance Rules

### Card 82 (Domino Theory)
- Unshaded must support one chosen branch:
  - move up to 3 US out-of-play pieces to Available, or up to 6 ARVN out-of-play pieces to Available, or
  - add `ARVN Resources +9` and `Aid +9`, clamped to 75.
- Shaded must support:
  - move up to 3 Available US Troops out of play (partial execution when fewer than 3),
  - apply `Aid -9` with floor at 0.

### Card 27 (Phoenix Program)
- Unshaded:
  - remove up to 3 VC pieces total from COIN-control spaces.
  - removal must respect event invariants, including no forced removal of a Tunneled Base unless explicitly allowed.
- Shaded:
  - add Terror to up to 2 non-Saigon spaces that both have COIN Control and at least one VC piece.
  - then set each selected space to Active Opposition.
  - if fewer than 2 qualifying spaces exist, resolve as much as possible and trace the shortfall deterministically.

## Acceptance Criteria

- Event execution is deterministic and trace-visible including side chosen, branch chosen, targets, and partial-resolution reasons.
- Cards 82 and 27 are executable end-to-end in campaign play.
- Invalid event target selections return actionable diagnostics.
- Cards are represented as data without FITL-specific event branches in generic engine code.
- Event execution runs through the single path `GameSpecDoc` -> `GameDef` -> simulation.
- No runtime dependency on `data/fitl/...` for card loading/execution.

## Testing Requirements

- Unit tests for generic dual-use event semantics.
- Unit tests for generic partial-execution semantics (`execute what can`, deterministic skipped-step trace output).
- Unit tests for hard-invariant enforcement (stacking, bounds, tunneled-base constraint).
- Unit tests for free-operation eligibility/resource behavior and capability/momentum duration hooks.
- Card-level golden tests for both sides of card 82 and 27, including at least one constrained-state partial-resolution case per card.
- Integration test where one card fires inside normal eligible-faction sequence.

## Outcome

- Completion date: 2026-02-11.
- What changed:
  - Implemented the Spec 20 ticket chain (`FITLEVEFRAANDINICARPAC-000` through `FITLEVEFRAANDINICARPAC-007`) covering prerequisite audit, event-card data contracts, compiler lowering, dual-use/branch semantics, partial/lifecycle semantics, and initial-card-pack integration/regression.
  - Added embedded FITL initial card-pack YAML fixtures for cards 82 and 27 and deterministic compile/integration coverage for side/branch ordering and selector/cardinality constraints.
  - Added event-in-turn-flow deterministic golden regression (`fitl-events-initial-pack`) and aligned serialized trace JSON schema with runtime turn-flow trace/state contracts.
- Deviations from the original plan:
  - Runtime event execution remains modeled through generic `event` action params and effect/profile primitives rather than direct execution of `GameDef.eventCards` by card id.
  - Card id/title metadata remains validated and compiled in `eventCards`, while trace-visible runtime selection data is enforced via deterministic event move params plus turn-flow trace entries.
- Verification:
  - `npm run build` and `npm test` passed after final Spec 20 ticket completion updates.
