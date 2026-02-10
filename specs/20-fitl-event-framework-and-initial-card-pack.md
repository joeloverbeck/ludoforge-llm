# Spec 20: Fire in the Lake Event Framework and Initial Card Pack

**Status**: Draft
**Priority**: P1 (required for foundation deliverable)
**Complexity**: M
**Dependencies**: Spec 17, Spec 18, Spec 19
**Estimated effort**: 2-3 days
**Source sections**: rules 5.0-5.5, card appendix (Card 82 and Card 27)

## Overview

Implement foundation event execution semantics and encode the first two concrete cards from the brainstorming appendix as a pilot card pack.

## In Scope

- Event parser/loader format for FITL cards used by runtime.
- Dual-use selection (unshaded vs shaded).
- Event precedence and partial execution semantics.
- Lasting-effect hooks for capabilities/momentum (minimal infrastructure even if no lasting effect in first two cards).
- Card 82: Domino Theory (both sides).
- Card 27: Phoenix Program (both sides).

## Out of Scope

- Full deck transcription and balancing.

## Card-Specific Acceptance Rules

### Card 82 (Domino Theory)
- Unshaded must support either:
  - moving up to 3 US or 6 ARVN out-of-play pieces to available, or
  - ARVN Resources +9 and Aid +9 (with caps).
- Shaded must support:
  - move 3 Available US Troops out of play,
  - Aid -9 (floor at 0).

### Card 27 (Phoenix Program)
- Unshaded: remove any 3 VC pieces total from COIN-control spaces, respecting base removal constraints.
- Shaded: add Terror to any 2 qualifying non-Saigon spaces with COIN Control and VC, then set each to Active Opposition.

## Acceptance Criteria

- Event execution is deterministic and trace-visible including side chosen and targets.
- Cards 82 and 27 are executable end-to-end in campaign play.
- Invalid event target selections return actionable diagnostics.

## Testing Requirements

- Unit tests for generic dual-use event semantics.
- Card-level golden tests for both sides of card 82 and 27.
- Integration test where one card fires inside normal eligible-faction sequence.

