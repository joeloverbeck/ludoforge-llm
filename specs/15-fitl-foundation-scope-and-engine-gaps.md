# Spec 15: Fire in the Lake Foundation Scope and Engine Gaps

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: M
**Dependencies**: Spec 06, Spec 08b, Spec 10, Spec 12
**Estimated effort**: 1-2 days
**Source sections**: brainstorming FITL foundation intro, rules 1.0-6.3, two-card appendix

## Overview

Define the exact implementation boundary for the Fire in the Lake foundation and enumerate required `GameSpecDoc`/`GameDef`/runtime gaps before game-content implementation starts. This spec is the contract that prevents ad hoc hacks while enabling targeted engine evolution.

## In Scope

- Foundation-only FITL slice: setup, map/state model, turn flow, operations, special activities, coup flow, victory checks, and two cards (82 and 27).
- Deterministic rule interpretation for ambiguous transcription areas.
- Explicit list of schema/compiler/runtime extensions required for FITL expression.
- Backward compatibility for existing games/specs in this repo.

## Out of Scope

- Full 130-card deck.
- Section 8 non-player flowchart AI.
- Optional advanced modules outside foundation loop.

## Required Gap Analysis Deliverables

1. `GameSpecDoc` expressiveness matrix mapping each required FITL mechanic to current fields.
2. Compiler lowering matrix showing how each mechanic becomes `GameDef` actions/triggers/effects.
3. Runtime support matrix listing any new evaluator or effect semantics.
4. Determinism checklist for all random branches (die rolls, tie-breakers, ordering).

## Expected Gaps to Resolve

- Multi-track domain model: Support/Opposition, Control, Resources, Aid, Patronage, Trail, Eligibility.
- Piece-state modeling for Underground/Active and Tunneled Base behavior.
- Event-card lifecycle state with one-card lookahead and Monsoon constraints.
- Rule precedence and “execute as much as possible” semantics for events.
- Operation templates with faction-specific costs and constraints.

## Acceptance Criteria

- A reviewed fit-gap table exists in `specs/` and is referenced by every FITL implementation spec.
- For every identified gap, there is either:
  - a no-change proof (already representable), or
  - a concrete schema/runtime change proposal with tests.
- No FITL content implementation starts until each P0 gap is assigned to a dependent spec.

## Testing Requirements

- Add unit tests validating each new schema field and compiler diagnostic path introduced by this spec.
- Add deterministic ordering tests for any new query/effect semantics.

