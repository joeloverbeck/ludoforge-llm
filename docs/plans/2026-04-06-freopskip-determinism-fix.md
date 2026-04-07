# FREOPSKIP-001 Determinism Regression Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Revert the FREOPSKIP-001 kernel changes that broke game determinism, re-implement `skipIfNoLegalCompletion` without affecting non-free-operation legal move behavior, and add a CI canary test that guards against future grant-related determinism regressions.

**Architecture:** Revert commits a68bd0ca and be3e5d45 (engine code + game data only, keep tests and docs). Re-implement skipIfNoLegalCompletion as an isolated addition: the new completion policy must not change any code path that executes when no skipIfNoLegalCompletion grants are pending. Add a PolicyAgent-based determinism canary that runs FITL seed 1000 with production profiles and asserts the exact game outcome (VC wins in 38 moves).

**Tech Stack:** TypeScript, node:test, pnpm, GitHub Actions

**FOUNDATIONS alignment:**
- §8 (Determinism): Same seed + same agents = same result — proven by canary test
- §10 (Bounded Computation): No unbounded loops — proven by game completion
- §14 (No Backwards Compatibility): Clean revert + re-implement, no shims
- §15 (Architectural Completeness): Root cause fix, not workaround
- §16 (Testing as Proof): TDD — write failing test, then fix

---

## Worktree

All work happens in the existing ARVN campaign worktree:
```
WT=/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/improve-fitl-arvn-agent-evolution
```

## Key Files Reference

**Engine code changed by FREOPSKIP-001 (to revert):**
- `packages/engine/src/kernel/legal-moves.ts`
- `packages/engine/src/kernel/legal-moves-turn-order.ts`
- `packages/engine/src/kernel/phase-advance.ts`
- `packages/engine/src/kernel/turn-flow-eligibility.ts`
- `packages/engine/src/kernel/apply-move.ts`
- `packages/engine/src/kernel/free-operation-viability.ts`
- `packages/engine/src/kernel/free-operation-grant-zod.ts`
- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`
- `packages/engine/src/cnl/compile-effects-free-op.ts`
- `packages/engine/src/agents/prepare-playable-moves.ts`

**Game data changed by FREOPSKIP-001 (to revert):**
- `data/games/fire-in-the-lake/41-events/065-096.md` (Card 75 completionPolicy)

**Tests added by FREOPSKIP-001 (keep and adapt):**
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (80 lines added)
- `packages/engine/test/unit/phase-advance.test.ts` (107 lines added)
- `packages/engine/test/integration/fitl-events-sihanouk.test.ts` (19 lines added)
- `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` (2 lines added)
- `packages/engine/test/unit/compile-effects.test.ts` (29 lines added)
- `packages/engine/test/unit/schemas-ast.test.ts` (12 lines added)
- `packages/engine/test/unit/validate-gamedef.test.ts` (18 lines added)

**New canary test (to create):**
- `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`

**New CI workflow (to create):**
- `.github/workflows/engine-grant-determinism.yml`

**Existing determinism pattern to follow:**
- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts`
- `.github/workflows/engine-determinism.yml`

---

## Task 1: Write the PolicyAgent determinism canary test (RED)

This test proves the regression exists. It runs FITL seed 1000 with production PolicyAgent profiles and asserts the known-good outcome.

**Files:**
- Create: `$WT/packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`

**Step 1: Write the canary test**

