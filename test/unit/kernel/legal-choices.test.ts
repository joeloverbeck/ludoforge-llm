import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  legalChoices,
  type ActionDef,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
  type ActionPipelineDef,
} from '../../../src/kernel/index.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
  globalVars?: GameDef['globalVars'];
  mapSpaces?: GameDef['mapSpaces'];
}): GameDef =>
  ({
    metadata: { id: 'legal-choices-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: overrides?.globalVars ?? [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    actions: overrides?.actions ?? [],
    actionPipelines: overrides?.actionPipelines,
    ...(overrides?.mapSpaces === undefined ? {} : { mapSpaces: overrides.mapSpaces }),
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
    'hand:0': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

const makeMove = (actionId: string, params: Record<string, unknown> = {}): Move => ({
  actionId: asActionId(actionId),
  params: params as Move['params'],
});

describe('legalChoices()', () => {
  it('returns illegal with phaseMismatch when action phase does not match current phase', () => {
    const action: ActionDef = {
      id: asActionId('phaseLockedAction'),
      actor: 'active',
      executor: 'actor',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ currentPhase: asPhaseId('not-main') as GameState['currentPhase'] });

    const result = legalChoices(def, state, makeMove('phaseLockedAction'));
    assert.deepStrictEqual(result, { kind: 'illegal', complete: false, reason: 'phaseMismatch' });
  });

  it('returns illegal with actionLimitExceeded when action limit has been reached', () => {
    const action: ActionDef = {
      id: asActionId('limitedAction'),
      actor: 'active',
      executor: 'actor',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [{ scope: 'phase', max: 1 }],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({
      actionUsage: {
        limitedAction: {
          turnCount: 0,
          phaseCount: 1,
          gameCount: 0,
        },
      },
    });

    const result = legalChoices(def, state, makeMove('limitedAction'));
    assert.deepStrictEqual(result, { kind: 'illegal', complete: false, reason: 'actionLimitExceeded' });
  });

  it('1. simple action with no chooseOne/chooseN returns complete result', () => {
    const action: ActionDef = {
      id: asActionId('simpleAction'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        { setVar: { scope: 'global', var: 'score', value: 5 } },
      ],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    });
    const state = makeBaseState({ globalVars: { score: 0 } });
    const move = makeMove('simpleAction');

    const result = legalChoices(def, state, move);
    assert.deepStrictEqual(result, { kind: 'complete', complete: true });
  });

  it('2. action with one chooseOne returns options on first call, complete after param filled', () => {
    const action: ActionDef = {
      id: asActionId('pickColor'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$color',
            bind: '$color',
            options: { query: 'enums', values: ['red', 'blue', 'green'] },
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    // First call: no params → returns choice request
    const result1 = legalChoices(def, state, makeMove('pickColor'));
    assert.equal(result1.complete, false);
    assert.equal(result1.decisionId, 'decision:$color');
    assert.equal(result1.name, '$color');
    assert.equal(result1.type, 'chooseOne');
    assert.deepStrictEqual(result1.options, ['red', 'blue', 'green']);

    // Second call: param filled → complete
    const result2 = legalChoices(def, state, makeMove('pickColor', { 'decision:$color': 'blue' }));
    assert.deepStrictEqual(result2, { kind: 'complete', complete: true });
  });

  it('3. action with one chooseN (range mode) returns options with min/max, max clamped to domain size', () => {
    const action: ActionDef = {
      id: asActionId('pickTargets'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['a', 'b', 'c'] },
            min: 1,
            max: 10,
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoices(def, state, makeMove('pickTargets'));
    assert.equal(result.complete, false);
    assert.equal(result.name, '$targets');
    assert.equal(result.type, 'chooseN');
    assert.deepStrictEqual(result.options, ['a', 'b', 'c']);
    assert.equal(result.min, 1);
    assert.equal(result.max, 3); // clamped from 10 to domain size 3
  });

  it('3b. chooseN evaluates expression-valued min/max at decision time', () => {
    const action: ActionDef = {
      id: asActionId('pickDynamicTargets'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['a', 'b', 'c', 'd'] },
            min: { if: { when: { op: '>', left: { ref: 'gvar', var: 'dynamicMin' }, right: 0 }, then: 1, else: 0 } },
            max: { ref: 'gvar', var: 'dynamicMax' },
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
      globalVars: [
        { name: 'dynamicMin', type: 'int', init: 0, min: 0, max: 5 },
        { name: 'dynamicMax', type: 'int', init: 0, min: 0, max: 5 },
      ],
    });
    const state = makeBaseState({ globalVars: { dynamicMin: 1, dynamicMax: 2 } });

    const result = legalChoices(def, state, makeMove('pickDynamicTargets'));
    assert.equal(result.complete, false);
    assert.equal(result.type, 'chooseN');
    assert.equal(result.min, 1);
    assert.equal(result.max, 2);
  });

  it('3c. chooseN throws when expression-valued max is non-integer or negative', () => {
    const action: ActionDef = {
      id: asActionId('badDynamicBounds'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['a', 'b', 'c'] },
            max: true as unknown as number,
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    assert.throws(
      () => legalChoices(def, state, makeMove('badDynamicBounds')),
      (error: unknown) => error instanceof Error && error.message.includes('maximum cardinality must evaluate'),
    );
  });

  it('4. action with multiple sequential chooseOnes returns them one at a time', () => {
    const action: ActionDef = {
      id: asActionId('multiChoice'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$first',
            bind: '$first',
            options: { query: 'enums', values: ['x', 'y'] },
          },
        },
        {
          chooseOne: {
            internalDecisionId: 'decision:$second',
            bind: '$second',
            options: { query: 'enums', values: ['a', 'b', 'c'] },
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    // No params → first choice
    const r1 = legalChoices(def, state, makeMove('multiChoice'));
    assert.equal(r1.name, '$first');
    assert.equal(r1.complete, false);

    // First param filled → second choice
    const r2 = legalChoices(def, state, makeMove('multiChoice', { 'decision:$first': 'x' }));
    assert.equal(r2.name, '$second');
    assert.equal(r2.complete, false);

    // Both params filled → complete
    const r3 = legalChoices(def, state, makeMove('multiChoice', { 'decision:$first': 'x', 'decision:$second': 'b' }));
    assert.deepStrictEqual(r3, { kind: 'complete', complete: true });
  });

  it('5. invalid selection in params throws descriptive error', () => {
    const action: ActionDef = {
      id: asActionId('pickColor'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$color',
            bind: '$color',
            options: { query: 'enums', values: ['red', 'blue'] },
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    assert.throws(
      () => legalChoices(def, state, makeMove('pickColor', { 'decision:$color': 'purple' })),
      (err: Error) => {
        assert.ok(err.message.includes('invalid selection'));
        assert.ok(err.message.includes('$color'));
        return true;
      },
    );
  });

  it('6. chooseOne inside if.then only appears when condition is true', () => {
    const action: ActionDef = {
      id: asActionId('conditionalChoice'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          if: {
            when: {
              op: '>=',
              left: { ref: 'gvar', var: 'score' },
              right: 5,
            },
            then: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$bonus',
                  bind: '$bonus',
                  options: { query: 'enums', values: ['gold', 'silver'] },
                },
              },
            ],
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
    });

    // Condition false (score < 5) → complete (no choice)
    const stateLow = makeBaseState({ globalVars: { score: 2 } });
    const r1 = legalChoices(def, stateLow, makeMove('conditionalChoice'));
    assert.deepStrictEqual(r1, { kind: 'complete', complete: true });

    // Condition true (score >= 5) → choice appears
    const stateHigh = makeBaseState({ globalVars: { score: 7 } });
    const r2 = legalChoices(def, stateHigh, makeMove('conditionalChoice'));
    assert.equal(r2.complete, false);
    assert.equal(r2.name, '$bonus');
    assert.deepStrictEqual(r2.options, ['gold', 'silver']);
  });

  it('7. chooseN with min >= 1 and empty domain returns ChoiceRequest with options: []', () => {
    const action: ActionDef = {
      id: asActionId('emptyDomain'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'tokensInZone', zone: 'board:none' },
            min: 1,
            max: 5,
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ zones: { 'board:none': [], 'hand:0': [] } });

    const result = legalChoices(def, state, makeMove('emptyDomain'));
    assert.equal(result.complete, false);
    assert.equal(result.name, '$targets');
    assert.equal(result.type, 'chooseN');
    assert.deepStrictEqual(result.options, []);
    assert.equal(result.min, 1);
    assert.equal(result.max, 0); // clamped to domain size 0
  });

  it('8. legalChoices evaluates let bindings so subsequent options queries reference them correctly', () => {
    const action: ActionDef = {
      id: asActionId('letThenChoose'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          let: {
            bind: '$threshold',
            value: 3,
            in: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$pick',
                  bind: '$pick',
                  options: {
                    query: 'intsInRange',
                    min: 1,
                    max: 3,
                  },
                },
              },
            ],
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoices(def, state, makeMove('letThenChoose'));
    assert.equal(result.complete, false);
    assert.equal(result.name, '$pick');
    assert.equal(result.type, 'chooseOne');
    assert.deepStrictEqual(result.options, [1, 2, 3]);
  });

  it('9. legalChoices does NOT walk rollRandom.in effects (returns complete before inner choices)', () => {
    const action: ActionDef = {
      id: asActionId('randomThenChoose'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          rollRandom: {
            bind: '$roll',
            min: 1,
            max: 6,
            in: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$innerChoice',
                  bind: '$innerChoice',
                  options: { query: 'enums', values: ['a', 'b'] },
                },
              },
            ],
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    // rollRandom stops traversal, inner chooseOne not reached
    const result = legalChoices(def, state, makeMove('randomThenChoose'));
    assert.deepStrictEqual(result, { kind: 'complete', complete: true });
  });

  it('10. action with chooseN exact-n mode returns options with correct cardinality constraint', () => {
    const action: ActionDef = {
      id: asActionId('exactPick'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            internalDecisionId: 'decision:$exactTargets',
            bind: '$exactTargets',
            options: { query: 'enums', values: ['alpha', 'beta', 'gamma', 'delta'] },
            n: 2,
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoices(def, state, makeMove('exactPick'));
    assert.equal(result.complete, false);
    assert.equal(result.name, '$exactTargets');
    assert.equal(result.type, 'chooseN');
    assert.deepStrictEqual(result.options, ['alpha', 'beta', 'gamma', 'delta']);
    assert.equal(result.min, 2);
    assert.equal(result.max, 2);

    // Filled with valid exact-2 selection → complete
    const r2 = legalChoices(def, state, makeMove('exactPick', { 'decision:$exactTargets': ['alpha', 'gamma'] }));
    assert.deepStrictEqual(r2, { kind: 'complete', complete: true });
  });

  describe('operation profile support', () => {
    it('walks stages stage effects for profiled actions', () => {
      const action: ActionDef = {
        id: asActionId('trainOp'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      };

      const profile: ActionPipelineDef = {
        id: 'trainProfile',
        actionId: asActionId('trainOp'),
        legality: null,
        costValidation: null, costEffects: [],
        targeting: {},
        stages: [
          {
            stage: 'selectSpaces',
            effects: [
              {
                chooseN: {
                  internalDecisionId: 'decision:$spaces',
                  bind: '$spaces',
                  options: { query: 'enums', values: ['saigon', 'hue', 'danang'] },
                  min: 1,
                  max: 10,
                },
              } as EffectAST,
            ],
          },
        ],
        atomicity: 'partial',
      };

      const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
      const state = makeBaseState();

      const result = legalChoices(def, state, makeMove('trainOp'));
      assert.equal(result.complete, false);
      assert.equal(result.name, '$spaces');
      assert.equal(result.type, 'chooseN');
      assert.deepStrictEqual(result.options, ['saigon', 'hue', 'danang']);
      assert.equal(result.min, 1);
      assert.equal(result.max, 3); // clamped from 10
    });

    it('returns illegal when legality fails for profiled action', () => {
      const action: ActionDef = {
        id: asActionId('blockedOp'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      };

      const profile: ActionPipelineDef = {
        id: 'blockedProfile',
        actionId: asActionId('blockedOp'),
        legality: {
            op: '>=',
            left: { ref: 'gvar', var: 'resources' },
            right: 5,
          },
        costValidation: null, costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$target',
                  bind: '$target',
                  options: { query: 'enums', values: ['a', 'b'] },
                },
              },
            ],
          },
        ],
        atomicity: 'partial',
      };

      const def = makeBaseDef({
        actions: [action],
        actionPipelines: [profile],
        globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 100 }],
      });
      const state = makeBaseState({ globalVars: { resources: 2 } });

      const result = legalChoices(def, state, makeMove('blockedOp'));
      assert.deepStrictEqual(result, { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' });
    });

    it('throws contextual runtime error when profile legality evaluation fails', () => {
      const action: ActionDef = {
        id: asActionId('brokenLegalityOp'),
        actor: 'active',
        executor: 'actor',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      };

      const profile: ActionPipelineDef = {
        id: 'brokenLegalityProfile',
        actionId: asActionId('brokenLegalityOp'),
        legality: { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [],
        atomicity: 'atomic',
      };

      const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
      const state = makeBaseState();

      assert.throws(
        () => legalChoices(def, state, makeMove('brokenLegalityOp')),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
          assert.equal(details.code, 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED');
          assert.equal(details.context?.actionId, asActionId('brokenLegalityOp'));
          assert.equal(details.context?.profileId, 'brokenLegalityProfile');
          assert.equal(details.context?.predicate, 'legality');
          return true;
        },
      );
    });

    it('returns illegal when pipelines exist but none are applicable', () => {
      const action: ActionDef = {
        id: asActionId('strictNoFallbackOp'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$fallbackChoice',
              bind: '$fallbackChoice',
              options: { query: 'enums', values: ['fallback'] },
            },
          } as EffectAST,
        ],
        limits: [],
      };

      const profile: ActionPipelineDef = {
        id: 'strictNoFallbackProfile',
        actionId: asActionId('strictNoFallbackOp'),
        applicability: { op: '==', left: { ref: 'activePlayer' }, right: '1' },
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$profileChoice',
                  bind: '$profileChoice',
                  options: { query: 'enums', values: ['profile'] },
                },
              } as EffectAST,
            ],
          },
        ],
        atomicity: 'partial',
      };

      const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
      const state = makeBaseState({ activePlayer: asPlayerId(0) });

      const result = legalChoices(def, state, makeMove('strictNoFallbackOp'));
      assert.deepStrictEqual(result, { kind: 'illegal', complete: false, reason: 'pipelineNotApplicable' });
    });

    it('evaluates map-aware zones filters in profile chooseN options via def.mapSpaces', () => {
      const action: ActionDef = {
        id: asActionId('mapChoiceOp'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      };

      const profile: ActionPipelineDef = {
        id: 'mapChoiceProfile',
        actionId: asActionId('mapChoiceOp'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseN: {
                  internalDecisionId: 'decision:$spaces',
                  bind: '$spaces',
                  options: {
                    query: 'mapSpaces',
                    filter: {
                      condition: {
                        op: '==',
                        left: { ref: 'zoneProp', zone: '$zone', prop: 'spaceType' },
                        right: 'city',
                      },
                    },
                  },
                  min: 1,
                  max: 5,
                },
              } as EffectAST,
            ],
          },
        ],
        atomicity: 'partial',
      };

      const def = makeBaseDef({
        actions: [action],
        actionPipelines: [profile],
        mapSpaces: [
          {
            id: 'board:none',
            spaceType: 'province',
            population: 1,
            econ: 0,
            terrainTags: [],
            country: 'southVietnam',
            coastal: false,
            adjacentTo: [],
          },
          {
            id: 'hand:0',
            spaceType: 'city',
            population: 2,
            econ: 0,
            terrainTags: [],
            country: 'southVietnam',
            coastal: false,
            adjacentTo: [],
          },
        ],
      });

      const result = legalChoices(def, makeBaseState(), makeMove('mapChoiceOp'));
      assert.equal(result.complete, false);
      assert.equal(result.name, '$spaces');
      assert.equal(result.type, 'chooseN');
      assert.deepStrictEqual(result.options, ['hand:0']);
    });

    it('validates sequential dependent choices against progressed state across pipeline stages', () => {
      const action: ActionDef = {
        id: asActionId('chainOp'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      };

      const profile: ActionPipelineDef = {
        id: 'chainProfile',
        actionId: asActionId('chainOp'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseN: {
                  internalDecisionId: 'decision:targetSpaces',
                  bind: 'targetSpaces',
                  options: { query: 'enums', values: ['b:none', 'c:none'] },
                  n: 2,
                },
              } as EffectAST,
              {
                forEach: {
                  bind: '$dest',
                  over: { query: 'binding', name: 'targetSpaces' },
                  effects: [
                    {
                      chooseN: {
                        internalDecisionId: 'decision:$moving',
                        bind: '$moving',
                        options: {
                          query: 'tokensInAdjacentZones',
                          zone: '$dest',
                          filter: [{ prop: 'type', op: 'eq', value: 'guerrilla' }],
                        },
                        min: 0,
                        max: 99,
                      },
                    } as EffectAST,
                    {
                      forEach: {
                        bind: '$piece',
                        over: { query: 'binding', name: '$moving' },
                        effects: [
                          {
                            moveToken: {
                              token: '$piece',
                              from: { zoneExpr: { ref: 'tokenZone', token: '$piece' } },
                              to: '$dest',
                            },
                          },
                        ],
                      },
                    } as EffectAST,
                  ],
                },
              } as EffectAST,
            ],
          },
        ],
        atomicity: 'partial',
      };

      const def = {
        ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
        zones: [
          { id: asZoneId('a:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [asZoneId('b:none')] },
          { id: asZoneId('b:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [asZoneId('a:none'), asZoneId('c:none')] },
          { id: asZoneId('c:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [asZoneId('b:none')] },
          { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
        ],
      } as GameDef;

      const state = makeBaseState({
        zones: {
          'a:none': [
            {
              id: asTokenId('g1'),
              type: 'nva-guerrillas',
              props: { type: 'guerrilla', faction: 'NVA' },
            },
          ],
          'b:none': [],
          'c:none': [],
          'hand:0': [],
        },
      });

      const result = legalChoices(def, state, makeMove('chainOp', {
        'decision:targetSpaces': ['b:none', 'c:none'],
        'decision:$moving': ['g1'],
      }));
      assert.deepStrictEqual(result, { kind: 'complete', complete: true });
    });

    it('throws typed errors for malformed free-operation zone filters instead of silently denying zones', () => {
      const action: ActionDef = {
        id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      };

      const profile: ActionPipelineDef = {
        id: 'operation-profile',
        actionId: asActionId('operation'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$zone',
                  bind: '$zone',
                  options: { query: 'zones' },
                },
              } as EffectAST,
            ],
          },
        ],
        atomicity: 'partial',
      };

      const def: GameDef = {
        ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
        turnOrder: {
          type: 'cardDriven',
          config: {
            turnFlow: {
              cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
              eligibility: { factions: ['0', '1'], overrideWindows: [] },
              optionMatrix: [],
              passRewards: [],
              freeOperationActionIds: ['operation'],
              durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            },
          },
        },
      } as unknown as GameDef;

      const state = makeBaseState({
        turnOrderState: {
          type: 'cardDriven',
          runtime: {
            factionOrder: ['0', '1'],
            eligibility: { '0': true, '1': true },
            currentCard: {
              firstEligible: '0',
              secondEligible: '1',
              actedFactions: [],
              passedFactions: [],
              nonPassCount: 0,
              firstActionClass: null,
            },
            pendingEligibilityOverrides: [],
            pendingFreeOperationGrants: [
              {
                grantId: 'grant-0',
                faction: '0',
                operationClass: 'operation',
                actionIds: ['operation'],
                zoneFilter: {
                  op: '==',
                  left: { ref: 'gvar', var: 'missingVar' },
                  right: 1,
                },
                remainingUses: 1,
              },
            ],
          },
        },
      });

      assert.throws(
        () => legalChoices(def, state, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
          assert.equal(details.code, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED');
          assert.equal(details.context?.surface, 'legalChoices');
          assert.equal(details.context?.actionId, 'operation');
          return true;
        },
      );
    });
  });

  describe('purity invariant', () => {
    it('does not mutate state or partialMove', () => {
      const action: ActionDef = {
        id: asActionId('pureTest'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$choice',
              bind: '$choice',
              options: { query: 'enums', values: ['a', 'b'] },
            },
          },
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();
      const move = makeMove('pureTest');

      const bigIntReplacer = (_key: string, value: unknown) =>
        typeof value === 'bigint' ? `__bigint__${value.toString()}` : value;

      const stateBefore = JSON.stringify(state, bigIntReplacer);
      const moveBefore = JSON.stringify(move, bigIntReplacer);

      legalChoices(def, state, move);

      assert.equal(JSON.stringify(state, bigIntReplacer), stateBefore, 'state must not be mutated');
      assert.equal(JSON.stringify(move, bigIntReplacer), moveBefore, 'move must not be mutated');
    });
  });
});
