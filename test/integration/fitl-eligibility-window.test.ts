import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';

const selfOverride = 'eligibilityOverride:self:eligible:remain-eligible';
const targetOverride = 'eligibilityOverride:2:ineligible:force-ineligible';
const noOverride = 'none';
const freeOpDirective = 'freeOpGranted:2';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-eligibility-window-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    turnFlow: {
      cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
      eligibility: {
        factions: ['0', '1', '2', '3'],
        overrideWindows: [
          { id: 'remain-eligible', duration: 'nextCard' },
          { id: 'force-ineligible', duration: 'nextCard' },
        ],
      },
      optionMatrix: [{ first: 'event', second: ['operation'] }],
      passRewards: [],
      durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
    },
    actions: [
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [
          { name: 'selfOverride', domain: { query: 'enums', values: [noOverride, selfOverride] } },
          { name: 'targetOverride', domain: { query: 'enums', values: [noOverride, targetOverride] } },
          { name: 'freeOp', domain: { query: 'enums', values: [noOverride, freeOpDirective] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    endConditions: [],
  }) as unknown as GameDef;

describe('FITL eligibility window integration', () => {
  it('applies declared nextCard overrides at card end', () => {
    const def = createDef();
    const start = initialState(def, 41, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { selfOverride, targetOverride, freeOp: noOverride },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} });

    assert.deepEqual(second.state.turnFlow?.eligibility, { '0': true, '1': false, '2': false, '3': true });
    assert.equal(second.state.turnFlow?.currentCard.firstEligible, '0');
    assert.equal(second.state.turnFlow?.currentCard.secondEligible, '3');
  });

  it('does not mutate eligibility for non-executing factions when free-op metadata is present', () => {
    const def = createDef();
    const start = initialState(def, 43, 4);

    const firstMove: Move = {
      actionId: asActionId('event'),
      params: { selfOverride: noOverride, targetOverride: noOverride, freeOp: freeOpDirective },
    };
    const first = applyMove(def, start, firstMove).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;

    assert.deepEqual(second.turnFlow?.eligibility, { '0': false, '1': false, '2': true, '3': true });
    assert.equal(second.activePlayer, asPlayerId(2));
    assert.equal(second.turnFlow?.currentCard.firstEligible, '2');
    assert.equal(second.turnFlow?.currentCard.secondEligible, '3');
  });
});
