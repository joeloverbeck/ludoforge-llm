# EVEINTCHOPRO-005: Full test suite validation and simulator E2E

**Status**: ✅ COMPLETED

**Spec**: 50 (Event Interactive Choice Protocol)
**Priority**: Medium
**Depends on**: EVEINTCHOPRO-001, EVEINTCHOPRO-002, EVEINTCHOPRO-003, EVEINTCHOPRO-004

## Summary

Final validation ticket. After all kernel, agent, and test changes are in place, run the full test suite (`pnpm turbo test`) and confirm everything passes. Specifically validate that the simulator can run full FITL games with events executing correctly through the new template completion flow.

This corresponds to Spec 50 Tests 10-11.

## File List

| File | Change |
|------|--------|
| `packages/engine/test/unit/sim/simulator.test.ts` | May need minor updates if simulator tests exercise event moves directly. Verify and fix if needed. |
| `packages/engine/test/e2e/fitl-playbook-golden.test.ts` | Verify golden trace still matches. If events now produce different decision params (due to agent random completion vs deterministic first-option), golden traces may need regeneration. |
| `packages/engine/test/helpers/fitl-playbook-harness.ts` | Verify the harness handles event templates correctly. If the harness constructs event moves with explicit params via `applyMoveWithResolvedDecisionIds`, it should be unaffected. If it relies on `legalMoves` for event moves, it may need `completeTemplateMove`. |

## Detailed Change

### Step 1: Run full test suite

```bash
pnpm turbo build
pnpm turbo test --force
```

If all 2400+ tests pass, this ticket is done (no code changes needed).

### Step 2: Diagnose and fix any remaining failures

Likely failure categories:

1. **Golden trace mismatches**: If playbook golden tests compare event move params, the params will now be different (randomly completed vs deterministic first-option). Regenerate golden traces with `pnpm -F @ludoforge/engine test:e2e -- --update` or equivalent. Verify the new traces are correct (pieces distributed across cities, not all to `an-loc:none`).

2. **Simulator test failures**: If `simulator.test.ts` runs a game to N turns and checks specific state, the state may differ because event choices are now random rather than deterministic-first-option. Update expected values or make assertions more flexible.

3. **Playbook harness issues**: If the harness constructs event moves using `legalMoves()` directly, insert `completeTemplateMove` as done in EVEINTCHOPRO-003.

### Step 3: Validate simulator with events (Spec Test 10)

Run or add a test that:
```
Setup: Full FITL game with event deck containing Gulf of Tonkin
Action: Simulator runs with RandomAgent for N turns (enough to encounter at least 1 event)
Assert:
  - Game does not crash
  - Event moves are applied successfully
  - Game trace includes event moves with decision params
  - Terminal detection works (game can end normally)
```

If the existing simulator E2E tests already cover this (running FITL games for multiple turns), just verify they pass. If no existing test exercises events in the simulator, add one.

### Step 4: Verify non-event test integrity (Spec Test 11)

Confirm that the full test suite has the same pass count for non-event tests as before the EVEINTCHOPRO changes. No non-event test should have been modified or should fail.

## Out of Scope

- Further kernel changes (all kernel work is done in EVEINTCHOPRO-001)
- Further agent changes (all agent work is done in EVEINTCHOPRO-002)
- New protocol tests (all new tests are in EVEINTCHOPRO-004)
- Browser runner validation
- Performance optimization of template completion

## Acceptance Criteria

### Tests that must pass

- `pnpm turbo test` — **zero failures** across all packages
- `pnpm turbo typecheck` — zero type errors
- `pnpm turbo lint` — no new lint errors (pre-existing ones in unrelated files are acceptable)

### Invariants that must remain true

- **INV-1**: Deterministic replayability — same seed + same agent = same game trace. (Note: traces will differ from pre-EVEINTCHOPRO traces because event decisions are now random vs first-option. But for a given seed, replaying always produces the same result.)
- **INV-2 through INV-7**: All invariants from the spec must hold.
- **Full suite integrity**: The total test count should be >= pre-EVEINTCHOPRO count + new tests from EVEINTCHOPRO-004. No tests should have been deleted.

### Verification

```bash
pnpm turbo build
pnpm turbo test --force
pnpm turbo typecheck
pnpm turbo lint
```

All must complete successfully.

## Outcome

- **Completion date**: 2026-02-25
- **What changed**: Final validation completed for Spec 50 implementation scope; ticket archived as completed.
- **Deviations from original plan**: None recorded.
- **Verification results**: User confirmed test suite already passes.
