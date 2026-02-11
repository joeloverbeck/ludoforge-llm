# FITLEVEFRAANDINICARPAC-002 - Event Card Compiler Lowering to GameDef

**Status**: ✅ COMPLETED  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-001`

## Goal
Lower validated event-card declarations from `GameSpecDoc` YAML into generic `GameDef` data so runtime tickets can consume event definitions through the canonical compile path, with deterministic ordering guarantees and actionable compiler diagnostics.

## Reassessed assumptions (2026-02-11)
- Event-card payload schema validation already exists in shared kernel asset validation (`validateDataAssetEnvelope` / `EventCardSetPayloadSchema`) from ticket 001; this ticket must reuse that path rather than duplicate validation rules.
- Compiler currently accepts `eventCardSet` as an asset kind but does not lower cards into `GameDef`; event-card assets are effectively dropped after validation.
- `GameDef` currently has no event-card field, so this ticket must introduce a generic optional field (non-breaking) to carry lowered event-card definitions.
- Existing fixture/tests referenced in this ticket (`compile-fitl-events-valid.md`, `compile-fitl-events-invalid.md`) do not exist yet; coverage should be added via current compiler pipeline tests/fixtures in `test/integration/compile-pipeline.test.ts`.

## Scope
- Extend compiler lowering pipeline to transform embedded `eventCardSet` assets into a generic `GameDef` event-card section.
- Preserve deterministic ordering for lowered card/branch collections and reject ambiguous ordering declarations at compile time.
- Emit source-mapped diagnostics for invalid lowering cases (for example ambiguous ordering or conflicting event-card-set selection).
- Ensure event cards lower through the canonical path `GameSpecDoc` -> compiler -> `GameDef` with no required filesystem fixture dependency.

## Implementation tasks
1. Extend `GameDef` contracts/schemas with an optional generic event-card collection field.
2. Add compiler lowering in `src/cnl/compiler.ts` to extract validated `eventCardSet` payloads from `doc.dataAssets` and include them in `GameDef`.
3. Add deterministic ordering enforcement and compiler diagnostics for semantically ambiguous event-card ordering cases.
4. Add compile pipeline tests covering successful lowering and rejected ambiguous definitions.

## File list it expects to touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/cnl/compiler.ts`
- `test/integration/compile-pipeline.test.ts`

## Out of scope
- Runtime event execution behavior (side choice, branch resolution, partial execution).
- Eligibility mutation semantics from event execution.
- Card 82/27 execution semantics beyond compile-time data lowering.
- Deck/card lifecycle sequencing changes.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `node --test dist/test/unit/compiler.golden.test.js`

### Invariants that must remain true
- Compiler lowering remains generic and data-driven with no FITL-specific branch keyed by card/faction/map id.
- Lowered event-card ordering is deterministic and stable across repeated compilations.
- Source-map diagnostics point to originating YAML locations for event-card lowering errors.
- Existing non-event compile behavior remains unchanged.

## Outcome
- Completion date: 2026-02-11.
- Implemented: added non-breaking `GameDef.eventCards` support in shared kernel types/schemas and JSON schema artifact (`src/kernel/types.ts`, `src/kernel/schemas.ts`, `schemas/GameDef.schema.json`).
- Implemented: extended compiler data-asset lowering to carry validated `eventCardSet` cards into `GameDef`, with deterministic card/branch ordering and compile-time diagnostics for duplicate ids/ambiguous order declarations (`src/cnl/compiler.ts`).
- Implemented: added compile pipeline coverage for successful event-card lowering and deterministic-order rejection (`test/integration/compile-pipeline.test.ts`).
- Deviation from original plan: did not add new fixture markdown files (`compile-fitl-events-valid.md` / `compile-fitl-events-invalid.md`); used existing integration test style with inline YAML to keep changes minimal and focused.
- Verification: `npm run build`, targeted suites (`node --test dist/test/integration/compile-pipeline.test.js`, `node --test dist/test/unit/compiler.golden.test.js`), and full `npm test` all passed.
