# FITLEVEFRAANDINICARPAC-001 - Event Card Data Contract and Validation

**Status**: ✅ COMPLETED  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: Spec 16-19 foundation implementation present

## Goal
Define and validate the generic `GameSpecDoc` data contract for event-card declarations embedded in `dataAssets` so dual-use branches, deterministic ordering metadata, target cardinality, and lasting-effect duration windows can be represented entirely in YAML.

## Reassessed assumptions (2026-02-11)
- `validate-spec` already delegates data-asset envelope checks to `src/kernel/data-assets.ts` via `validateDataAssetEnvelope`; this ticket should extend that shared path, not add parallel validation logic.
- `src/cnl/compiler-diagnostics.ts` is not part of event-card contract validation in the current architecture.
- `GameDef` does not currently carry `dataAssets`; therefore `schemas/GameDef.schema.json` is out of scope for this ticket and should be handled in lowering/runtime tickets if needed.
- Data-asset kinds were limited to `map|scenario|pieceCatalog`; this ticket needed to extend shared `DataAssetKind`/schema contracts so event-card assets are accepted generically.

## Scope
- Extend shared data-asset kind/type/schema contracts to include a generic event-card asset envelope kind.
- Define generic runtime schema shapes for event-card payload declarations (card identity, dual-use sides, ordered effects/branches, target cardinality, and lasting effects).
- Validate embedded event-card assets through the existing `validateDataAssetEnvelope` path used by `validate-spec` and compiler ingestion.
- Add diagnostics coverage for malformed event-card structures, including:
  - missing required side payloads for dual-use cards,
  - missing ordered branch/effect arrays where deterministic order is required,
  - invalid target cardinality declarations,
  - lasting-effect duration values outside supported windows.

## Implementation tasks
1. Add generic event-card contract types and shared schema definitions in kernel type/schema modules.
2. Extend data-asset validation to validate event-card payloads for the new kind.
3. Update CNL validation/compiler data-asset kind allowlists to accept event-card assets without changing lowering semantics.
4. Add focused unit tests for valid and invalid event-card contracts.

## File list it expects to touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/data-assets.ts`
- `src/cnl/validate-spec.ts`
- `src/cnl/compiler.ts`
- `test/unit/data-assets.test.ts`
- `test/unit/validate-spec.test.ts`
- `test/unit/schemas-top-level.test.ts`

## Out of scope
- Compiler lowering behavior from event-card YAML into executable actions/effects.
- Runtime event resolution semantics.
- Card-specific FITL data authoring (Card 82 and Card 27 payloads).
- Any FITL-specific branch in kernel/compiler logic.
- Changes to `schemas/GameDef.schema.json` unless `GameDef` itself is extended in a later ticket.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/data-assets.test.js`
- `node --test dist/test/unit/validate-spec.test.js`
- `node --test dist/test/unit/schemas-top-level.test.js`

### Invariants that must remain true
- Event-card schema/contracts remain generic and reusable across games.
- Event cards remain representable inside `GameSpecDoc` YAML data assets only (no required filesystem lookup).
- Diagnostics remain deterministic and include actionable path/suggestion details.
- No FITL-specific ids or map/card constants are introduced in shared schema/runtime validators.

## Outcome
- Completion date: 2026-02-11.
- Implemented: added generic `eventCardSet` data-asset kind and shared event-card payload contracts in `src/kernel/types.ts` and `src/kernel/schemas.ts`.
- Implemented: wired payload validation through `src/kernel/data-assets.ts` and allowlisted the new kind in `src/cnl/validate-spec.ts` and `src/cnl/compiler.ts`.
- Implemented: added contract coverage in `test/unit/data-assets.test.ts`, `test/unit/validate-spec.test.ts`, and `test/unit/schemas-top-level.test.ts`.
- Deviation from original plan: did not change `src/cnl/compiler-diagnostics.ts` or `schemas/GameDef.schema.json` because current architecture validates data-asset contracts in shared kernel modules and `GameDef` does not include `dataAssets` yet.
- Verification: `npm run build`, targeted unit suites (`data-assets`, `validate-spec`, `schemas-top-level`), and full `npm test` all passed.
