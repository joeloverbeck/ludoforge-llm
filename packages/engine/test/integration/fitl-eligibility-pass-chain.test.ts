import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPhaseId, asPlayerId, initialState, type GameDef, type Move } from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-eligibility-pass-chain-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'res0', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'res1', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'ops', type: 'int', init: 0, min: 0, max: 99 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1', '2', '3'], overrideWindows: [] },
          optionMatrix: [],
          passRewards: [
            { seatClass: '0', resource: 'res0', amount: 1 },
            { seatClass: '1', resource: 'res1', amount: 3 },
          ],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'ops', delta: 1 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('FITL eligibility/pass-chain integration', () => {
  it('scans candidates deterministically, applies pass rewards, and resets on rightmost pass', () => {
    const def = createDef();
    const passMove: Move = { actionId: asActionId('pass'), params: {} };
    const start = initialState(def, 19, 4).state;

    assert.equal(start.activePlayer, asPlayerId(0));
    assert.equal(requireCardDrivenRuntime(start).currentCard.firstEligible, '0');
    assert.equal(requireCardDrivenRuntime(start).currentCard.secondEligible, '1');

    const first = applyMove(def, start, passMove).state;
    assert.equal(first.activePlayer, asPlayerId(1));
    assert.equal(first.globalVars.res0, 1);
    assert.equal(requireCardDrivenRuntime(first).currentCard.firstEligible, '1');
    assert.equal(requireCardDrivenRuntime(first).currentCard.secondEligible, '2');

    const second = applyMove(def, first, passMove).state;
    assert.equal(second.activePlayer, asPlayerId(2));
    assert.equal(second.globalVars.res1, 3);
    assert.equal(requireCardDrivenRuntime(second).currentCard.firstEligible, '2');
    assert.equal(requireCardDrivenRuntime(second).currentCard.secondEligible, '3');

    const third = applyMove(def, second, passMove).state;
    assert.equal(third.activePlayer, asPlayerId(3));
    assert.equal(requireCardDrivenRuntime(third).currentCard.firstEligible, '3');
    assert.equal(requireCardDrivenRuntime(third).currentCard.secondEligible, null);

    const fourth = applyMove(def, third, passMove).state;
    assert.equal(fourth.activePlayer, asPlayerId(0));
    assert.equal(requireCardDrivenRuntime(fourth).currentCard.firstEligible, '0');
    assert.equal(requireCardDrivenRuntime(fourth).currentCard.secondEligible, '1');
    assert.equal(requireCardDrivenRuntime(fourth).currentCard.nonPassCount, 0);
    assert.deepEqual(requireCardDrivenRuntime(fourth).currentCard.passedSeats, []);
  });

  it('ends the card after two non-pass actions and resets candidate slots', () => {
    const def = createDef();
    const operateMove: Move = { actionId: asActionId('operate'), params: {} };
    const start = initialState(def, 23, 4).state;

    const first = applyMove(def, start, operateMove).state;
    assert.equal(first.globalVars.ops, 1);
    assert.equal(first.activePlayer, asPlayerId(1));
    assert.equal(requireCardDrivenRuntime(first).currentCard.nonPassCount, 1);
    assert.equal(requireCardDrivenRuntime(first).currentCard.firstEligible, '1');
    assert.equal(requireCardDrivenRuntime(first).currentCard.secondEligible, '2');

    const second = applyMove(def, first, operateMove).state;
    assert.equal(second.globalVars.ops, 2);
    assert.equal(second.activePlayer, asPlayerId(2));
    assert.equal(requireCardDrivenRuntime(second).currentCard.nonPassCount, 0);
    assert.equal(requireCardDrivenRuntime(second).currentCard.firstEligible, '2');
    assert.equal(requireCardDrivenRuntime(second).currentCard.secondEligible, '3');
    assert.deepEqual(requireCardDrivenRuntime(second).eligibility, { '0': false, '1': false, '2': true, '3': true });
    assert.deepEqual(requireCardDrivenRuntime(second).currentCard.actedSeats, []);
  });
});