```typescript
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/**
 * Canary test: FITL seed 1000 with production PolicyAgent profiles must
 * produce deterministic, correct game outcomes.
 *
 * This guards against regressions where kernel changes (e.g., free-operation
 * grant handling) silently alter legal-move enumeration or turn-flow
 * advancement, causing games to diverge from their established trajectory.
 *
 * FOUNDATIONS §8: Same GameDef + same seed + same agents = identical result.
 * FOUNDATIONS §10: Games must complete within bounded moves (no infinite loops).
 */
describe('FITL PolicyAgent determinism canary', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  const PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
  const MAX_TURNS = 100;
  const PLAYER_COUNT = 4;

  it('seed 1000: VC wins during Coup in ≤50 moves', () => {
    const agents = PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'none' }),
    );
    const trace = runGame(def, 1000, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

    assert.equal(trace.stopReason, 'terminal', 'game should reach terminal, not maxTurns');
    assert.notEqual(trace.result, null, 'game should have a result');
    assert.equal(trace.result!.type, 'win', 'result should be a win');
    assert.equal(
      trace.result!.victory?.winnerSeat,
      'vc',
      `expected VC to win, got ${trace.result!.victory?.winnerSeat}`,
    );
    assert.ok(
      trace.moves.length <= 50,
      `expected ≤50 moves, got ${trace.moves.length}`,
    );
  });

  it('seed 1000: replay produces identical outcome', () => {
    const run = () => {
      const agents = PROFILES.map(
        (profileId) => new PolicyAgent({ profileId, traceLevel: 'none' }),
      );
      return runGame(def, 1000, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
    };
    const trace1 = run();
    const trace2 = run();
    assert.equal(trace1.moves.length, trace2.moves.length, 'move count diverged');
    assert.equal(
      trace1.finalState.stateHash,
      trace2.finalState.stateHash,
      'final state hash diverged',
    );
  });
});
```

**Step 2: Build and run to verify it FAILS**

```bash
cd $WT && pnpm -F @ludoforge/engine build
cd $WT && pnpm -F @ludoforge/engine exec node --test packages/engine/dist/test/determinism/fitl-policy-agent-canary.test.js
```

Expected: FAIL — "game should reach terminal, not maxTurns" (because the FREOPSKIP regression causes maxTurns).

**Step 3: Commit the failing test**

```bash
cd $WT && git add packages/engine/test/determinism/fitl-policy-agent-canary.test.ts
git commit -m "test: add PolicyAgent determinism canary for FITL seed 1000 (RED)"
```

---

## Task 2: Revert FREOPSKIP-001 engine code and game data

Revert the engine source files and game data from commits a68bd0ca and be3e5d45 to the pre-FREOPSKIP state (commit 8bb612de). Do NOT revert test files or docs — we'll adapt those separately.

**Files:**
- Revert: all engine src files listed above
- Revert: `data/games/fire-in-the-lake/41-events/065-096.md`

**Step 1: Revert engine source files to pre-FREOPSKIP state**

```bash
cd $WT
git show 8bb612de:packages/engine/src/kernel/legal-moves.ts > packages/engine/src/kernel/legal-moves.ts
git show 8bb612de:packages/engine/src/kernel/legal-moves-turn-order.ts > packages/engine/src/kernel/legal-moves-turn-order.ts
git show 8bb612de:packages/engine/src/kernel/phase-advance.ts > packages/engine/src/kernel/phase-advance.ts
git show 8bb612de:packages/engine/src/kernel/turn-flow-eligibility.ts > packages/engine/src/kernel/turn-flow-eligibility.ts
git show 8bb612de:packages/engine/src/kernel/apply-move.ts > packages/engine/src/kernel/apply-move.ts
git show 8bb612de:packages/engine/src/kernel/free-operation-viability.ts > packages/engine/src/kernel/free-operation-viability.ts
git show 8bb612de:packages/engine/src/kernel/free-operation-grant-zod.ts > packages/engine/src/kernel/free-operation-grant-zod.ts
git show 8bb612de:packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts > packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts
git show 8bb612de:packages/engine/src/cnl/compile-effects-free-op.ts > packages/engine/src/cnl/compile-effects-free-op.ts
git show 8bb612de:data/games/fire-in-the-lake/41-events/065-096.md > data/games/fire-in-the-lake/41-events/065-096.md
```

**Step 2: Handle new file added by FREOPSKIP-001**

