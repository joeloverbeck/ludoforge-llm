import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, assertValidatedGameDef, initialState, legalMoves } from '../../src/kernel/index.js';
import type { GameState } from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  firstLegalPolicy,
  runRuntimeSmokeGate,
  seededRandomLegalPolicy,
  selectorPolicy,
  type RuntimeSmokeInvariant,
} from '../helpers/runtime-smoke-harness.js';

const compileTexasDef = () => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const totalCardsAcrossZones = (zones: Readonly<Record<string, readonly unknown[]>>): number =>
  Object.values(zones).reduce((sum, entries) => sum + entries.length, 0);

const totalChipsInPlay = (state: GameState): number => {
  const pot = Number(state.globalVars.pot ?? 0);
  const stacks = Array.from({ length: state.playerCount }, (_unused, index) => {
    const raw = state.perPlayerVars[String(index)]?.chipStack;
    return Number(raw ?? 0);
  });
  return stacks.reduce((sum, value) => sum + value, 0) + pot;
};

const playersInHandFromFlags = (state: GameState): number => {
  let count = 0;
  for (let player = 0; player < state.playerCount; player += 1) {
    const vars = state.perPlayerVars[String(player)];
    if (vars?.eliminated === false && vars.handActive === true) {
      count += 1;
    }
  }
  return count;
};

describe('texas runtime bootstrap and position flow', () => {
  it('initializes into a playable preflop state with card conservation', () => {
    const def = compileTexasDef();
    const seeded = initialState(def, 23, 4).state;
    const state = advanceToDecisionPoint(def, seeded);
    const moves = legalMoves(def, state);

    assert.equal(state.currentPhase, 'preflop');
    assert.equal(state.globalVars.activePlayers, 4);
    assert.equal('playersInHand' in state.globalVars, false);
    assert.equal(playersInHandFromFlags(state), 4);
    assert.equal(totalCardsAcrossZones(state.zones), 52);
    assert.equal(moves.length > 0, true);
  });

  it('advances active actor after an opening preflop action and keeps actingPosition synced', () => {
    const def = compileTexasDef();
    const seeded = initialState(def, 29, 4).state;
    const state = advanceToDecisionPoint(def, seeded);
    const moves = legalMoves(def, state);
    assert.equal(moves.length > 0, true);

    const next = applyMove(def, state, moves[0]!);
    const activeAdvanced =
      next.state.activePlayer !== state.activePlayer
      || next.state.currentPhase !== state.currentPhase;
    assert.equal(activeAdvanced, true);
    assert.equal(Number(next.state.activePlayer), next.state.globalVars.actingPosition);
  });

  it('applies heads-up blind and opening-order policy (button=SB, preflop button acts first)', () => {
    const def = compileTexasDef();
    const seeded = initialState(def, 31, 2).state;
    const state = advanceToDecisionPoint(def, seeded);

    const dealerSeat = state.globalVars.dealerSeat;
    const bbSeat = dealerSeat === 0 ? 1 : 0;

    assert.equal(state.currentPhase, 'preflop');
    assert.equal(state.globalVars.activePlayers, 2);
    assert.equal(state.globalVars.actingPosition, dealerSeat);
    assert.equal(Number(state.activePlayer), dealerSeat);
    assert.equal(state.perPlayerVars[String(dealerSeat)]?.streetBet, state.globalVars.smallBlind);
    assert.equal(state.perPlayerVars[String(bbSeat)]?.streetBet, state.globalVars.bigBlind);
  });

  it('ends a heads-up hand on fold without traversing flop/turn/river side effects', () => {
    const def = compileTexasDef();
    const seeded = initialState(def, 43, 2).state;
    const state = advanceToDecisionPoint(def, seeded);
    const foldMove = legalMoves(def, state).find((move) => move.actionId === 'fold');
    assert.ok(foldMove, 'expected fold to be legal in opening preflop state');

    const next = applyMove(def, state, foldMove!);
    const nextState = next.state;

    const deckCount = nextState.zones['deck:none']?.length ?? 0;
    const burnCount = nextState.zones['burn:none']?.length ?? 0;
    const communityCount = nextState.zones['community:none']?.length ?? 0;

    assert.equal(nextState.currentPhase, 'preflop');
    assert.equal(deckCount, 48);
    assert.equal(burnCount, 0);
    assert.equal(communityCount, 0);
  });

  const smokeConfigs = [
    { seed: 37, playerCount: 2 },
    { seed: 41, playerCount: 4 },
  ] as const;

  const smokePolicies = [
    { policy: firstLegalPolicy(), minAppliedMoves: 12 },
    { policy: seededRandomLegalPolicy(), minAppliedMoves: 4 },
    {
      policy: selectorPolicy('max-action-id', ({ moves }) => {
        let selectedIndex = 0;
        for (let index = 1; index < moves.length; index += 1) {
          if (String(moves[index]!.actionId) > String(moves[selectedIndex]!.actionId)) {
            selectedIndex = index;
          }
        }
        return selectedIndex;
      }),
      minAppliedMoves: 8,
    },
  ] as const;

  for (const config of smokeConfigs) {
    for (const policyConfig of smokePolicies) {
      const { policy, minAppliedMoves } = policyConfig;
      it(`runs deterministic smoke window with runtime invariants (seed=${config.seed}, players=${config.playerCount}, policy=${policy.id})`, () => {
        const def = compileTexasDef();
        let expectedCardCount: number | null = null;
        let expectedChipTotal: number | null = null;
        const texasInvariants: RuntimeSmokeInvariant[] = [
          {
            id: 'texas-card-conservation',
            check: ({ state }) => {
              const cardCount = totalCardsAcrossZones(state.zones);
              if (expectedCardCount === null) {
                expectedCardCount = cardCount;
              }
              assert.equal(cardCount, expectedCardCount);
            },
          },
          {
            id: 'texas-chip-conservation',
            check: ({ state }) => {
              const chipTotal = totalChipsInPlay(state);
              if (expectedChipTotal === null) {
                expectedChipTotal = chipTotal;
              }
              assert.equal(chipTotal, expectedChipTotal);
            },
          },
          {
            id: 'texas-nonnegative-stacks',
            check: ({ state, playerCount }) => {
              for (let player = 0; player < playerCount; player += 1) {
                const stack = Number(state.perPlayerVars[String(player)]?.chipStack ?? 0);
                assert.equal(stack >= 0, true, `player ${player} chipStack must remain non-negative`);
              }
            },
          },
          {
            id: 'texas-hand-state-sync',
            check: ({ state }) => {
              const activeInHand = playersInHandFromFlags(state);
              assert.equal('playersInHand' in state.globalVars, false);
              assert.equal(activeInHand >= 0, true);
              assert.equal(activeInHand <= Number(state.globalVars.activePlayers ?? 0), true);
            },
          },
        ];

        runRuntimeSmokeGate({
          def,
          seed: config.seed,
          playerCount: config.playerCount,
          maxSteps: 24,
          minAppliedMoves,
          policy,
          bootstrapState: (targetDef, seed, playerCount) => advanceToDecisionPoint(targetDef, initialState(targetDef, seed, playerCount).state),
          invariants: texasInvariants,
        });
      });
    }
  }
});
