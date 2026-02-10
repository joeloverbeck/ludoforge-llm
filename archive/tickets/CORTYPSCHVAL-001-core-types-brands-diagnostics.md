# CORTYPSCHVAL-001 - Core Type Foundations (Brands, Diagnostics, Runtime Shell Types)

**Status**: ✅ COMPLETED

## Goal
Create the foundational type layer required by Spec 02: branded identifiers, diagnostic primitives, degeneracy flags, runtime shell interfaces, and kernel exports that later tickets build on.

## Assumptions Reassessed (2026-02-10)
- `src/kernel/index.ts` is currently a placeholder (`export {}`) and no core type files exist yet.
- `test/unit/` currently contains only `smoke.test.ts`; `types-foundation.test.ts` does not exist yet.
- The ticket therefore must include creation (not just modification) of the listed kernel foundation files and the new unit test file.
- Compile-time brand separation checks will be implemented via TypeScript `@ts-expect-error` assertions inside the unit test file so they fail compilation if the brands become assignable.

## Updated Scope
- Create `src/kernel/branded.ts`, `src/kernel/diagnostics.ts`, `src/kernel/types.ts`.
- Update `src/kernel/index.ts` to re-export this foundational API.
- Add `test/unit/types-foundation.test.ts` for compile-time and runtime checks.
- Keep implementation limited to the Spec 02 foundation subset in this ticket; no schema/validator/AST/runtime logic beyond shell types.

## File List Expected To Touch
- `src/kernel/branded.ts`
- `src/kernel/diagnostics.ts`
- `src/kernel/types.ts`
- `src/kernel/index.ts`
- `test/unit/types-foundation.test.ts`

## Implementation Notes
- Define branded IDs exactly: `PlayerId`, `ZoneId`, `TokenId`, `ActionId`, `PhaseId`, `TriggerId`.
- Add minimally necessary constructors/guards for brands (no runtime coercion magic).
- Define `Diagnostic` and `DegeneracyFlag` exactly per spec.
- Add runtime shell types that do not depend on AST details yet (`RngState`, `ActionUsageRecord`, `PlayerScore`, `TerminalResult`, `BehaviorCharacterization`).
- Re-export public types from `src/kernel/index.ts`.

## Out Of Scope
- Full `GameDef`/`GameState` shape.
- AST unions (`ConditionAST`, `ValueExpr`, `EffectAST`, `OptionsQuery`).
- Any Zod schema work.
- Any semantic validation logic.
- JSON schema generation.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/types-foundation.test.ts`:
  - compile-time assertion that `PlayerId` is not assignable to `ZoneId`.
  - compile-time assertion that `TokenId` is not assignable to `PlayerId`.
  - runtime assertion that `DegeneracyFlag` has exactly 6 values and exact string values.
  - runtime assertion that a `Diagnostic` sample object includes non-empty `code`, `path`, `message`.
- Existing smoke tests continue passing (`test/unit/smoke.test.ts`).

### Invariants That Must Remain True
- Branded ID types prevent accidental mixing at compile-time.
- `DegeneracyFlag` exact values: `LOOP_DETECTED`, `NO_LEGAL_MOVES`, `DOMINANT_ACTION`, `TRIVIAL_WIN`, `STALL`, `TRIGGER_DEPTH_EXCEEDED`.
- `Diagnostic` has `code`, `path`, `severity`, `message` as required fields.

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Added foundational kernel modules: `src/kernel/branded.ts`, `src/kernel/diagnostics.ts`, `src/kernel/types.ts`.
  - Updated `src/kernel/index.ts` to re-export branded IDs, diagnostics, and runtime shell types.
  - Added `test/unit/types-foundation.test.ts` with compile-time brand separation checks (`@ts-expect-error`) and runtime invariants for `DegeneracyFlag` and `Diagnostic`.
- Deviations from original plan:
  - No behavioral deviations; scope was corrected to explicitly include file creation because the scaffold did not already contain those files.
- Verification:
  - `npm test` passed (build + unit test suite), including `smoke.test` and the new `types-foundation.test`.