`packages/engine/src/agents/prepare-playable-moves.ts` was created by FREOPSKIP-001. Check if other code now depends on it. If nothing outside the reverted files imports it, delete it. If other files import it, keep it (it's agent infrastructure, not grant policy).

```bash
cd $WT && grep -r "prepare-playable-moves" packages/engine/src/ --include='*.ts' | grep -v 'prepare-playable-moves.ts'
```

If imports exist in non-reverted files, keep the file. Otherwise delete:
```bash
rm packages/engine/src/agents/prepare-playable-moves.ts
```

**Step 3: Build to check for compilation errors**

```bash
cd $WT && pnpm -F @ludoforge/engine build
```

Fix any compilation errors caused by the revert (e.g., missing exports, type mismatches from tests expecting FREOPSKIP-001 types).

**Step 4: Run the canary test to verify it PASSES**

```bash
cd $WT && pnpm -F @ludoforge/engine exec node --test packages/engine/dist/test/determinism/fitl-policy-agent-canary.test.js
```

Expected: PASS — seed 1000 produces VC win in ≤50 moves.

**Step 5: Adapt FREOPSKIP-001 tests to compile**

The tests added by FREOPSKIP-001 reference types and functions that no longer exist after the revert (e.g., `skipIfNoLegalCompletion` policy value, `skipUncompletablePendingFreeOperationGrants`). These tests need to be temporarily commented out or adapted so the suite compiles. They will be restored in Task 3.

```bash
cd $WT && pnpm -F @ludoforge/engine build
# Fix compilation errors in test files
# Then run full suite:
cd $WT && pnpm -F @ludoforge/engine test
```

Expected: All tests pass (FREOPSKIP-specific tests may need to be skipped until re-implementation).

**Step 6: Commit the revert**

```bash
cd $WT && git add -A
git commit -m "revert: remove FREOPSKIP-001 engine changes (a68bd0ca + be3e5d45)

Reverts kernel, compiler, and game data to pre-FREOPSKIP state (8bb612de).
The FREOPSKIP-001 implementation introduced a determinism regression: legal
move enumeration diverged for non-free-operation moves, causing seed 1000
to loop infinitely instead of completing with a VC win in 38 moves.

FREOPSKIP-001 tests are temporarily disabled pending re-implementation.
The skipIfNoLegalCompletion feature will be re-implemented in the next commit
without touching non-free-operation code paths."
```

---

## Task 3: Re-implement skipIfNoLegalCompletion (isolated)

Re-implement the `skipIfNoLegalCompletion` completion policy with a strict isolation constraint: **no code path that executes when no skipIfNoLegalCompletion grants are pending may be changed**. This means:

1. The `skipIfNoLegalCompletion` value is added to contracts and zod schemas (additive)
2. Card 75 uses the new policy value (game data change)
3. `advanceToDecisionPoint` gets a NEW branch for skippable grants, BEFORE the existing logic (so the existing `expireUnfulfillableRequiredFreeOperationGrants` path is unchanged)
4. `isMoveAllowedByRequiredPendingFreeOperationGrant` is NOT renamed or broadened — skipIfNoLegalCompletion grants get their own parallel check
5. `isActiveSeatEligibleForTurnFlow` is NOT broadened — skipIfNoLegalCompletion grants don't force eligibility
6. `withRequiredGrantCandidates` is NOT renamed — skipIfNoLegalCompletion grants don't override card eligibility
7. `legal-moves.ts` free-operation enumeration: the `needsCompletionProof` logic for required grants remains UNCHANGED; skipIfNoLegalCompletion grants get their own condition

**Isolation principle**: `git diff` between pre-FREOPSKIP and the re-implementation, filtered to lines that execute when no skipIfNoLegalCompletion grants exist, must be empty. All new code must be in NEW branches/functions gated by `isSkippablePendingFreeOperationGrant()`.

**Step 1: Add skipIfNoLegalCompletion to contracts and schemas**

Files:
- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` — add value to allowed list
- `packages/engine/src/kernel/free-operation-grant-zod.ts` — add zod variant
- `packages/engine/src/cnl/compile-effects-free-op.ts` — accept new value during compilation

These are purely additive — they don't change existing behavior.

**Step 2: Add skip handling to advanceToDecisionPoint**

File: `packages/engine/src/kernel/phase-advance.ts`

Add a new `skipIfNoLegalCompletion` handling block BEFORE the existing `expireUnfulfillableRequiredFreeOperationGrants` call. The existing code path remains untouched.

```typescript
// NEW: skip grants with skipIfNoLegalCompletion policy when no free-op moves exist
if (phaseValid) {
  const skipped = skipNoLegalCompletionGrants(def, nextState, seatResolution);
  if (skipped !== null) {
    nextState = skipped;
    advances += 1;
    continue;
  }
}

// EXISTING (unchanged): check legal moves, expire unfulfillable required grants
const hasLegal = phaseValid && legalMoves(def, nextState, { earlyExitAfterFirst: true }, cachedRuntime).length > 0;
if (hasLegal) break;

if (phaseValid) {
  const expired = expireUnfulfillableRequiredFreeOperationGrants(def, nextState, seatResolution);
  // ... existing logic unchanged
}
```

**Step 3: Implement skipNoLegalCompletionGrants**

File: `packages/engine/src/kernel/turn-flow-eligibility.ts`

New exported function (does not modify any existing function):

```typescript
export const skipNoLegalCompletionGrants = (
  def: GameDef, state: GameState, seatResolution: SeatResolutionContext,
): GameState | null => {
  // 1. Find pending grants with completionPolicy === 'skipIfNoLegalCompletion' for active seat
  // 2. Check if any free-operation legal moves exist for these grants
  // 3. If no legal moves: remove the grants from pending, return updated state
  // 4. If legal moves exist: return null (grants are viable, don't skip)
};
```

**Step 4: Handle skipIfNoLegalCompletion in legal-moves.ts enumeration**

The `needsCompletionProof` logic for EXISTING grants (required, mustChangeGameplayState) must remain identical. Add a SEPARATE check for skipIfNoLegalCompletion grants:

```typescript
// EXISTING (unchanged):
const needsCompletionProof = /* ... same as 8bb612de ... */;

// NEW: skipIfNoLegalCompletion grants also need completion proof
const isSkippableGrant = authorizedGrant !== null
  && authorizedGrant.completionPolicy === 'skipIfNoLegalCompletion';
const effectiveNeedsCompletionProof = needsCompletionProof || isSkippableGrant;
```

**Step 5: Update Card 75 game data**

File: `data/games/fire-in-the-lake/41-events/065-096.md`

Change Card 75 march grants from `completionPolicy: required` to `completionPolicy: skipIfNoLegalCompletion`.

**Step 6: Re-enable and adapt FREOPSKIP-001 tests**

Restore the tests that were disabled in Task 2. Adapt them to use the new isolated implementation.

**Step 7: Run full test suite including canary**

```bash
cd $WT && pnpm -F @ludoforge/engine build
cd $WT && pnpm -F @ludoforge/engine test
cd $WT && pnpm -F @ludoforge/engine test:determinism
```

Expected: ALL pass, including:
- Canary test (seed 1000 VC win)
- FREOPSKIP-001 tests (seed 1009 skip behavior)
- Full determinism suite

**Step 8: Verify isolation property**

```bash
cd $WT
# Diff the kernel source against pre-FREOPSKIP, excluding new functions/branches
git diff 8bb612de -- packages/engine/src/kernel/legal-moves.ts \
  packages/engine/src/kernel/phase-advance.ts \
  packages/engine/src/kernel/turn-flow-eligibility.ts
# Review: every changed line must be in a NEW block gated by skipIfNoLegalCompletion
```

**Step 9: Commit re-implementation**

```bash
cd $WT && git add -A
git commit -m "feat: re-implement skipIfNoLegalCompletion with isolation guarantee

Adds skipIfNoLegalCompletion completion policy for free-operation grants
without modifying any code path that executes when no such grants exist.

Isolation property: the legal-move enumeration, turn-flow eligibility,
and phase advancement paths for required grants and non-grant states are
byte-identical to pre-FREOPSKIP (8bb612de). All new logic is in separate
branches gated by completionPolicy === 'skipIfNoLegalCompletion'.

Fixes seed 1009 deadlock (Card 75 march grant) while preserving seed 1000
determinism (VC wins in 38 moves with production profiles)."
```

---

## Task 4: Add CI canary workflow

**Files:**
- Create: `$WT/.github/workflows/engine-grant-determinism.yml`

**Step 1: Create the workflow**

```yaml
name: Engine Grant Determinism Canary

on:
  push:
    branches: [main]
    paths:
      - 'packages/engine/src/kernel/**'
      - 'packages/engine/src/cnl/**'
      - 'packages/engine/src/contracts/**'
      - 'packages/engine/src/agents/**'
      - 'packages/engine/test/determinism/**'
      - 'data/games/**'
      - '.github/workflows/engine-grant-determinism.yml'
  pull_request:
    branches: [main]
    paths:
      - 'packages/engine/src/kernel/**'
      - 'packages/engine/src/cnl/**'
      - 'packages/engine/src/contracts/**'
      - 'packages/engine/src/agents/**'
      - 'packages/engine/test/determinism/**'
      - 'data/games/**'
      - '.github/workflows/engine-grant-determinism.yml'

concurrency:
  group: grant-determinism-${{ github.ref }}
  cancel-in-progress: true

jobs:
  grant-determinism:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F @ludoforge/engine build
      - run: pnpm -F @ludoforge/engine exec node --test packages/engine/dist/test/determinism/fitl-policy-agent-canary.test.js
```

**Step 2: Commit**

```bash
cd $WT && git add .github/workflows/engine-grant-determinism.yml
git commit -m "ci: add PolicyAgent determinism canary for grant regression detection"
```

---

## Task 5: Sync fixtures and run final verification

**Step 1: Regenerate golden fixtures**

```bash
cd $WT && bash campaigns/fitl-arvn-agent-evolution/sync-fixtures.sh
```

**Step 2: Run the complete verification matrix**

```bash
cd $WT && pnpm -F @ludoforge/engine build
cd $WT && pnpm -F @ludoforge/engine test          # full test suite
cd $WT && pnpm -F @ludoforge/engine test:determinism  # determinism lane
cd $WT && pnpm turbo typecheck                    # type safety
cd $WT && pnpm turbo lint                         # lint
```

**Step 3: Run the ARVN campaign harness to verify baseline**

```bash
cd $WT && bash campaigns/fitl-arvn-agent-evolution/harness.sh
```

Expected: harness completes with a real compositeScore (not -4 from maxTurns).

**Step 4: Commit fixtures if changed**

```bash
cd $WT && git add packages/engine/test/fixtures/ packages/engine/schemas/
git commit -m "chore: regenerate fixtures after FREOPSKIP re-implementation"
```

---

## Task 6: Re-measure ARVN baseline and resume campaign

After the FREOPSKIP fix, the ARVN baseline measurement from Phase 1 is invalid (it was computed with the broken engine). Re-run the baseline.

**Step 1: Re-run baseline harness**

```bash
cd $WT && bash campaigns/fitl-arvn-agent-evolution/harness.sh
```

**Step 2: Update results.tsv and checkpoints.jsonl with correct baseline**

**Step 3: Commit corrected baseline**

```bash
cd $WT && git add data/games/fire-in-the-lake/92-agents.md
git commit --allow-empty -m "improve-loop: baseline (compositeScore=<new_value>)"
```

**Step 4: Resume the improvement loop from Phase 2, Step 0**
