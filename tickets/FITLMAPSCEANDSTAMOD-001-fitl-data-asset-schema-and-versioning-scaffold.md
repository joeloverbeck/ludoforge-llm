# FITLMAPSCEANDSTAMOD-001 - FITL Data Asset Schema and Versioning Scaffold

**Status**: Proposed
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/22-fitl-foundation-implementation-order.md`, `brainstorming/implement-fire-in-the-lake-foundation.md`
**Depends on**: Spec 15 Gate 0 acceptance

## Goal
Establish the generic, reusable asset-loading scaffold and schema contracts for versioned map/scenario data under `data/`, without encoding FITL setup content yet.

## Scope
- Add a generic data-asset directory convention and loader entrypoint that can ingest versioned JSON/YAML assets.
- Define schema contracts for map/scenario asset envelopes (id, version, kind, payload).
- Add compiler diagnostics shape for asset-file + entity-id error reporting.
- Keep implementation game-agnostic so non-FITL titles can adopt the same pipeline.

## File List Expected To Touch
- `src/cnl/compiler.ts`
- `src/cnl/compiler-diagnostics.ts`
- `src/kernel/schemas.ts`
- `src/kernel/types.ts`
- `schemas/GameDef.schema.json`
- `test/unit/compiler-diagnostics.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/integration/compile-pipeline.test.ts`
- `data/fitl/README.md` (new)

## Out Of Scope
- No concrete FITL map spaces or adjacency data.
- No scenario piece placements.
- No runtime invariant enforcement logic.
- No turn sequence, operations, events, coup, or victory behavior.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/schemas-top-level.test.ts`
  - parses valid asset envelope references in compiled output.
  - rejects unknown asset kind/version with source-aware diagnostics.
- `test/unit/compiler-diagnostics.test.ts`
  - emits diagnostics including `assetPath` and `entityId` fields.
- `test/integration/compile-pipeline.test.ts`
  - compiling existing non-FITL fixtures still succeeds unchanged.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Engine/compiler code must not branch on FITL identifiers.
- Existing `GameSpecDoc` compilation behavior remains deterministic for non-FITL fixtures.
- Asset schema versioning is explicit; no implicit default versions.
