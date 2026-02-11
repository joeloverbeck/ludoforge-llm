# Spec 18: Fire in the Lake Operations and Special Activities

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: XL
**Dependencies**: Spec 15, Spec 16, Spec 17
**Estimated effort**: 5-7 days
**Source sections**: rules 3.0-4.5
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Implement faction Operations and Special Activities for US, ARVN, NVA, and VC, including costs, targeting constraints, movement/removal semantics, terrain modifiers, tunnel rules, and side effects on tracks, using generic data-driven operation primitives.

## In Scope

- COIN Operations: Train, Patrol, Sweep, Assault.
- Insurgent Operations: Rally, March, Attack, Terror.
- US Special Activities: Advise, Air Lift, Air Strike.
- ARVN Special Activities: Govern, Transport, Raid.
- NVA Special Activities: Infiltrate, Bombard, Ambush.
- VC Special Activities: Tax, Subvert, Ambush.
- Free-operation interaction rules where relevant.

## Out of Scope

- Non-player operation priorities (section 8 flowcharts).

## Semantics and Ordering Rules

- Every operation must have a deterministic space processing order.
- Every multi-target removal must have deterministic tie-break rules if player choice is absent.
- Resource spend validation must fail before partial execution unless rule text explicitly supports partial execution.
- Tunnel/base removal logic must follow explicit rule sequence, including die-roll gates.

## Runtime Capability Requirements

- Extend generic operation/effect primitives so operation legality, costs, targets, and sequencing are data-configurable.
- Add seed-driven die-roll integration for probabilistic resolution semantics used by FITL operations.
- New primitives added here must be reusable and named independent of FITL concepts.
- Do not implement FITL rules as hardcoded operation handlers in core runtime modules.

## Acceptance Criteria

- All 16 operation/special-activity families execute with rule-correct state transitions.
- Cost accounting matches rules and is trace-visible.
- Illegal operation attempts produce diagnostics tied to faction/rule reason.
- Same seed plus same choices yields byte-equivalent trace deltas.
- Operation behavior is primarily declared in FITL game data, with engine code limited to generic reusable primitives.

## Testing Requirements

- Unit tests per operation and special activity family.
- Edge-case tests: Monsoon restrictions, Highland math, Bases-last removal, Tunnel removal behavior.
- Integration tests for Op + Special Activity sequencing and limited-operation constraints.
