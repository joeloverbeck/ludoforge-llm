# TEXHOLKERPRIGAMTOU-006: GameSpecDoc — Rules, Actions & Turn Structure

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-004 (vocabulary), TEXHOLKERPRIGAMTOU-005 (macros)
**Blocks**: TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## 0) Assumption Reassessment (Current Code/Test Reality)

Corrected assumptions before implementation:
- The ticket assumed one action id could naturally span multiple betting streets, but engine applicability was keyed to a single `action.phase` string.
- Implementing canonical poker actions (`fold`, `check`, `call`, `raise`, `allIn`) without duplication required generic multi-phase action support.
- This was a game-agnostic engine concern, so updating compiler/kernel contracts was more robust than duplicating per-street action ids in Texas YAML.

Architecture decision:
- Extend action phase semantics to support one action bound to multiple phases (`phase: string | string[]`) in a generic way.
- Keep game-specific behavior in Texas YAML; keep simulator/kernel behavior game-agnostic.

## 1) What was implemented

- Added `data/games/texas-holdem/30-rules-actions.md` with:
  - 7 phases (`hand-setup`, `preflop`, `flop`, `turn`, `river`, `showdown`, `hand-cleanup`)
  - round-robin turn order
  - 5 canonical actions (`fold`, `check`, `call`, `raise`, `allIn`)
- Integrated macro-driven street advancement and showdown/cleanup transitions.
- Added compiler/validator/runtime support for multi-phase actions:
  - validator accepts `action.phase` as non-empty string or non-empty array of phase ids
  - lowering preserves multi-phase declarations
  - legality/applicability checks treat action as valid when `currentPhase` is any declared phase
  - GameDef validation and cross-reference diagnostics now validate each declared action phase
  - core schema updated and artifacts regenerated

## 2) Invariants satisfied

1. Turn structure/action ids are present and normalized for Texas Hold'em.
2. Multi-phase action declarations are generic and reusable across games.
3. No Texas-specific branches were added to kernel/compiler.
4. Diagnostics remain deterministic and path-specific for invalid phase references.

## 3) Tests added/updated

1. `test/unit/compile-top-level.test.ts`
   - Added: action phase list compiles to GameDef.
2. `test/unit/kernel/legal-moves.test.ts`
   - Added: multi-phase action is legal when `state.currentPhase` matches any declared phase.
3. `test/unit/texas-holdem-spec-structure.test.ts`
   - Extended: validates Texas phases/actions are parsed from the new `30-rules-actions.md` fragment.

## Outcome

- **Completion date**: 2026-02-16
- **What was actually changed vs originally planned**:
  - In addition to adding the Texas rules/actions file, generic engine/compiler support for multi-phase actions was implemented because single-phase action contracts would have forced action duplication and weaker architecture.
- **Verification results**:
  - `npm run build` ✅
  - `npm test` ✅
  - `npm run lint` ✅
