import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { normalizeDecisionParamsForMove } from '../helpers/decision-param-helpers.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
}): GameDef =>
  ({
    metadata: { id: 'decision-param-helper-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: overrides?.actions ?? [],
    actionPipelines: overrides?.actionPipelines,
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeMove = (params: Move['params'] = {}): Move => ({
  actionId: asActionId('nested-choice-op'),
  params,
});

const makeDefWithNestedTemplatedChoices = (): GameDef => {
  const action: ActionDef = {
    id: asActionId('nested-choice-op'),
    actor: 'active',
    phase: asPhaseId('main'),
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };

  const profile: ActionPipelineDef = {
    id: 'nested-choice-profile',
    actionId: asActionId('nested-choice-op'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [
      {
        effects: [
          {
            forEach: {
              over: { query: 'enums', values: ['north', 'south'] },
              bind: '$region',
              effects: [
                {
                  chooseOne: {
                    internalDecisionId: 'decision:$mode@{$region}',
                    bind: '$mode@{$region}',
                    options: { query: 'enums', values: ['advance', 'hold'] },
                  },
                },
              ],
            },
          } as GameDef['actions'][number]['effects'][number],
        ],
      },
    ],
    atomicity: 'partial',
  };

  return makeBaseDef({ actions: [action], actionPipelines: [profile] });
};

describe('decision param helper', () => {
  it('fills nested templated decision ids with deterministic defaults', () => {
    const resolved = normalizeDecisionParamsForMove(makeDefWithNestedTemplatedChoices(), makeBaseState(), makeMove());

    assert.equal(resolved.params['decision:$mode@{$region}::$mode@north'], 'advance');
    assert.equal(resolved.params['decision:$mode@{$region}::$mode@south'], 'advance');
  });

  it('supports decision-name pattern overrides', () => {
    const resolved = normalizeDecisionParamsForMove(makeDefWithNestedTemplatedChoices(), makeBaseState(), makeMove(), {
      overrides: [
        {
          match: /^\$mode@/,
          target: 'name',
          value: 'hold',
        },
      ],
    });

    assert.equal(resolved.params['decision:$mode@{$region}::$mode@north'], 'hold');
    assert.equal(resolved.params['decision:$mode@{$region}::$mode@south'], 'hold');
  });

  it('prefers explicit move params over overrides', () => {
    const resolved = normalizeDecisionParamsForMove(
      makeDefWithNestedTemplatedChoices(),
      makeBaseState(),
      makeMove({
        'decision:$mode@{$region}::$mode@north': 'hold',
        '$mode@south': 'hold',
      }),
      {
        overrides: [
          {
            match: '$mode@',
            target: 'name',
            value: 'advance',
          },
        ],
      },
    );

    assert.equal(resolved.params['decision:$mode@{$region}::$mode@north'], 'hold');
    assert.equal(resolved.params['decision:$mode@{$region}::$mode@south'], 'hold');
  });
});
