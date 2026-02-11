# FITLEVEFRAANDINICARPAC-001 - Event Card Data Contract and Validation

**Status**: Proposed  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: Spec 16-19 foundation implementation present

## Goal
Define and validate the generic `GameSpecDoc`/`GameDef` data contract for event cards so dual-use branches, deterministic ordering metadata, target cardinality, and lasting-effect declarations can be represented entirely in YAML.

## Scope
- Extend shared types/schemas for event-card declarations embedded in `dataAssets` payloads.
- Add parser/spec validation checks for malformed event-card structures.
- Add `GameDef` schema/runtime validation coverage for lowered event-card structures.
- Add diagnostics for:
  - missing unshaded/shaded payloads for dual-use cards,
  - ambiguous unordered effect sets,
  - invalid target cardinality definitions,
  - lasting-effect declarations with invalid duration windows.

## Implementation tasks
1. Add generic event-card type shapes to `src/cnl/game-spec-doc.ts` and corresponding runtime schema definitions.
2. Extend `src/cnl/validate-spec.ts` and `src/cnl/compiler-diagnostics.ts` with actionable diagnostics for invalid card/event definitions.
3. Extend `src/kernel/schemas.ts` and `schemas/GameDef.schema.json` to validate lowered event structures.
4. Add focused unit tests for positive and negative contract examples.

## File list it expects to touch
- `src/cnl/game-spec-doc.ts`
- `src/cnl/validate-spec.ts`
- `src/cnl/compiler-diagnostics.ts`
- `src/kernel/schemas.ts`
- `schemas/GameDef.schema.json`
- `test/unit/game-spec-doc.test.ts`
- `test/unit/validate-spec.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/json-schema.test.ts`

## Out of scope
- Compiler lowering behavior from event-card YAML into executable actions/effects.
- Runtime event resolution semantics.
- Card-specific FITL data authoring (Card 82 and Card 27 payloads).
- Any FITL-specific branch in kernel/compiler logic.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/game-spec-doc.test.js`
- `node --test dist/test/unit/validate-spec.test.js`
- `node --test dist/test/unit/schemas-top-level.test.js`
- `node --test dist/test/unit/json-schema.test.js`

### Invariants that must remain true
- Event-card schema/contracts remain generic and reusable across games.
- Event cards remain representable inside `GameSpecDoc` YAML data assets only (no required filesystem lookup).
- Diagnostics remain deterministic and include actionable path/suggestion details.
- No FITL-specific ids or map/card constants are introduced in shared schema/runtime validators.
