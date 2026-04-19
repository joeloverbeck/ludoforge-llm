// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { preparePlayableMoves } from '../../../src/agents/prepare-playable-moves.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createRng,
  enumerateLegalMoves,
  completeTemplateMove,
  serialize,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type Move,
  type TemplateCompletionResult,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

const stringifyBigInt = (value: unknown): string =>
  JSON.stringify(value, (_key, entry) => (typeof entry === 'bigint' ? entry.toString() : entry));

const serializeCompletionResult = (result: TemplateCompletionResult): string => {
  switch (result.kind) {
    case 'completed':
      return stringifyBigInt({
        kind: result.kind,
        move: result.move,
        rng: serialize(result.rng),
      });
    case 'drawDeadEnd':
      return stringifyBigInt({
        kind: result.kind,
        rng: serialize(result.rng),
        optionalChooseN: result.optionalChooseN,
      });
    case 'stochasticUnresolved':
      return stringifyBigInt({
        kind: result.kind,
        move: result.move,
        rng: serialize(result.rng),
      });
    case 'structurallyUnsatisfiable':
      return stringifyBigInt({ kind: result.kind });
  }
};

const createAction = (id: string): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  executor: 'actor',
  phase: [phaseId],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const createRetryProfile = (actionId: string): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['dead', 'safe'] },
            min: 1,
            max: 1,
          },
        }),
        eff({
          if: {
            when: {
              op: 'in',
              item: 'dead',
              set: { _t: 2, ref: 'binding', name: '$targets' },
            },
            then: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$dead',
                  bind: '$dead',
                  options: { query: 'enums', values: [] },
                },
              }) as ActionDef['effects'][number],
            ],
            else: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$safe',
                  bind: '$safe',
                  options: { query: 'enums', values: ['done'] },
                },
              }) as ActionDef['effects'][number],
            ],
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

const createOptionalRetryProfile = (actionId: string): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['safe'] },
            min: 0,
            max: 1,
          },
        }),
        eff({
          if: {
            when: {
              op: 'in',
              item: 'safe',
              set: { _t: 2, ref: 'binding', name: '$targets' },
            },
            then: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$safe',
                  bind: '$safe',
                  options: { query: 'enums', values: ['done'] },
                },
              }) as ActionDef['effects'][number],
            ],
            else: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$dead',
                  bind: '$dead',
                  options: { query: 'enums', values: [] },
                },
              }) as ActionDef['effects'][number],
            ],
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

const createAlwaysDeadEndProfile = (actionId: string): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['dead'] },
          },
        }),
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$dead',
            bind: '$dead',
            options: { query: 'enums', values: [] },
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

const createInsufficientProfile = (actionId: string): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['a', 'b'] },
            min: 3,
            max: 3,
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

