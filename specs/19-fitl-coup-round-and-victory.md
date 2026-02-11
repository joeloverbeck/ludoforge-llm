# Spec 19: Fire in the Lake Coup Round and Victory

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 16, Spec 17, Spec 18
**Estimated effort**: 3-4 days
**Source sections**: rules 6.0-7.x references in brainstorming text, 1.6-1.9
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Implement Coup-round phase handling and victory computation for foundation play, including resource/support updates, trail effects, casualties/aid adjustments, and final-coup termination.

## In Scope

- Coup round phase sequence.
- Resource phase effects: sabotage, trail degradation, ARVN earnings, insurgent earnings, casualties-to-aid penalty.
- Support phase pacification and agitation interactions as included in foundation rules.
- Victory checks at coup and final-coup end conditions.
- Score-track recomputation from canonical state (support, opposition, control, bases, patronage, available US pieces).

## Out of Scope

- Optional deception marker and non-player specific victory exceptions unless required by selected mode.

## Requirements

- Phase order must be explicit and immutable.
- Victory checks must be callable both at interim coup checks and final game-end scoring.
- All derived tracks must be recomputed deterministically from base state, not incrementally drifted without audit.
- Coup/victory semantics must be compiled from `GameSpecDoc` YAML into `GameDef`; no required runtime dependency on `data/fitl/...` files.
- FITL-specific coup math should be expressed as reusable track/aggregation primitives with FITL values in YAML data.

## Acceptance Criteria

- Coup round executes all foundation phases in rule order with correct caps and floors.
- Victory margins for each faction are reproducible from state snapshots.
- Final Coup terminates game and emits complete rank/condition metadata.
- Coup/victory flow executes via the single path `GameSpecDoc` -> `GameDef` -> simulation.

## Testing Requirements

- Unit tests for each coup phase.
- Golden tests for end-of-campaign and final-coup scoring.
- Regression tests for track caps (0/75) and trail bounds.
