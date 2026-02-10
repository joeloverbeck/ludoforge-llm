# Spec 16: Fire in the Lake Map, Scenario, and State Model

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 15
**Estimated effort**: 3-4 days
**Source sections**: rules 1.3-1.9, 2.1, setup appendix in brainstorming doc

## Overview

Implement FITL data assets and runtime state representation: map spaces and adjacency, piece pools, markers/tracks, faction resources, initial scenario setup, and invariant validation.

## In Scope

- Space taxonomy: Province, City, LoC, foreign-country spaces.
- Space attributes: Population, Econ, terrain tags, coastal flag, country tag.
- Adjacency graph representation (including provisional edges if needed, explicitly marked).
- Faction piece inventories and stacking constraints.
- State tracks: Support/Opposition, Control, Aid, Patronage, Resources, Trail, Casualties, sequence eligibility.
- Foundation scenario loader (single canonical scenario slice from brainstorming setup).

## Out of Scope

- Full scenario catalog and period setup variants.
- Non-player setup options.

## Data Model Requirements

- Map data must be declared in versioned source data files under `src/.../fitl/`.
- No runtime-derived adjacency inference.
- State serialization must preserve all victory-relevant and legality-relevant fields.
- Piece identities are not required per-cube, but counts and statuses must be lossless.

## Invariants

- No more than 2 total Bases in any City/Province.
- No Bases on LoCs.
- Only NVA/VC pieces in North Vietnam.
- Underground/Active state only applies to Guerrillas and Special Forces.
- Track values constrained to rule bounds (usually 0-75, Trail bounded by track).

## Compiler and Runtime Changes

- Extend compilation pipeline to ingest FITL map/scenario assets into `GameDef` references.
- Add runtime state constructors for all FITL tracks.
- Add validators that fail fast on invalid map/setup data.

## Acceptance Criteria

- Foundation scenario loads into a valid initial runtime state.
- All declared invariants are checked at compile time and runtime guardrails.
- Deterministic snapshot tests confirm map and setup serialization stability.

## Testing Requirements

- Unit tests for map data validation and invariant violations.
- Golden test for initial state snapshot.
- Property test for control/support recomputation consistency after synthetic state edits.

