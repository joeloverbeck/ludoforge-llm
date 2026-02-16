# TEXHOLKERPRIGAMTOU-017: Selector Parity for Macros and Dynamic Zone Queries

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-016
**Blocks**: TEXHOLKERPRIGAMTOU-018, TEXHOLKERPRIGAMTOU-020

## 1) What must change / be implemented

Close remaining selector expressiveness gaps so GameSpecDoc can model dynamic card/board logic without engine special cases.

### Reassessed assumptions (current code reality)

1. `ZoneRef` (`string | { zoneExpr: ValueExpr }`) already exists and is already used by effect surfaces.
2. Query surfaces are not yet parity-complete: `tokensInZone.zone` is still string-only in AST types, schema, lowering, runtime, and behavior validation.
3. Macro arg constraint checking is not parity-complete with canonical selector contracts:
- `playerSelector` currently accepts only string args in macro constraints (canonical player selector contract also allows object forms).
- `zoneSelector` currently accepts only string args in macro constraints (canonical runtime-capable zone selector contract is `ZoneRef`).
4. `compile-effects.ts` already supports `ZoneRef`; this ticket should not change effect-zone lowering unless a failing test requires it.

1. Extend macro param constraint checking so `playerSelector` and `zoneSelector` accept canonical selector object forms.
2. Add canonical dynamic-zone query support for token queries by allowing `tokensInZone.zone` to accept `ZoneRef` (string or `{ zoneExpr }`).
3. Keep a single canonical representation; do not add alias syntax or parallel query variants.
4. Ensure lowering/validation/runtime all agree on the same selector/query contract.
5. Update:
- `src/cnl/expand-effect-macros.ts`
- `src/cnl/compile-conditions.ts` (query lowering)
- `src/kernel/types-ast.ts`
- `src/kernel/schemas-ast.ts`
- `src/kernel/eval-query.ts`
- `src/kernel/validate-gamedef-behavior.ts`
- relevant tests under `test/unit/`
- related schema artifacts only if generated outputs change
6. Keep this generic for any game; no poker-specific branches.
7. No alias syntaxes; exactly one canonical representation.

### Scope guardrails

1. Do not introduce a second dynamic token query kind; extend the existing canonical `tokensInZone` contract.
2. Do not broaden this ticket into non-token query redesign (`adjacentZones`, `connectedZones`, etc.) unless a required parity break is discovered.
3. Prefer surgical edits over broad refactors; avoid rewriting entire files.

## 2) Invariants that should pass

1. Macro selector constraints and effect/query selector capabilities are contract-compatible.
2. Dynamic zone token queries evaluate deterministically.
3. Invalid selector/query shapes produce structured diagnostics with stable paths.
4. Existing static-zone queries keep identical behavior.
5. Engine remains game-agnostic.

## 3) Tests that should pass

1. Unit: macro arg constraint accepts canonical `playerSelector` object forms and `ZoneRef` object forms for `zoneSelector`; rejects malformed shapes.
2. Unit: compiler lowers `tokensInZone.zone` as canonical `ZoneRef` (string or `{ zoneExpr }`) with stable diagnostics for invalid forms.
3. Unit: runtime evaluates `tokensInZone` with dynamic `{ zoneExpr }` deterministically.
4. Unit: behavior validation validates `tokensInZone.zone` via `ZoneRef` contract (including nested `zoneExpr` ValueExpr validation).
5. Unit: AST schema accepts canonical `tokensInZone.zone` `ZoneRef` object form and rejects malformed forms.
6. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16
- What was changed:
- Implemented canonical `ZoneRef` support for `tokensInZone.zone` across AST types, schema, compiler lowering, runtime query evaluation, and behavior validation.
- Extended effect-macro arg constraint parity so `playerSelector` accepts canonical object forms and `zoneSelector` accepts canonical `ZoneRef` object form.
- Added/updated unit coverage for compiler lowering, runtime behavior, schema contract, macro constraint behavior, and GameDef validation for dynamic token-zone queries.
- Updated production Fire in the Lake macro data to emit canonical `tokensInZone.zone: { zoneExpr: ... }` instead of non-canonical raw value-expr object.
- Updated integration assertions that were pinned to pre-canonicalized static string zones.
- Regenerated schema artifacts after schema contract changes.
- Deviations from original plan:
- `src/cnl/compile-effects.ts` did not require changes after reassessment because effect-side `ZoneRef` support already existed.
- In addition to the originally listed files, a targeted data/macro fixture update was required to align production specs with the new canonical query zone contract.
- Verification results:
- `npm run build`: pass
- Targeted unit tests for touched areas: pass
- `npm test`: pass
- `npm run lint`: pass
