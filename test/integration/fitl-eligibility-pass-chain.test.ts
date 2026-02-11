import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPhaseId, asPlayerId, initialState, type GameDef, type Move } from '../../src/kernel/index.js';

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
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    turnFlow: {
      cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
      eligibility: { factions: ['0', '1', '2', '3'], overrideWindows: [] },
      optionMatrix: [],
      passRewards: [
        { factionClass: '0', resource: 'res0', amount: 1 },
        { factionClass: '1', resource: 'res1', amount: 3 },
      ],
      durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
    },
    actions: [
      {
        id: asActionId('pass'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operate'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'ops', delta: 1 } }],
        limits: [],
      },
    ],
    triggers: [],
    endConditions: [],
  }) as unknown as GameDef;

describe('FITL eligibility/pass-chain integration', () => {
  it('scans candidates deterministically, applies pass rewards, and resets on rightmost pass', () => {
    const def = createDef();
    const passMove: Move = { actionId: asActionId('pass'), params: {} };
    const start = initialState(def, 19, 4);

    assert.equal(start.activePlayer, asPlayerId(0));
    assert.equal(start.turnFlow?.currentCard.firstEligible, '0');
    assert.equal(start.turnFlow?.currentCard.secondEligible, '1');

    const first = applyMove(def, start, passMove).state;
    assert.equal(first.activePlayer, asPlayerId(1));
    assert.equal(first.globalVars.res0, 1);
    assert.equal(first.turnFlow?.currentCard.firstEligible, '1');
    assert.equal(first.turnFlow?.currentCard.secondEligible, '2');

    const second = applyMove(def, first, passMove).state;
    assert.equal(second.activePlayer, asPlayerId(2));
    assert.equal(second.globalVars.res1, 3);
    assert.equal(second.turnFlow?.currentCard.firstEligible, '2');
    assert.equal(second.turnFlow?.currentCard.secondEligible, '3');

    const third = applyMove(def, second, passMove).state;
    assert.equal(third.activePlayer, asPlayerId(3));
    assert.equal(third.turnFlow?.currentCard.firstEligible, '3');
    assert.equal(third.turnFlow?.currentCard.secondEligible, null);

    const fourth = applyMove(def, third, passMove).state;
    assert.equal(fourth.activePlayer, asPlayerId(0));
    assert.equal(fourth.turnFlow?.currentCard.firstEligible, '0');
    assert.equal(fourth.turnFlow?.currentCard.secondEligible, '1');
    assert.equal(fourth.turnFlow?.currentCard.nonPassCount, 0);
    assert.deepEqual(fourth.turnFlow?.currentCard.passedFactions, []);
  });

  it('ends the card after two non-pass actions and resets candidate slots', () => {
    const def = createDef();
    const operateMove: Move = { actionId: asActionId('operate'), params: {} };
    const start = initialState(def, 23, 4);

    const first = applyMove(def, start, operateMove).state;
    assert.equal(first.globalVars.ops, 1);
    assert.equal(first.activePlayer, asPlayerId(1));
    assert.equal(first.turnFlow?.currentCard.nonPassCount, 1);
    assert.equal(first.turnFlow?.currentCard.firstEligible, '1');
    assert.equal(first.turnFlow?.currentCard.secondEligible, '2');

    const second = applyMove(def, first, operateMove).state;
    assert.equal(second.globalVars.ops, 2);
    assert.equal(second.activePlayer, asPlayerId(0));
    assert.equal(second.turnFlow?.currentCard.nonPassCount, 0);
    assert.equal(second.turnFlow?.currentCard.firstEligible, '0');
    assert.equal(second.turnFlow?.currentCard.secondEligible, '1');
    assert.deepEqual(second.turnFlow?.currentCard.actedFactions, []);
  });
});
