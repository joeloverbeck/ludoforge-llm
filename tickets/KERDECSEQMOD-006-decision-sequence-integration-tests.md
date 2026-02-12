# KERDECSEQMOD-006 - Decision Sequence Integration Tests

**Status**: Not started
**Spec**: `specs/25b-kernel-decision-sequence-model.md` (Integration tests section)
**Depends on**: KERDECSEQMOD-001, KERDECSEQMOD-002, KERDECSEQMOD-003, KERDECSEQMOD-004, KERDECSEQMOD-005

## Goal

Create integration tests that exercise the full decision sequence pipeline end-to-end: `legalMoves()` emitting template moves, agents using `legalChoices()` to fill params, `applyMove()` validating and executing the completed move, and `__freeOperation` binding controlling cost spending.

These tests use synthetic GameDef fixtures (not FITL data) that contain actions with operation profiles and multi-step `chooseOne`/`chooseN` decisions, verifying the entire flow from template move through agent completion to state transition.

## Scope

- Create `test/integration/decision-sequence.test.ts` with end-to-end integration tests
- Build minimal synthetic GameDef fixtures with operation profiles containing `chooseOne`/`chooseN`
- Test both RandomAgent and GreedyAgent completing template moves
- Test determinism (same seed = same result)
- Test `__freeOperation` cost skipping in an integrated scenario

## File list it expects to touch

- `test/integration/decision-sequence.test.ts` (**NEW** file)
- `test/fixtures/` (may add new fixture GameDef JSONs if needed)

## Out of scope

- FITL-specific operation effects or scenarios (Spec 26+)
- Changes to any `src/` production code (this ticket is tests only)
- Performance benchmarks
- E2E tests with FITL data (Spec 31)
- Non-player AI (Spec 30)

## Implementation Details

### Synthetic fixture design

Create a minimal GameDef with:
- 2+ players
- A handful of zones with tokens
- An action with an operation profile containing:
  - A `chooseOne` effect (e.g., select a zone)
  - A `chooseN` effect (e.g., select 1-3 tokens from the chosen zone)
  - A side-effect (e.g., `moveToken` or `setVar`) that uses the bound values
- A simple action without a profile (for backward-compatibility testing)
- Variables for cost tracking

### Test scenarios

#### Scenario 1: RandomAgent multi-choice operation

1. `legalMoves()` returns template move for the profiled action
2. RandomAgent uses `legalChoices()` loop to fill zone + token selections
3. `applyMove()` validates and executes the completed move
4. State reflects the expected changes (tokens moved, variables updated)

#### Scenario 2: GreedyAgent multi-choice operation

1. Same setup as Scenario 1 but with GreedyAgent
2. Verify the greedy agent picks the highest-scoring completion
3. State reflects expected changes

#### Scenario 3: Determinism

1. Run Scenario 1 twice with the same seed
2. Assert identical final state hashes

#### Scenario 4: Free operation cost skipping

1. Create a profiled action with per-space cost guarded by `__freeOperation`
2. Play the operation with `freeOperation: true`
3. Verify cost is NOT deducted
4. Play the same operation with `freeOperation: false`
5. Verify cost IS deducted

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `node --test dist/test/integration/decision-sequence.test.js`
- `npm test` (full test suite, no regressions)

### Test cases (in `test/integration/decision-sequence.test.ts`)

1. RandomAgent plays a multi-choice operation from template to completion, state is correct
2. GreedyAgent plays a multi-choice operation from template to completion, state is correct
3. Same seed produces identical final state hash for template-based moves (determinism)
4. Free operation via template move skips per-space cost (resource variable unchanged)
5. Non-free operation via template move deducts per-space cost correctly
6. Simple actions (no profile) still work end-to-end alongside template moves

### Invariants that must remain true

- All existing integration tests pass (no regression)
- Integration tests use synthetic fixtures, not FITL production data
- Tests are deterministic (no flaky behavior)
- Tests verify state correctness, not just absence of errors
- No production code changes in this ticket
