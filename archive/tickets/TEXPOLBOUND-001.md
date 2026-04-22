# TEXPOLBOUND-001: Restore Texas Authored-Policy Tournament Boundedness and Multi-Hand Progress

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Texas tournament flow witness, microturn decision application, authored-policy simulation
**Deps**: `docs/FOUNDATIONS.md`, `archive/specs/140-microturn-native-decision-protocol.md`, `specs/141-runtime-cache-run-boundary.md`

## Problem

PR 224 introduces a real Texas Hold'em behavioral regression in authored-policy simulation:

1. `engine-e2e-all` fails because the 2-player card-lifecycle witness now reaches only `handsPlayed=1`, so the deck-recycling test no longer observes multi-hand play.
2. The authored-policy tournament witness no longer terminates for larger tables. The current CI run shows:
   - `playerCount=6` stops at `maxTurns` after roughly 56s
   - `playerCount=10` stops at `maxTurns` after roughly 86s
3. A direct local reproduction on `2026-04-22` shows:
   - `playerCount=2, seed=102` now terminates after a single hand
   - `playerCount=6, seed=106` and `playerCount=10, seed=9` no longer satisfy the test’s `stopReason === 'terminal'` contract

This is not a CI-plumbing issue. It is a game-behavior regression in a shipped cross-game witness, so it blocks Foundations `#5`, `#10`, `#15`, and `#16`.

## Assumption Reassessment (2026-04-22)

1. The failure is live in the branch PR checks, not historical only: `engine-e2e-all` is red in PR 224, with the failing assertions in `texas-holdem-card-lifecycle.test.ts` and `texas-holdem-tournament.test.ts`.
2. The regression is not limited to test expectations. Local reproduction shows the authored-policy run itself changed shape: the 2-player seed now ends after one hand, and larger-table tournaments fail to reach terminal within the existing bounded witness.
3. The issue is not explained by workflow-only timeout drift. The failing lane is a correctness regression under the same engine entry points used by clients and simulators.

## Architecture Check

1. The fix must restore correct tournament semantics at the engine/microturn boundary, not by weakening the Texas tests or inflating `maxTurns` budgets. The current witnesses are proving real user-visible behavior.
2. The repair must remain engine-agnostic. Texas-specific rules stay authored in the production GameSpecDoc; the kernel/simulator/policy layers may only fix generic decision publication, turn retirement, or authored-policy execution semantics.
3. No backwards-compatibility shim is allowed. The winning path is a truthful correction to the current microturn-native tournament flow, with old behavior re-established by the authoritative engine path rather than aliases or legacy branches.

## What to Change

### 1. Trace the authored-policy tournament regression to the first wrong decision sequence

Use the failing seeds from the current witnesses to isolate where post-Spec-140 microturn execution diverges from the pre-regression tournament flow:

- `playerCount=2, seed=102`
- `playerCount=6, seed=106`
- `playerCount=10, seed=9`

Compare:

- hand cleanup and next-hand bootstrap
- elimination and `activePlayers` updates
- blind/order advancement
- turn retirement and terminal evaluation timing

The goal is to identify the first semantic divergence that causes premature one-hand termination for heads-up play and runaway `maxTurns` behavior for larger tables.

### 2. Restore the multi-hand / terminal contract through the authoritative engine path

Patch the responsible generic engine seam so authored-policy Texas runs recover these contracts:

- 2-player seeded runs can progress across multiple hands when neither player is eliminated immediately
- larger-table authored-policy tournaments reach `terminal` instead of stalling at `maxTurns`
- card zones still conserve 52 cards across the repaired flow

Candidate areas include:

- microturn publication/application ordering
- turn retirement / hand retirement lifecycle
- tournament hand bootstrap and elimination timing
- policy-agent choice handling if it is selecting a semantically wrong published decision

## Files to Touch

- `packages/engine/src/kernel/**` (modify)
- `packages/engine/src/sim/**` (modify)
- `packages/engine/src/agents/**` (modify, if the first wrong authored-policy choice originates there)
- `data/games/texas-holdem/92-agents.md` (modify if the live authored policy encoding itself is the remaining tournament-boundary cause)
- `packages/engine/test/e2e/texas-holdem-card-lifecycle.test.ts` (modify only if coverage needs sharpening after the engine fix)
- `packages/engine/test/e2e/texas-holdem-tournament.test.ts` (modify only if coverage needs sharper diagnostics, not weaker expectations)
- `packages/engine/test/unit/agents/policy-eval-grouping.test.ts` (add focused regression proof for grouped parameterized move selection)

## Out of Scope

- Raising workflow timeouts as the primary fix
- Reclassifying Texas tournament witnesses as non-blocking
- Introducing Texas-specific branches in engine code

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/e2e/texas-holdem-card-lifecycle.test.ts` proves that the 2-player witness again spans multiple hands and preserves deck recycling.
2. `packages/engine/test/e2e/texas-holdem-tournament.test.ts` proves the authored-policy tournament reaches `terminal` for the current 2/3/6/10-player witness seeds.
3. Existing suite: `pnpm -F @ludoforge/engine test:e2e:all`

### Invariants

1. Texas tournament progression remains expressed through published atomic microturn decisions; no client-only shortcut path is introduced.
2. Hand lifecycle, elimination, and terminal outcome semantics remain deterministic for identical GameDef, seed, and agent lineup.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/texas-holdem-card-lifecycle.test.ts` — keep the multi-hand deck-recycling witness as the regression proof for the one-hand failure.
2. `packages/engine/test/e2e/texas-holdem-tournament.test.ts` — keep the authored-policy 2/3/6/10-player terminal witness and add sharper diagnostics only if needed to prove the repaired flow.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/e2e/texas-holdem-card-lifecycle.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/e2e/texas-holdem-tournament.test.js`
4. `pnpm -F @ludoforge/engine test:e2e:all`

## Outcome

- Completion date: 2026-04-22
- `ticket corrections applied`: `engine-only repair -> generic policy-agent action-selection correction plus authored Texas policy weight correction`
- `implemented`: removed action-id grouping from live action-selection policy evaluation, preserved deterministic grouped-representative behavior under unit proof, and reduced the authored Texas `foldWhenBadPotOdds` weight so 6/10-player tournaments no longer degenerate into perpetual preflop fold trains.
- `deviations from original plan`: the live fix did not require kernel or simulator changes; the truthful boundary was generic policy-agent selection plus authored Texas policy data.
- `verification set`: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-eval-grouping.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/e2e/texas-holdem-card-lifecycle.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/e2e/texas-holdem-tournament.test.js`; `pnpm -F @ludoforge/engine test:e2e:all`
- `proof gaps`: none
