# FITLMAPSCEANDSTAMOD-001 - FITL Data Asset Schema and Versioning Scaffold

**Status**: ✅ COMPLETED
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/22-fitl-foundation-implementation-order.md`, `brainstorming/implement-fire-in-the-lake-foundation.md`
**Depends on**: Spec 15 Gate 0 acceptance

## Goal
Establish the generic, reusable asset-loading scaffold and schema contracts for versioned map/scenario data under `data/`, without encoding FITL setup content yet.

## Assumptions Reassessed
- `GameSpecDoc` and the current CNL parser/compiler do not yet have asset-reference sections, so this ticket cannot validate compiled asset references without introducing a broader compiler-surface change.
- The repository currently has no `data/` directory scaffold and no reusable data-asset loader utility.
- `Diagnostic` does not currently carry optional `assetPath` / `entityId` context fields.

## Scope (Revised)
- Add a generic data-asset directory convention and loader entrypoint that ingests versioned JSON/YAML asset envelopes.
- Define reusable schema/type contracts for map/scenario asset envelopes (`id`, `version`, `kind`, `payload`) without introducing FITL content payload semantics.
- Extend diagnostics shape with optional `assetPath` and `entityId` context fields for asset-validation failures.
- Keep implementation game-agnostic so non-FITL titles can adopt the same loading and validation path.

## File List Expected To Touch
- `src/kernel/diagnostics.ts`
- `src/kernel/schemas.ts`
- `src/kernel/types.ts`
- `src/kernel/index.ts`
- `src/kernel/data-assets.ts` (new)
- `schemas/DataAssetEnvelope.schema.json` (new)
- `test/unit/compiler-diagnostics.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/data-assets.test.ts` (new)
- `test/unit/json-schema.test.ts`
- `data/fitl/README.md` (new)

## Out Of Scope
- No concrete FITL map spaces or adjacency data.
- No scenario piece placements.
- No runtime invariant enforcement logic.
- No turn sequence, operations, events, coup, or victory behavior.
- No CNL parser section additions or compiler lowering of asset references in this ticket.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/schemas-top-level.test.ts`
  - parses valid map/scenario data-asset envelopes.
  - rejects unsupported asset envelope kinds.
- `test/unit/data-assets.test.ts`
  - loads valid JSON and YAML envelopes deterministically.
  - reports schema/version/kind failures with `assetPath` + `entityId` context when available.
- `test/unit/compiler-diagnostics.test.ts`
  - diagnostic helper behavior remains deterministic with optional asset context fields present.
- `test/unit/json-schema.test.ts`
  - `schemas/DataAssetEnvelope.schema.json` validates known-good envelope examples.
- `test/integration/compile-pipeline.test.ts`
  - compiling existing non-FITL fixtures still succeeds unchanged.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Engine/compiler code must not branch on FITL identifiers.
- Existing `GameSpecDoc` compilation behavior remains deterministic for non-FITL fixtures.
- Asset schema versioning is explicit; no implicit default versions.

## Outcome
- Completed on 2026-02-11.
- Implemented generic data-asset scaffold pieces:
  - Added reusable envelope types/schemas (`map`/`scenario`, explicit `version`, generic `payload`).
  - Added a generic JSON/YAML asset loader entrypoint with deterministic diagnostics and optional expected kind/version enforcement.
  - Added optional diagnostic context fields `assetPath` and `entityId`.
  - Added `data/fitl/README.md` to define asset directory/versioning conventions.
- Added/updated tests for loader behavior, schema validation, and diagnostic dedupe behavior with asset context.
- Deviation from original plan:
  - Did not add parser/compiler-level asset-reference lowering in this ticket because current `GameSpecDoc` and CNL section model do not yet include asset-reference sections; scope was explicitly narrowed to scaffold contracts and loading primitives first.
- Verification:
  - `npm run build`
  - `npm run test:unit -- --coverage=false`
