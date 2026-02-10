# GAMSPECOM-004 - Macro Expansion: refillToSize and discardDownTo

**Status**: TODO  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Implement deterministic expansion for `refillToSize` and `discardDownTo` sugar, including missing-capability diagnostics when requested behavior is not representable.

## Implementation Tasks
1. Expand `refillToSize(zone, size, fromZone)` into bounded per-iteration logic using `zoneCount(zone) < size` guard and `draw count: 1`.
2. Expand `discardDownTo(zone, size[, to])` into deterministic bounded token processing that removes only surplus tokens.
3. Emit `CNL_COMPILER_MISSING_CAPABILITY` when `size` is not compile-time integer literal `>= 0`.
4. Enforce `maxExpandedEffects` and cap diagnostics if expansion exceeds limits.
5. Add unit tests for overfill prevention and exact surplus removal semantics.

## File List (Expected to Touch)
- `src/cnl/expand-macros.ts`
- `src/cnl/compiler-diagnostics.ts`
- `test/unit/cnl/expand-macros-refill.test.ts` (new)
- `test/unit/cnl/expand-macros-discard.test.ts` (new)

## Out of Scope
- Selector normalization.
- Action/trigger/end-condition compilation.
- Final `GameDef` validation orchestration.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/cnl/expand-macros-refill.test.js`
- `node --test dist/test/unit/cnl/expand-macros-discard.test.js`

### Invariants that must remain true
- Expanded `refillToSize` never overfills already-populated zones.
- Expanded `discardDownTo` removes exactly `max(0, currentSize - size)` tokens.
- Unsupported dynamic-size inputs emit `CNL_COMPILER_MISSING_CAPABILITY` with `path`, `message`, and `suggestion`.
- Expansion remains deterministic and bounded by configured limits.
