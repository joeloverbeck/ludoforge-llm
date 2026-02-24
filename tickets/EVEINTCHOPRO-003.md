# EVEINTCHOPRO-003: Update existing event integration tests for template workflow

**Spec**: 50 (Event Interactive Choice Protocol)
**Priority**: High
**Depends on**: EVEINTCHOPRO-001
**Blocks**: EVEINTCHOPRO-005

## Summary

After EVEINTCHOPRO-001, event moves from `legalMoves()` are templates. All existing integration tests that call `legalMoves()` → find event move → `applyMove()` will fail because the event move no longer has decision params pre-filled.

Update these tests to complete event templates before calling `applyMove()`. Use `completeTemplateMove()` from `template-completion.ts` (which agents already use) or manually construct the decision params where test-specific control is needed.

## File List

| File | Change |
|------|--------|
| `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` | Update 5 tests that call `legalMoves` → `applyMove` for events |
| `packages/engine/test/integration/fitl-commitment-phase.test.ts` | Update event move application (line 94) |
| `packages/engine/test/integration/fitl-commitment-targeting-rules.test.ts` | Update event move application (line 65) |
| `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` | Update event move application (line 183) |
| `packages/engine/test/integration/fitl-card-flow-determinism.test.ts` | Update event move application (line 416) |
| `packages/engine/test/unit/apply-move.test.ts` | Update event move applications (lines 1890-1891) |

## Detailed Change

### Pattern: Add `completeTemplateMove` to event test flows

For each affected test, add an import of `completeTemplateMove` and `createRng` (for providing an Rng to the completion function), then insert a completion step between finding the event move and applying it.

**Before** (typical pattern):
```typescript
const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
const result = applyMove(def, setup, unshadedMove!).state;
```

**After**:
```typescript
import { completeTemplateMove } from '../agents/template-completion.js'; // or appropriate path
import { createRng } from '../../src/kernel/prng.js'; // or appropriate path

const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
const completed = completeTemplateMove(def, setup, unshadedMove!, createRng(BigInt(seed)).rng);
assert.notEqual(completed, null, 'Event template should be completable');
const result = applyMove(def, setup, completed!.move).state;
```

### Gulf of Tonkin tests — special considerations

- **Test "distributes pieces across multiple cities"**: Already constructs custom decision params manually. After this change, the base move from `legalMoves` will no longer have the decision keys to modify. Instead, this test should use `legalChoicesEvaluate` in a loop to discover each decision and manually assign different cities.
- **Test "moves mixed piece types"**: Needs `completeTemplateMove` to resolve decisions. The assertions about mixed types in cities remain valid.
- **Test "moves all available pieces when fewer than 6"**: Same — use `completeTemplateMove`.
- **Test "handles zero pieces in out-of-play"**: The event move with 0 pieces should already be complete (no `chooseOne` fires). Verify that `legalChoicesEvaluate` returns `kind: 'complete'` and `applyMove` works directly.

### Tests that use `applyMoveWithResolvedDecisionIds`

The playbook harness (`fitl-playbook-harness.ts`) uses `applyMoveWithResolvedDecisionIds` which resolves decision IDs before applying. This helper resolves existing params — it does NOT complete templates (it doesn't add missing decisions). If the playbook harness constructs event moves with explicit params, it is unaffected. If it gets moves from `legalMoves`, it will need updating. Verify this during implementation.

## Out of Scope

- Changes to `legal-moves.ts` — that is EVEINTCHOPRO-001
- Changes to agent source code — that is EVEINTCHOPRO-002
- New protocol validation tests — that is EVEINTCHOPRO-004
- Simulator or E2E tests — that is EVEINTCHOPRO-005
- Changing test assertions about game behavior — only the move acquisition/completion path changes, not what the tests verify about game state

## Acceptance Criteria

### Tests that must pass

After this ticket, ALL of the following test files must pass:

- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — all 6 tests
- `packages/engine/test/integration/fitl-commitment-phase.test.ts`
- `packages/engine/test/integration/fitl-commitment-targeting-rules.test.ts`
- `packages/engine/test/integration/fitl-turn-flow-golden.test.ts`
- `packages/engine/test/integration/fitl-card-flow-determinism.test.ts`
- `packages/engine/test/unit/apply-move.test.ts`

### Invariants that must remain true

- **INV-3**: After `completeTemplateMove`, event moves passed to `applyMove` succeed without error.
- **INV-4**: Zero-piece scenarios still work — event moves with no forEach iterations are complete without template completion.
- **INV-5**: Events without `chooseOne` effects work directly — no template completion needed.
- **INV-6**: Non-event tests are completely unaffected by these changes.
- **Test behavior**: All existing assertions about game state (piece counts, zone contents, variable values) must remain identical. Only the move acquisition path changes, not the game outcomes.

### Verification

Run `pnpm -F @ludoforge/engine test` and confirm zero failures across the affected files.
