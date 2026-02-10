# GAMSPECOM-007 - Actions, Triggers, and End-Condition Compilation

**Status**: ✅ COMPLETED  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Compile top-level actions, triggers, and end conditions into `GameDef` structures using existing selector/effect/condition lowering building blocks, with deterministic ordering and diagnostics.

## Assumption Reassessment (Updated)
- This codebase currently centralizes compiler work in `src/cnl/compiler.ts`; there is no `src/cnl/compile-actions.ts`.
- Existing unit tests are under `test/unit/` (not `test/unit/cnl/`).
- `GameSpecDoc` currently has no top-level `scoring` section, so scoring compilation is not implementable in this ticket without expanding the parser/schema contract.
- Existing lowerers already exist and should be reused:
  - `src/cnl/compile-zones.ts`
  - `src/cnl/compile-conditions.ts`
  - `src/cnl/compile-effects.ts`
  - `src/cnl/compile-selectors.ts`

## Implementation Tasks
1. Implement action compilation in `src/cnl/compiler.ts` (`actor`, params, preconditions, cost, effects, limits) via existing lowerers.
2. Compile triggers in declaration order with deterministic trigger IDs when omitted.
3. Compile end conditions (including `result.type: win|lossAll|draw|score`) through condition/player-selector lowering.
4. Build compiled top-level sections (`metadata`, vars, zones, tokenTypes, setup, turnStructure, actions, triggers, endConditions`) and run `validateGameDef` diagnostics.
5. Add/adjust unit tests for valid top-level lowering and deterministic ordering.

## File List (Expected to Touch)
- `src/cnl/compiler.ts`
- `test/unit/compile-actions.test.ts` (new)
- `test/unit/compile-top-level.test.ts` (new)

## Out of Scope
- Macro expansion implementation details.
- Diagnostic sorting/dedup final pass.
- Adding `scoring` to `GameSpecDoc` / parser / validator (separate ticket).

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compile-actions.test.js`
- `node --test dist/test/unit/compile-top-level.test.js`
- `node --test dist/test/unit/compiler-api.test.js`

### Invariants that must remain true
- Input action/trigger order is preserved in compiled output where semantic order matters.
- Actor/player selectors are normalized to valid `PlayerSel` representations.
- Unknown references produce deterministic blocking diagnostics with source-aware paths.

## Outcome
- Completion date: 2026-02-10
- Implemented in `src/cnl/compiler.ts`:
  - Semantic lowering now compiles top-level metadata/constants/vars/zones/tokenTypes/setup/turnStructure/actions/triggers/endConditions.
  - Actions now compile `actor`, `params`, `pre`, `cost`, `effects`, and `limits` using existing lowerers.
  - Triggers compile in declaration order, with deterministic fallback IDs when missing.
  - End-condition result lowering supports `win|lossAll|draw|score`.
  - Compiled output is validated through `validateGameDef`, with deterministic diagnostics and `gameDef: null` on error.
- Added tests:
  - `test/unit/compile-actions.test.ts`
  - `test/unit/compile-top-level.test.ts`
- Key deviation from original plan:
  - Scoring compilation from CNL remains deferred because `GameSpecDoc` currently has no top-level `scoring` section; this was explicitly moved out of scope in this ticket update.
- Verification:
  - `npm run build`
  - `node --test dist/test/unit/compile-actions.test.js`
  - `node --test dist/test/unit/compile-top-level.test.js`
  - `node --test dist/test/unit/compiler-api.test.js`
  - `npm test`
