import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ILLEGAL_MOVE_REASONS,
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
import { applyMoveWithResolvedDecisionIds, normalizeDecisionParamsForMove } from '../helpers/decision-param-helpers.js';

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
  zoneVars: {},
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

const makeDefWithNestedTemplatedChoices = (decisionIdPrefix = 'decision'): GameDef => {
  const action: ActionDef = {
    id: asActionId('nested-choice-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
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
                    internalDecisionId: `${decisionIdPrefix}:$mode@{$region}`,
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

const makeDefWithCompoundAccompanyingConstraintAndUnresolvedSa = (): GameDef => {
  const operation: ActionDef = {
    id: asActionId('operate'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };
  const train: ActionDef = {
    id: asActionId('train'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };
  const sa: ActionDef = {
    id: asActionId('sa'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [
      {
        chooseOne: {
          internalDecisionId: 'decision:$target',
          bind: '$target',
          options: { query: 'enums', values: [] },
        },
      } as ActionDef['effects'][number],
    ],
    limits: [],
  };

  return makeBaseDef({
    actions: [operation, train, sa],
    actionPipelines: [
      {
        id: 'operate-profile',
        actionId: operation.id,
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [] }],
        atomicity: 'atomic',
      },
      {
        id: 'sa-profile',
        actionId: sa.id,
        accompanyingOps: ['train'],
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: sa.effects }],
        atomicity: 'atomic',
      },
    ],
  });
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
          when: (request) => /^\$mode@/.test(request.name),
          value: 'hold',
        },
      ],
    });

    assert.equal(resolved.params['decision:$mode@{$region}::$mode@north'], 'hold');
    assert.equal(resolved.params['decision:$mode@{$region}::$mode@south'], 'hold');
  });

  it('keeps name-based overrides stable across decision-id prefix changes', () => {
    const runWithPrefix = (prefix: string): readonly string[] => {
      const resolved = normalizeDecisionParamsForMove(
        makeDefWithNestedTemplatedChoices(prefix),
        makeBaseState(),
        makeMove(),
        {
          overrides: [
            {
              when: (request) => /^\$mode@/.test(request.name),
              value: 'hold',
            },
          ],
        },
      );
      return Object.entries(resolved.params)
        .filter(([decisionId]) => decisionId.includes('::$mode@'))
        .map((entry) => String(entry[1]));
    };

    assert.deepEqual(runWithPrefix('decision'), ['hold', 'hold']);
    assert.deepEqual(runWithPrefix('decision:altPath'), ['hold', 'hold']);
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
            when: (request) => request.name.includes('$mode@'),
            value: 'advance',
          },
        ],
      },
    );

    assert.equal(resolved.params['decision:$mode@{$region}::$mode@north'], 'hold');
    assert.equal(resolved.params['decision:$mode@{$region}::$mode@south'], 'hold');
  });

  it('fails with diagnostics when canonical selection cannot resolve a pending decision', () => {
    const unresolvedDef = makeBaseDef({
      actions: [
        {
          id: asActionId('nested-choice-op'),
          actor: 'active',
          executor: 'actor',
          phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: [] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
          limits: [],
        },
      ],
    });

    assert.throws(
      () => normalizeDecisionParamsForMove(unresolvedDef, makeBaseState(), makeMove()),
      /Could not normalize decision params for actionId=nested-choice-op: unresolved decisionId=decision:\$target name=\$target type=chooseOne options=0 min=0/,
    );
  });

  it('preserves compound legality diagnostics even when SA decision normalization is unresolved', () => {
    const def = makeDefWithCompoundAccompanyingConstraintAndUnresolvedSa();
    const state = makeBaseState();

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, state, {
          actionId: asActionId('operate'),
          params: {},
          compound: {
            timing: 'after',
            specialActivity: { actionId: asActionId('sa'), params: {} },
          },
        }),
      (error: unknown) => {
        const details = error as { readonly reason?: string };
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED);
        return true;
      },
    );
  });
});
