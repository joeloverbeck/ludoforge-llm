import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ILLEGAL_MOVE_REASONS,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  createRng,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { decisionParamEntriesMatching, decisionParamKeysMatching } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds, normalizeDecisionParamsForMove } from '../helpers/decision-param-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';

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
  _runningHash: 0n,
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
          eff({
            forEach: {
              over: { query: 'enums', values: ['north', 'south'] },
              bind: '$region',
              effects: [
                eff({
                  chooseOne: {
                    internalDecisionId: `${decisionIdPrefix}:$mode@{$region}`,
                    bind: '$mode@{$region}',
                    options: { query: 'enums', values: ['advance', 'hold'] },
                  },
                }),
              ],
            },
          }) as GameDef['actions'][number]['effects'][number],
        ],
      },
    ],
    atomicity: 'partial',
  };

  return makeBaseDef({ actions: [action], actionPipelines: [profile] });
};

const makeDefWithRepeatedNamedChoices = (
  decisionIdPrefix = 'decision',
  bindName = '$mode',
): GameDef => {
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
    id: 'repeated-name-choice-profile',
    actionId: asActionId('nested-choice-op'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [
      {
        effects: [
          eff({
            forEach: {
              over: { query: 'enums', values: ['north', 'south'] },
              bind: '$region',
              effects: [
                eff({
                  chooseOne: {
                    internalDecisionId: `${decisionIdPrefix}:${bindName}`,
                    bind: bindName,
                    options: { query: 'enums', values: ['advance', 'hold'] },
                  },
                }),
              ],
            },
          }) as GameDef['actions'][number]['effects'][number],
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
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$target',
          bind: '$target',
          options: { query: 'enums', values: [] },
        },
      }) as ActionDef['effects'][number],
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

const makeDefWithStochasticChoice = (): GameDef => {
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
    id: 'stochastic-choice-profile',
    actionId: asActionId('nested-choice-op'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [
      {
        effects: [
          eff({
            rollRandom: {
              bind: '$roll',
              min: 1,
              max: 2,
              in: [
                eff({
                  if: {
                    when: { op: '==', left: { _t: 2 as const, ref: 'binding' as const, name: '$roll' }, right: 1 },
                    then: [
                      eff({
                        chooseOne: {
                          internalDecisionId: 'decision:$alpha',
                          bind: '$alpha',
                          options: { query: 'enums', values: ['a1', 'a2'] },
                        },
                      }) as GameDef['actions'][number]['effects'][number],
                    ],
                    else: [
                      eff({
                        chooseOne: {
                          internalDecisionId: 'decision:$beta',
                          bind: '$beta',
                          options: { query: 'enums', values: ['b1', 'b2'] },
                        },
                      }) as GameDef['actions'][number]['effects'][number],
                    ],
                  },
                }) as GameDef['actions'][number]['effects'][number],
              ],
            },
          }) as GameDef['actions'][number]['effects'][number],
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

    assert.equal(resolved.params['decision:$mode@{$region}::$mode@north[0]'], 'advance');
    assert.equal(resolved.params['decision:$mode@{$region}::$mode@south[1]'], 'advance');
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

    assert.equal(resolved.params['decision:$mode@{$region}::$mode@north[0]'], 'hold');
    assert.equal(resolved.params['decision:$mode@{$region}::$mode@south[1]'], 'hold');
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
      return decisionParamEntriesMatching(resolved.params, { resolvedBindPattern: /^\$mode@/u })
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
        'decision:$mode@{$region}::$mode@north[0]': 'hold',
        'decision:$mode@{$region}::$mode@south[1]': 'hold',
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

    assert.equal(resolved.params['decision:$mode@{$region}::$mode@north[0]'], 'hold');
    assert.equal(resolved.params['decision:$mode@{$region}::$mode@south[1]'], 'hold');
  });

  it('requires canonical decision keys for repeated nested choices', () => {
    const baseline = normalizeDecisionParamsForMove(
      makeDefWithRepeatedNamedChoices(),
      makeBaseState(),
      makeMove(),
    );
    const repeatedDecisionIds = decisionParamKeysMatching(baseline.params, { resolvedBind: '$mode' });
    assert.deepEqual(repeatedDecisionIds, ['$mode[0]', '$mode[1]']);

    const resolved = normalizeDecisionParamsForMove(
      makeDefWithRepeatedNamedChoices(),
      makeBaseState(),
      makeMove({
        [repeatedDecisionIds[0]!]: 'hold',
        [repeatedDecisionIds[1]!]: 'advance',
      }),
    );

    const repeatedChoices = decisionParamEntriesMatching(resolved.params, { resolvedBind: '$mode' })
      .map((entry) => String(entry[1]));
    assert.deepEqual(repeatedChoices, ['hold', 'advance']);
  });

  it('rejects alias-style indexed bind params for repeated nested choices', () => {
    assert.throws(
      () =>
        normalizeDecisionParamsForMove(
          makeDefWithRepeatedNamedChoices(),
          makeBaseState(),
          makeMove({
            '$mode#1': 'hold',
            '$mode#2': 'advance',
          }),
        ),
      /Could not normalize decision params/,
    );
  });

  it('rejects synthetic #1 suffixes on canonical repeated decision keys', () => {
    const baseline = normalizeDecisionParamsForMove(
      makeDefWithRepeatedNamedChoices(),
      makeBaseState(),
      makeMove(),
    );
    const repeatedDecisionIds = decisionParamKeysMatching(baseline.params, { resolvedBind: '$mode' });
    assert.equal(repeatedDecisionIds.length, 2);

    assert.throws(
      () =>
        normalizeDecisionParamsForMove(
          makeDefWithRepeatedNamedChoices(),
          makeBaseState(),
          makeMove({
            [`${repeatedDecisionIds[0]}#1`]: 'hold',
            [`${repeatedDecisionIds[1]}#1`]: 'advance',
          }),
        ),
      /Could not normalize decision params/,
    );
  });

  it('rejects macro alias params and requires canonical macro-expanded decision keys', () => {
    const baseline = normalizeDecisionParamsForMove(
      makeDefWithRepeatedNamedChoices('decision', '$__macro_caps__bonusSpace'),
      makeBaseState(),
      makeMove(),
    );
    const repeatedDecisionIds = decisionParamKeysMatching(baseline.params, { resolvedBind: '$__macro_caps__bonusSpace' });
    assert.deepEqual(repeatedDecisionIds, ['$__macro_caps__bonusSpace[0]', '$__macro_caps__bonusSpace[1]']);

    const resolved = normalizeDecisionParamsForMove(
      makeDefWithRepeatedNamedChoices('decision', '$__macro_caps__bonusSpace'),
      makeBaseState(),
      makeMove({
        [repeatedDecisionIds[0]!]: 'hold',
        [repeatedDecisionIds[1]!]: 'advance',
      }),
    );

    const repeatedChoices = decisionParamEntriesMatching(resolved.params, { resolvedBind: '$__macro_caps__bonusSpace' })
      .map((entry) => String(entry[1]));
    assert.deepEqual(repeatedChoices, ['hold', 'advance']);

    assert.throws(
      () =>
        normalizeDecisionParamsForMove(
          makeDefWithRepeatedNamedChoices('decision', '$__macro_caps__bonusSpace'),
          makeBaseState(),
          makeMove({
            '$bonusSpace#1': 'hold',
            '$bonusSpace#2': 'advance',
          }),
        ),
      /Could not normalize decision params/,
    );
  });

  it('completes stochastic branch-local decisions and persists the sampled binding', () => {
    const resolved = normalizeDecisionParamsForMove(
      makeDefWithStochasticChoice(),
      makeBaseState(),
      makeMove(),
      { rng: createRng(14n) },
    );

    assert.equal(typeof resolved.params.$roll, 'number');
    if (resolved.params.$roll === 1) {
      assert.equal(resolved.params['$alpha'], 'a1');
      assert.equal(Object.prototype.hasOwnProperty.call(resolved.params, '$beta'), false);
      return;
    }

    assert.equal(resolved.params.$roll, 2);
    assert.equal(resolved.params['$beta'], 'b1');
    assert.equal(Object.prototype.hasOwnProperty.call(resolved.params, '$alpha'), false);
  });

  it('returns original move unchanged when empty domain makes action illegal', () => {
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
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: [] },
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
          limits: [],
        },
      ],
    });

    const originalMove = makeMove();
    const result = normalizeDecisionParamsForMove(unresolvedDef, makeBaseState(), originalMove);
    assert.equal(result, originalMove);
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
