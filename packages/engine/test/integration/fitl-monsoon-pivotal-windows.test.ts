import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  initialState,
  legalMoves,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-monsoon-pivotal-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'played:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'lookahead:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'leader:none', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
    setup: [
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
    ],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { factions: ['0', '1'], overrideWindows: [] },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          monsoon: {
            restrictedActions: [
              { actionId: 'sweep' },
              { actionId: 'airLift', maxParam: { name: 'spaces', max: 2 } },
            ],
            blockPivotal: true,
            pivotalOverrideToken: 'monsoonPivotalAllowed',
          },
          pivotal: {
            actionIds: ['pivotalEvent'],
            requirePreActionWindow: true,
          },
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
        effects: [],
        limits: [],
      },
      {
        id: asActionId('sweep'),
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
        id: asActionId('airLift'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [{ name: 'spaces', domain: { query: 'intsInRange', min: 1, max: 3 } }],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('pivotalEvent'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [{ name: 'override', domain: { query: 'enums', values: ['none', 'monsoonPivotalAllowed'] } }],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('FITL monsoon/pivotal windows integration', () => {
  it('applies monsoon restrictions and only allows configured pivotal override metadata', () => {
    const def = createDef();
    const start = initialState(def, 53, 2).state;

    assert.equal(start.zones['lookahead:none']?.[0]?.props.isCoup, true);
    assert.deepEqual(legalMoves(def, start), [
      { actionId: asActionId('pass'), params: {} },
      { actionId: asActionId('operate'), params: {} },
      { actionId: asActionId('airLift'), params: { spaces: 1 } },
      { actionId: asActionId('airLift'), params: { spaces: 2 } },
      { actionId: asActionId('pivotalEvent'), params: { override: 'monsoonPivotalAllowed' } },
    ]);
  });

  it('disallows pivotal actions once the first eligible non-pass action has resolved', () => {
    const def = createDef();
    const start = initialState(def, 59, 2).state;
    const afterFirst = applyMove(def, start, { actionId: asActionId('operate'), params: {} });

    const actions = legalMoves(def, afterFirst.state).map((move: Move) => move.actionId);
    assert.equal(actions.includes(asActionId('pivotalEvent')), false);
    assert.equal(requireCardDrivenRuntime(afterFirst.state).currentCard.nonPassCount, 1);
  });
});
