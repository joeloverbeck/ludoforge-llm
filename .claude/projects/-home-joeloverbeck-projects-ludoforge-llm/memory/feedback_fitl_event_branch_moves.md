---
name: FITL Event Branch Moves
description: FITL event branches produce separate legal moves via move.params.branch, not decision overrides — requireEventMove returns the first branch by default
type: feedback
---

FITL event branches (e.g., card-105 shaded "rural-pressure-plus-patronage" / "rural-pressure-minus-patronage") produce **separate legal moves**, each with `move.params.branch` set to the branch ID. They are NOT resolved as decision points during `completeMoveDecisionSequence`.

**Why:** The `resolveSelectedBranch` function in `event-execution.ts` reads `move.params.branch` directly. `legalMoves()` enumerates one move per branch. `findEventMove` / `requireEventMove` uses `.find()` and returns the first match — always the first branch by order.

**How to apply:** When testing a specific branch:
- Do NOT use `matchesDecisionRequest` overrides for branch selection
- Instead, filter `legalMoves()` by `m.params.branch === 'branch-id'` to get the specific branch move
- Or use a helper like `requireBranchMove(def, state, cardId, side, branchId)`
