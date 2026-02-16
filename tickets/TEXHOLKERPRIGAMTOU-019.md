# TEXHOLKERPRIGAMTOU-019: Texas Runtime Bootstrap and Position/Blind Flow Correctness

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-018
**Blocks**: TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009, TEXHOLKERPRIGAMTOU-020

## 1) What must change / be implemented

Make Texas immediately playable in simulator with correct hand setup and position flow:

1. Implement explicit deck/bootstrap setup in GameSpecDoc for Texas so draw effects always have valid source tokens.
2. Implement dealer/SB/BB/UTG derivation based on active (non-eliminated) players.
3. Use and maintain `actingPosition` deterministically through betting streets.
4. Implement heads-up special case correctly (button=SB, preflop/postflop order).
5. Ensure folded/all-in/eliminated players are handled correctly in turn/position progression.
6. Keep all of this in YAML game logic; no kernel poker branches.

## 2) Invariants that should pass

1. Card source zones are valid at all deal points.
2. Position/blind progression is deterministic and rules-correct.
3. Eliminated players are excluded from deal/action loops.
4. Heads-up behavior matches defined policy.
5. No simulator/runtime crashes from missing tokens/zones in normal Texas flow.

## 3) Tests that should pass

1. Integration: first hand setup creates/deals cards correctly and card conservation holds.
2. Integration: dealer/SB/BB/UTG progression across several hands is deterministic.
3. Integration: heads-up transition and heads-up blind/action ordering.
4. Integration: eliminated players receive no cards and no legal moves.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
