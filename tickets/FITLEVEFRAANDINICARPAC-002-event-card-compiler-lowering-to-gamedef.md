# FITLEVEFRAANDINICARPAC-002 - Event Card Compiler Lowering to GameDef

**Status**: Proposed  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-001`

## Goal
Lower validated event-card declarations from `GameSpecDoc` YAML into generic executable `GameDef` structures while preserving deterministic branch/effect order and target selection metadata.

## Scope
- Extend compiler lowering pipeline to transform event-card data assets into executable structures consumed by kernel action execution.
- Enforce compile-time rejection of structurally valid but semantically nondeterministic event definitions.
- Emit source-mapped diagnostics for invalid lowering cases.
- Ensure event cards compile via the canonical path `GameSpecDoc` -> compiler -> `GameDef`.

## Implementation tasks
1. Add lowerer utilities in `src/cnl/compiler.ts` for event-card payload extraction and conversion.
2. Reuse existing effect/selector lowering primitives; avoid parallel FITL-only lowering paths.
3. Add deterministic ordering enforcement for branch/effect arrays during lowering.
4. Add fixture-driven compile tests covering successful and rejected card definitions.

## File list it expects to touch
- `src/cnl/compiler.ts`
- `src/cnl/compile-effects.ts`
- `src/cnl/source-map.ts`
- `test/fixtures/cnl/compiler/compile-fitl-events-valid.md` (new)
- `test/fixtures/cnl/compiler/compile-fitl-events-invalid.md` (new)
- `test/unit/compiler-api.test.ts`
- `test/unit/compiler.golden.test.ts`
- `test/integration/compile-pipeline.test.ts`

## Out of scope
- Runtime event execution behavior (side choice, branch resolution, partial execution).
- Eligibility mutation semantics from event execution.
- Any direct card 82/27 behavior assertions beyond compile-time structure.
- Deck/card lifecycle sequencing changes.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compiler-api.test.js`
- `node --test dist/test/unit/compiler.golden.test.js`
- `node --test dist/test/integration/compile-pipeline.test.js`

### Invariants that must remain true
- Compiler lowering remains generic and data-driven with no FITL-specific branch keyed by card/faction/map id.
- Lowered event ordering is deterministic and stable across repeated compilations.
- Source-map diagnostics point to the originating YAML locations for event-card errors.
- Existing non-event compile behavior remains unchanged.

