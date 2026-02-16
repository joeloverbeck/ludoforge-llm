# TEXHOLKERPRIGAMTOU-019: Texas Runtime Bootstrap and Position/Blind Flow Correctness

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-018
**Blocks**: TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009, TEXHOLKERPRIGAMTOU-020

## 0) Reassessed assumptions (code/tests reality)

This ticket's original assumptions were stale in multiple places.

Initial discrepancy found during reassessment (before implementation):
1. Texas compiles, but runtime bootstrap is non-playable by default:
   - initial state has `deck:none = 0` cards, `activePlayers = 0`, all `chipStack = 0`, and no legal moves.
   - simulator stops immediately with `stopReason = noLegalMoves` at phase `hand-setup`.
2. Texas has no explicit `setup:` section and scenario data does not currently provide `factionPools`, so compiler-derived piece catalog setup effects are empty for Texas.
3. Current round-robin turn model has no generic effect to mutate `state.activePlayer` inside a hand/action flow.
   - Without that primitive, poker action-order progression (UTG/SB/BB/postflop-first and skip folded/all-in/eliminated) cannot be modeled cleanly in YAML.
4. Existing Texas tests only assert structural compile/shape invariants (`test/unit/texas-holdem-spec-structure.test.ts`) and do not exercise simulator playability or betting-order correctness.

Architectural conclusion:
- The proposed ticket direction is more beneficial than the current state and should proceed.
- To keep the engine game-agnostic and robust long-term, we should add a generic active-player mutation primitive at kernel level (no poker branching), then encode poker-specific seat/order logic in Texas YAML macros.
- We should not add compatibility aliases or fallback poker hacks in runtime.

## 1) Updated scope: what must change / be implemented

Make Texas immediately playable in simulator with deterministic, rules-correct position/blind flow:

1. Implement explicit playable bootstrap for Texas:
   - ensure deck tokens exist at runtime from GameSpecDoc/scenario data (no external fixture dependency).
   - initialize per-player tournament state deterministically (`chipStack`, `seatIndex`, `eliminated`, `handActive`, `allIn`) and global counters (`activePlayers`, etc.).
2. Add a generic kernel effect to set active decision player (engine-level primitive, game-agnostic):
   - no poker-specific branches.
   - validated and test-covered as standard effect AST/runtime behavior.
3. Encode poker position flow in Texas YAML/macros:
   - dealer rotation over non-eliminated players.
   - deterministic SB/BB/UTG derivation from active seats.
   - maintain `actingPosition` as deterministic seat-state mirror and sync with `activePlayer`.
4. Implement heads-up special case in YAML:
   - button = SB in heads-up.
   - preflop first-to-act and postflop first-to-act follow policy from spec 33.
5. Ensure turn progression skips ineligible players:
   - folded, all-in, and eliminated players are skipped for action order.
   - eliminated players receive no cards and cannot act.
6. Keep game logic data-driven/YAML-driven:
   - no Texas-specific kernel conditionals.
   - no backwards-compat aliases.

## 2) Invariants that should pass

1. Texas initial runtime state is playable: non-empty deck, initialized stacks, `activePlayers > 1`, legal moves available.
2. Card source zones are valid at all deal points.
3. Position/blind progression is deterministic and rules-correct across hands.
4. Heads-up behavior matches defined policy.
5. Folded/all-in/eliminated players are skipped in acting-order progression.
6. No simulator/runtime crashes from missing setup tokens/zones in normal Texas flow.

## 3) Tests that should pass

1. Unit: new kernel effect tests for generic active-player mutation primitive (including selector cardinality/validation).
2. Unit: Texas compile/structure checks updated for explicit setup and bootstrap assumptions.
3. Integration: Texas simulator smoke test proves playable initialization (no immediate `noLegalMoves`, legal moves exist).
4. Integration: first-hand setup deals cards with card conservation.
5. Integration: deterministic dealer/SB/BB/UTG progression across several hands.
6. Integration: heads-up transition and heads-up blind/action ordering.
7. Integration: eliminated players receive no cards and cannot become acting player.
8. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16
- What changed (implemented):
  - Added a **generic** kernel effect primitive `setActivePlayer` (AST schema, compiler lowering/registry, runtime dispatch+handler, validation, and unit coverage).
  - Fixed lifecycle architecture so phase lifecycle dispatch executes phase `onEnter`/`onExit` effects (plus emitted-event trigger propagation), enabling phase-authored setup logic to run as designed.
  - Updated Texas data assets to include scenario `factionPools` so deck bootstrap is data-driven from GameSpecDoc assets.
  - Added explicit Texas `setup:` initialization for core tournament/player vars.
  - Reworked Texas macros/rules for dealer rotation, forced blinds, heads-up policy, and next-to-act selection with `actingPosition` + `activePlayer` sync.
  - Added integration runtime coverage for Texas bootstrap, actor progression sync, and heads-up blind/opening-order policy.
- Deviations vs original plan:
  - The ticket originally scoped Texas/YAML changes and generic `setActivePlayer`; implementation also included a generic lifecycle fix in kernel (`dispatchLifecycleEvent`) because root-cause analysis showed first-phase lifecycle effects were not executed by lifecycle dispatch.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
