# Spec 17: Fire in the Lake Turn Sequence, Eligibility, and Card Flow

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 15, Spec 16
**Estimated effort**: 3-4 days
**Source sections**: rules 2.0-2.4, 5.0-5.5
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Implement FITL campaign turn flow as declarative game data interpreted by generic turn/card engine primitives: reveal/play sequencing, eligibility transitions, passing, limited operations, first/second eligible option matrix, monsoon constraints, pivotal-event hooks, and card-state transitions.

## In Scope

- One-card lookahead deck flow.
- Eligible/Ineligible state transitions.
- Passing resource effects.
- First/second eligible execution options.
- Limited Operation constraints.
- Monsoon modifiers when Coup is next.
- Coup card entry into leader slot and campaign boundary handling.

## Out of Scope

- Full pivotal-event card implementation (hook points only in foundation unless required by selected scenario).

## Behavioral Requirements

- Faction order must be deterministic and strictly card-driven.
- Passing must preserve eligibility for the next card and apply exact faction rewards.
- Event-based eligibility overrides must persist for exactly one next-card window unless card text says otherwise.
- "Execute as much as possible" must be represented as deterministic partial-execution behavior.

## Engine Integration

- Extend generic turn-sequencing primitives to express FITL card/eligibility sequencing through data.
- Keep move legality enumeration deterministic under all option branches.
- Ensure trace records include: card id, first/second eligible, action class (Pass/Event/Op/Limited Op/Op+SA).
- Do not introduce FITL-only coordinator code paths in generic runtime modules.
- All turn/card flow inputs must come from `GameSpecDoc` YAML compiled into `GameDef`; no required direct reads from `data/fitl/...` at runtime.
- Decompose FITL turn rules into reusable sequencing/lifecycle primitives, then encode FITL-specific tables/windows as YAML data.

## Acceptance Criteria

- Deterministic replay of campaign flow across same seed and move sequence.
- Tests cover all first/second eligible option permutations.
- Monsoon restrictions are enforced and trace-visible.
- Turn sequencing behavior is configured through game data, not FITL-specific engine branching.
- Turn sequencing executes through the single path `GameSpecDoc` -> `GameDef` -> simulation.

## Testing Requirements

- Unit tests for eligibility transition table.
- Integration tests for pass chains and left-to-right replacement behavior.
- Golden trace test for a short scripted card sequence including one Coup boundary.
