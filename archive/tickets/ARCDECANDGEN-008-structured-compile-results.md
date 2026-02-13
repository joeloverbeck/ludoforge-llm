# ARCDECANDGEN-008: Add `CompileSectionResults` to compiler output

**Status**: ✅ COMPLETED
**Phase**: 2A (Structured Compile Results)
**Priority**: P1
**Complexity**: M
**Dependencies**: ARCDECANDGEN-002

## Goal

Extend `compileGameSpecToGameDef` to return section-level compile outputs alongside `gameDef` and `diagnostics`, enabling partial compile visibility when only specific sections fail.

## Assumption Reassessment (2026-02-13)

The original ticket made assumptions that no longer match the current codebase.

### Confirmed discrepancies
- Compiler API currently returns `{ gameDef, diagnostics }` only.
- Current `GameDef` section names are `turnFlow`, `operationProfiles`, `coupPlan`, `victory`, and `eventCards` (not `turnOrder`, `actionPipelines`, `eventDecks`).
- `GameDef` also includes optional `scoring`, `stackingConstraints`, and `markerLattices`, but compiler-core does not lower these sections yet.
- Required-section behavior was fail-fast for missing `metadata`, `zones` (or data-asset-derived fallback), `turnStructure`, `actions`, and `endConditions`.
- Some semantic invalidity (for example malformed metadata values) is surfaced by `validateGameDef`, not by lowering; section-null semantics in this ticket are based on compiler-lowering/missing-section failures.
- Test-count assumptions were stale; acceptance was updated to relevant suites rather than fixed totals.

### Updated scope implemented
- Added `CompileResult` and `CompileSectionResults` types in `src/cnl/compiler-core.ts`.
- Updated `compileGameSpecToGameDef` to return `{ gameDef, sections, diagnostics }`.
- Populated `sections` incrementally; each section becomes `null` when section-scoped lowering emits errors.
- Preserved caller compatibility for existing consumers reading `result.gameDef` and `result.diagnostics`.
- Exported new types through existing CNL exports.
- Added focused unit tests for structured section results.

## File List (implemented)

### Files modified
- `src/cnl/compiler-core.ts`
- `src/cnl/compiler.ts`
- `test/unit/compiler-api.test.ts`

### Files added
- `test/unit/compiler-structured-results.test.ts`

## Out of Scope (unchanged)

- No changes to `lower*` function signatures
- No cross-reference validation pass (ARCDECANDGEN-010)
- No new diagnostic code taxonomy work (ARCDECANDGEN-009)
- No behavior changes in kernel/sim/agents
- No YAML schema format changes
- No lowering for `scoring`, `stackingConstraints`, or `markerLattices`

## Outcome

**Completed on**: 2026-02-13

**What changed vs. original plan**
- Implemented structured compile output on current architecture field names (`turnFlow`, `operationProfiles`, `coupPlan`, `victory`, `eventCards`) instead of outdated names.
- Kept public API backward compatibility by preserving `gameDef`/`diagnostics` while adding `sections`.
- Added static key-alignment test for the structured result contract and runtime tests for valid, partial-failure, and production-spec scenarios.

**Notable deviation from original ticket draft**
- The draft assumed full `GameDef` section parity including fields not currently lowered by compiler-core. Implementation intentionally scoped to currently lowered/produced sections.

**Verification**
- `npm run build` passed.
- `npm run test:unit -- --coverage=false` passed.
- `node --test dist/test/integration/compile-pipeline.test.js` passed.
- `npm test` passed.
