# GAMSPECOM-004 - Macro Expansion: refillToSize and discardDownTo

**Status**: ✅ COMPLETED  
**Spec**: `specs/08b-game-spec-compiler.md`

## Reassessed Assumptions (2026-02-10)
- Public `expandMacros` traversal/rewriting is implemented in `src/cnl/compiler.ts`; `src/cnl/expand-macros.ts` currently only owns board macro helpers.
- Existing macro-expansion coverage is consolidated in `test/unit/expand-macros.test.ts`; there is no `test/unit/cnl/` subtree.
- `refillToSize` and `discardDownTo` are not present yet in code/tests, so this ticket needs to define the internal sugar node shape it expands:
  - `refillToSize: { zone: string, size: number, fromZone: string }`
  - `discardDownTo: { zone: string, size: number, to?: string }`
- Full semantic lowering is still out of scope; this ticket is limited to deterministic macro elimination at `GameSpecDoc` effect level.

## Goal
Implement deterministic expansion for `refillToSize` and `discardDownTo` sugar, including missing-capability diagnostics when requested behavior is not representable.

## Implementation Tasks
1. Expand `refillToSize(zone, size, fromZone)` into bounded per-iteration logic using `zoneCount(zone) < size` guard and `draw count: 1`.
2. Expand `discardDownTo(zone, size[, to])` into deterministic bounded token processing that removes only surplus tokens.
3. Emit `CNL_COMPILER_MISSING_CAPABILITY` when `size` is not compile-time integer literal `>= 0`.
4. Enforce `maxExpandedEffects` and cap diagnostics if expansion exceeds limits.
5. Add unit tests for overfill prevention and exact surplus removal semantics.

## File List (Expected to Touch)
- `src/cnl/compiler.ts`
- `test/unit/expand-macros.test.ts`

## Out of Scope
- Selector normalization.
- Action/trigger/end-condition compilation.
- Final `GameDef` validation orchestration.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/expand-macros.test.js`

### Invariants that must remain true
- Expanded `refillToSize` never overfills already-populated zones.
- Expanded `discardDownTo` removes exactly `max(0, currentSize - size)` tokens.
- Unsupported dynamic-size inputs emit `CNL_COMPILER_MISSING_CAPABILITY` with `path`, `message`, and `suggestion`.
- Expansion remains deterministic and bounded by configured limits.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added deterministic `refillToSize` expansion in `src/cnl/compiler.ts` for sugar shape `refillToSize: { zone, size, fromZone }`.
  - Added deterministic `discardDownTo` expansion in `src/cnl/compiler.ts` for sugar shape `discardDownTo: { zone, size, to? }`.
  - Added `CNL_COMPILER_MISSING_CAPABILITY` diagnostics when `size` is not a compile-time integer literal `>= 0` for either macro.
  - Reused/extended expansion-limit handling so macro rewrites respect `maxExpandedEffects`.
  - Added focused unit coverage in `test/unit/expand-macros.test.ts` for refill/discard semantics, missing capability diagnostics, and expansion-limit behavior.
- **Deviations from original plan**:
  - No changes were needed in `src/cnl/expand-macros.ts` or `src/cnl/compiler-diagnostics.ts`; all required logic fit in the existing `expandMacros` pipeline in `src/cnl/compiler.ts`.
  - Test additions were made in existing `test/unit/expand-macros.test.ts` instead of creating `test/unit/cnl/*` files, to match repository structure.
- **Verification**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `node --test dist/test/unit/expand-macros.test.js` passed.
  - `npm test` passed.