const createDef = (
  actionId: string,
  profile: ActionPipelineDef,
): GameDef => assertValidatedGameDef({
  metadata: { id: `completion-contract-${actionId}`, players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [createAction(actionId)],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [profile],
});

const createPendingTemplateMove = (actionId: string): Move => ({
  actionId: asActionId(actionId),
  params: {},
});

const getSinglePendingMove = (def: GameDef) => {
  const state = initialState(def, 1, 2).state;
  const legalMoves = enumerateLegalMoves(def, state).moves;
  assert.equal(legalMoves.length, 1);
  const classifiedMove = legalMoves[0];
  assert.ok(classifiedMove !== undefined);
  assert.equal(classifiedMove.viability.viable, true);
  if (classifiedMove.viability.viable) {
    assert.equal(classifiedMove.viability.complete, false);
    assert.ok(classifiedMove.viability.nextDecision !== undefined);
  }
  return { state, classifiedMove: classifiedMove! };
};

describe('completion contract invariants', () => {
  it('Spec 16 Contract §1: classifies min>selectable chooseN as structurallyUnsatisfiable', () => {
    const actionId = 'structural-template';
    const def = createDef(actionId, createInsufficientProfile(actionId));
    const state = initialState(def, 2, 2).state;
    const templateMove = createPendingTemplateMove(actionId);

    const result = completeTemplateMove(def, state, templateMove, createRng(7n));

    assert.equal(result.kind, 'structurallyUnsatisfiable');
    assert.notEqual(result.kind, 'drawDeadEnd');
  });

  it('Spec 16 Contract §2: first-attempt optional chooseN honors declared min=0 semantics', () => {
    const actionId = 'optional-retry-template';
    const def = createDef(actionId, createOptionalRetryProfile(actionId));
    const state = initialState(def, 3, 2).state;
    const templateMove = createPendingTemplateMove(actionId);

    const forcedCompleted = completeTemplateMove(def, state, templateMove, createRng(0n), undefined, {
      choose: (request) => request.type === 'chooseN' ? ['safe'] : undefined,
    });
    assert.equal(forcedCompleted.kind, 'completed');
    if (forcedCompleted.kind !== 'completed') {
      assert.fail('expected guided optional chooseN completion');
    }
    assert.deepEqual(forcedCompleted.move.params.$targets, ['safe']);
    assert.equal(forcedCompleted.move.params.$safe, 'done');

    let sawDrawDeadEnd = false;
    for (let seed = 0n; seed < 32n; seed += 1n) {
      const result = completeTemplateMove(def, state, templateMove, createRng(seed));
      if (result.kind !== 'completed') {
        assert.equal(result.kind, 'drawDeadEnd', `seed ${seed} should sample either the empty or non-empty branch`);
        sawDrawDeadEnd = true;
        assert.deepEqual(result.optionalChooseN, {
          decisionKey: '$targets',
          sampledCount: 0,
          declaredMin: 0,
          declaredMax: 1,
        });
      }
    }
    assert.equal(sawDrawDeadEnd, true, 'expected at least one empty optional chooseN sample');
  });

  it('Spec 16 Contract §3: distinguishes sampled dead ends from structural impossibility', () => {
    const sampledActionId = 'retry-template';
    const sampledDef = createDef(sampledActionId, createRetryProfile(sampledActionId));
    const sampledState = initialState(sampledDef, 1, 2).state;
    const sampledTemplateMove = createPendingTemplateMove(sampledActionId);

    const sampled = completeTemplateMove(sampledDef, sampledState, sampledTemplateMove, createRng(1n), undefined, {
      choose: (request) => {
        if (request.type === 'chooseN' && request.min === 1 && request.max === 1) {
          return ['dead'];
        }
        return undefined;
      },
    });

    const structuralActionId = 'structural-template';
    const structuralDef = createDef(structuralActionId, createInsufficientProfile(structuralActionId));
    const structuralState = initialState(structuralDef, 2, 2).state;
    const structuralTemplateMove = createPendingTemplateMove(structuralActionId);

    const structural = completeTemplateMove(structuralDef, structuralState, structuralTemplateMove, createRng(7n));

    assert.equal(sampled.kind, 'drawDeadEnd');
    assert.equal(structural.kind, 'structurallyUnsatisfiable');
  });

  it('Spec 16 Contract §4: returns advanced RNG state on drawDeadEnd', () => {
    const actionId = 'always-dead-end-template';
    const def = createDef(actionId, createAlwaysDeadEndProfile(actionId));
    const state = initialState(def, 4, 2).state;
    const templateMove = createPendingTemplateMove(actionId);
    const rng = createRng(2n);

    const result = completeTemplateMove(def, state, templateMove, rng);

    assert.equal(result.kind, 'drawDeadEnd');
    if (result.kind !== 'drawDeadEnd') {
      assert.fail('expected drawDeadEnd');
    }
    assert.notDeepEqual(serialize(result.rng), serialize(rng));
  });

  it('Spec 16 Invariant §3: returns deterministic payloads for identical inputs', () => {
    const completedActionId = 'optional-retry-template';
    const completedDef = createDef(completedActionId, createOptionalRetryProfile(completedActionId));
    const completedState = initialState(completedDef, 5, 2).state;
    const completedMove = createPendingTemplateMove(completedActionId);

    const completedFirst = completeTemplateMove(completedDef, completedState, completedMove, createRng(11n));
    const completedSecond = completeTemplateMove(completedDef, completedState, completedMove, createRng(11n));

    const drawDeadEndActionId = 'always-dead-end-template';
    const drawDeadEndDef = createDef(drawDeadEndActionId, createAlwaysDeadEndProfile(drawDeadEndActionId));
    const drawDeadEndState = initialState(drawDeadEndDef, 6, 2).state;
    const drawDeadEndMove = createPendingTemplateMove(drawDeadEndActionId);

    const deadEndFirst = completeTemplateMove(drawDeadEndDef, drawDeadEndState, drawDeadEndMove, createRng(13n));
    const deadEndSecond = completeTemplateMove(drawDeadEndDef, drawDeadEndState, drawDeadEndMove, createRng(13n));

    assert.equal(serializeCompletionResult(completedFirst), serializeCompletionResult(completedSecond));
    assert.equal(serializeCompletionResult(deadEndFirst), serializeCompletionResult(deadEndSecond));
  });

  it('Spec 16 Invariant §5 / Foundation 5: preparePlayableMoves does not retry structurallyUnsatisfiable templates', () => {
    const actionId = 'structural-template';
    const seedDef = createDef(actionId, createRetryProfile(actionId));
    const { state, classifiedMove } = getSinglePendingMove(seedDef);
    const def = createDef(actionId, createInsufficientProfile(actionId));

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [classifiedMove],
      rng: createRng(7n),
    }, {
      pendingTemplateCompletions: 3,
    });

    assert.equal(prepared.completedMoves.length, 0);
    assert.equal(prepared.stochasticMoves.length, 0);
    assert.equal(prepared.statistics.templateCompletionAttempts, 1);
    assert.equal(prepared.statistics.templateCompletionStructuralFailures, 1);
    assert.equal(prepared.movePreparations[0]?.templateCompletionOutcome, 'failed');
    assert.equal(prepared.movePreparations[0]?.rejection, 'structurallyUnsatisfiable');
  });
});
