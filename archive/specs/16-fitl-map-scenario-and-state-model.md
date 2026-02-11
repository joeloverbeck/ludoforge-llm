# Spec 16: Fire in the Lake Map, Scenario, and State Model

**Status**: ✅ COMPLETED
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 15
**Estimated effort**: 3-4 days
**Source sections**: rules 1.3-1.9, 2.1, setup appendix in brainstorming doc
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Implement FITL data assets and runtime state representation: map spaces and adjacency, piece pools, markers/tracks, faction resources, initial scenario setup, and invariant validation.

Spec 16 is the owning spec for these Spec 15a P0 gaps: typed domain tracks/markers, piece state dimensions, and map dataset ingestion.

## In Scope

- Space taxonomy: Province, City, LoC, foreign-country spaces.
- Space attributes: Population, Econ, terrain tags, coastal flag, country tag.
- Adjacency graph representation (including provisional edges if needed, explicitly marked).
- Faction piece inventories and stacking constraints.
- State tracks and markers: Support/Opposition, Terror/Sabotage, Aid, Patronage, Resources, Trail, Casualties, sequence eligibility state representation.
- Foundation scenario loader (single canonical scenario slice from brainstorming setup).
- Canonical-vs-derived state policy and deterministic recomputation rules.

## Out of Scope

- Full scenario catalog and period setup variants.
- Non-player setup options.
- Turn flow/event/operation/coup execution semantics (Specs 17-20).

## Architecture Constraints (from Spec 15)

- Engine/runtime code must not branch on FITL identifiers (faction/card/space/marker names).
- FITL-specific behavior must be encoded in data assets plus generic compiler/runtime capabilities.
- Any schema/compiler/runtime additions introduced here must be reusable for non-FITL titles.
- Evolution pipeline inputs are YAML-only; all executable FITL data required by compile/runtime must be representable inside `GameSpecDoc` YAML.

## Data Model Requirements

- Map/scenario/piece-catalog data must be declared inside `GameSpecDoc` YAML (not filesystem-only runtime dependencies) so evolution can mutate full game state definitions.
- Do not require per-document `version` fields for embedded assets; YAML document identity is the version boundary for evolution.
- Embedded assets must still use stable `id` and typed `kind` so generic validators and diagnostics can stay deterministic.
- No runtime-derived adjacency inference.
- State serialization must preserve all victory-relevant and legality-relevant fields.
- Piece identities are not required per-cube, but counts and statuses must be lossless.
- Scenario definitions must include complete initial placement and pool counts such that total inventory conservation is checkable.
- Data-level ordering fields must exist wherever deterministic non-choice ordering is required.

## GameSpecDoc Embedded Asset Contract

- Add a generic `dataAssets` section to `GameSpecDoc`:
  - `id: string` (stable asset identifier within the YAML document)
  - `kind: "map" | "pieceCatalog" | "scenario"`
  - `payload: object` (kind-specific schema-validated payload)
- No required `version` property in `dataAssets` entries.
- `scenario` payload must reference `map` and `pieceCatalog` entries by `id`.

Example shape:

```yaml
dataAssets:
  - id: fitl-map-foundation
    kind: map
    payload: { ... }
  - id: fitl-piece-catalog-foundation
    kind: pieceCatalog
    payload: { ... }
  - id: fitl-scenario-foundation-westys-war
    kind: scenario
    payload:
      mapAssetId: fitl-map-foundation
      pieceCatalogAssetId: fitl-piece-catalog-foundation
      ...
```

- Existing `data/fitl/...` files are permitted as fixtures/reference artifacts, but compile/runtime correctness for evolved specs must not depend on filesystem asset lookups.

## Canonical Runtime State Contract

- Canonical state includes:
  - Per-space piece counts by faction/type/status.
  - Per-space political/marker state (support-opposition lattice state, terror/sabotage tags, control inputs).
  - Global tracks and per-faction resources/casualty/out-of-play pools required by foundation rules.
- Derived values (for example control and victory metrics) must be recomputable deterministically from canonical state and never drift as hidden incremental fields.
- If cached derived fields are stored for performance, runtime must recompute and assert equality in validation paths.

## Invariants

- No more than 2 total Bases in any City/Province.
- No Bases on LoCs.
- Only NVA/VC pieces in North Vietnam.
- Underground/Active status only applies to piece types that declare that status dimension in schema.
- Track/resource values must respect explicit declared bounds (no "implicit" defaults).
- No negative piece counts; no unknown faction/piece/status/space identifiers in scenario data.
- Piece inventory conservation must hold between map placements and faction pools.
- Adjacency graph must have no unknown endpoints, no self-loops, and deterministic neighbor ordering.

## Compiler and Runtime Changes

- Extend compiler ingestion to read embedded `dataAssets` entries from `GameSpecDoc` and lower them into deterministic `GameDef` references.
- Add generic schema conventions/validators for typed tracks, markers, and piece-status transition constraints required by Spec 15a.
- Add runtime state constructors for all declared tracks/markers/pools from compiled data.
- Add fail-fast validators at compile time and runtime load time for map/setup/state invariants.
- Diagnostics must include source location context (asset file + entity id) for invalid map or setup data.

## Deliverables

- FITL foundation map/pieceCatalog/scenario assets embedded in canonical GameSpec YAML fixtures.
- Compiler integration that consumes embedded assets without FITL-specific branching in generic compiler modules.
- Runtime state model and validator suite for invariants above.
- Deterministic snapshot fixture for initial scenario state.

## Acceptance Criteria

- Foundation scenario loads into a valid initial runtime state.
- All declared invariants are checked at compile time and runtime guardrails with actionable diagnostics.
- Deterministic snapshot tests confirm map and setup serialization stability.
- Derived recomputation (control/victory-relevant metrics) matches canonical-state projections across synthetic edits.
- Existing non-FITL game specs continue to compile and run unchanged after Spec 16 capabilities land.

## Testing Requirements

- Unit tests for map data validation and invariant violations.
- Golden test for initial state snapshot.
- Property test for control/support recomputation consistency after synthetic state edits.
- Negative compilation tests for malformed assets (unknown ids, invalid bounds, illegal status dimensions/transitions, inventory mismatch).
- Regression tests showing no FITL-specific branch requirements in generic state/compile modules.

## Outcome

- Completion date: 2026-02-11
- What was actually changed:
  - Landed FITL foundation data-asset schema support and validation for `map`, `pieceCatalog`, and `scenario`.
  - Added compiler ingestion of embedded `dataAssets` with deterministic diagnostics and scenario asset reference checks.
  - Added map adjacency/state model guardrails, piece status/inventory validations, and negative-fixture coverage.
  - Added deterministic FITL initial-state snapshot and serde roundtrip tests from YAML-embedded assets.
  - Preserved non-FITL compile/simulation paths with regression coverage in integration suites.
- Deviations from original plan:
  - Some broad acceptance bullets (for example expansive derived-metric recomputation/property breadth) were implemented incrementally across the FITLMAPSCEANDSTAMOD ticket series with focused deterministic/unit/integration checks rather than a single monolithic test artifact.
- Verification results:
  - `npm run test:unit` passed.
  - `npm run test:integration` passed.
