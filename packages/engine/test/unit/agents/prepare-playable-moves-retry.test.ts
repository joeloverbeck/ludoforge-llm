// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NOT_VIABLE_RETRY_CAP, preparePlayableMoves } from '../../../src/agents/prepare-playable-moves.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createRng,
  enumerateLegalMoves,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type ClassifiedMove,
  type GameDef,
  type RuntimeWarning,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

const createChooseNAction = (id: string): ActionDef => ({
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

const createDef = (
  actionId: string,
  profile: ActionPipelineDef,
): GameDef => assertValidatedGameDef({
  metadata: { id: `prepare-playable-moves-retry-${actionId}`, players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [createChooseNAction(actionId)],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [profile],
});

const getSinglePendingMove = (def: GameDef): {
  readonly state: ReturnType<typeof initialState>['state'];
  readonly classifiedMove: ClassifiedMove;
} => {
  const state = initialState(def, 1, 2).state;
  const legalMoves = enumerateLegalMoves(def, state).moves;
  assert.equal(legalMoves.length, 1);
  const classifiedMove = legalMoves[0];
  assert.ok(classifiedMove !== undefined);
  assert.equal(classifiedMove.viability.viable, true, 'template should stay viable before completion');
  if (classifiedMove.viability.viable) {
    assert.equal(classifiedMove.viability.complete, false, 'template should remain incomplete');
    assert.ok(classifiedMove.viability.nextDecision !== undefined, 'template should expose a pending decision');
  }
  return { state, classifiedMove };
};

const findWarning = (
  warnings: readonly RuntimeWarning[] | undefined,
  code: RuntimeWarning['code'],
): RuntimeWarning | undefined => warnings?.find((warning) => warning.code === code);

describe('preparePlayableMoves retry integration', () => {
  it('returns a playable move for a viable template on a representative success seed', () => {
    const actionId = 'retry-template';
    const def = createDef(actionId, createRetryProfile(actionId));
    const { state, classifiedMove } = getSinglePendingMove(def);

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [classifiedMove],
      rng: createRng(1n),
    }, {
      pendingTemplateCompletions: 3,
    });

    assert.equal(prepared.completedMoves.length >= 1, true);
    assert.equal(prepared.completedMoves.length <= 3, true);
    assert.equal(prepared.stochasticMoves.length, 0);
    assert.equal(prepared.statistics.templateCompletionAttempts, 3);
    assert.equal(prepared.statistics.templateCompletionSuccesses >= 1, true);
    assert.equal(prepared.statistics.templateCompletionSuccesses <= 3, true);
    assert.equal(prepared.statistics.templateCompletionStructuralFailures, 0);
    assert.equal(prepared.movePreparations[0]?.templateCompletionOutcome, 'complete');
    assert.equal(prepared.movePreparations[0]?.rejection, undefined);
  });

  it('keeps fresh child completion streams bounded when each attempt succeeds', () => {
    const actionId = 'retry-template';
    const def = createDef(actionId, createRetryProfile(actionId));
    const { state, classifiedMove } = getSinglePendingMove(def);

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [classifiedMove],
      rng: createRng(2n),
    }, {
      pendingTemplateCompletions: 3,
    });

    assert.equal(prepared.completedMoves.length >= 1, true);
    assert.equal(prepared.completedMoves.length <= 3, true);
    assert.equal(prepared.stochasticMoves.length, 0);
    assert.equal(prepared.statistics.templateCompletionAttempts, 3);
    assert.equal(prepared.statistics.templateCompletionSuccesses >= prepared.completedMoves.length, true);
    assert.equal(prepared.statistics.templateCompletionSuccesses, 3);
    assert.equal(prepared.statistics.templateCompletionStructuralFailures, 0);
    assert.equal(prepared.movePreparations[0]?.templateCompletionOutcome, 'complete');
    assert.equal(prepared.movePreparations[0]?.rejection, undefined);
  });

  it('caps draw-dead-end retries at pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP', () => {
    const actionId = 'always-dead-end-template';
    const def = createDef(actionId, createAlwaysDeadEndProfile(actionId));
    const { state, classifiedMove } = getSinglePendingMove(def);

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [classifiedMove],
      rng: createRng(2n),
    }, {
      pendingTemplateCompletions: 3,
    });

    assert.equal(prepared.completedMoves.length, 0);
    assert.equal(prepared.stochasticMoves.length, 0);
    assert.equal(prepared.statistics.templateCompletionAttempts, 3 + NOT_VIABLE_RETRY_CAP);
    assert.equal(prepared.statistics.templateCompletionSuccesses, 0);
    assert.equal(prepared.statistics.templateCompletionStructuralFailures, 0);
    assert.equal(prepared.movePreparations[0]?.templateCompletionOutcome, 'failed');
    assert.equal(prepared.movePreparations[0]?.rejection, 'drawDeadEnd');
  });

  it('biases the retry after an optional chooseN empty dead-end and records the warning', () => {
    const actionId = 'optional-retry-template';
    const def = createDef(actionId, createOptionalRetryProfile(actionId));
    const { state, classifiedMove } = getSinglePendingMove(def);

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [classifiedMove],
      rng: createRng(0n),
    }, {
      pendingTemplateCompletions: 1,
    });

    assert.equal(prepared.completedMoves.length, 1);
    assert.deepEqual(prepared.completedMoves[0]?.move.params.$targets, ['safe']);
    assert.equal(prepared.movePreparations[0]?.templateCompletionOutcome, 'complete');
    const warning = findWarning(prepared.movePreparations[0]?.warnings, 'MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY');
    assert.ok(warning, 'expected retry bias warning on the successful retry');
    assert.deepEqual(warning?.context, {
      attemptIndex: 1,
      decisionKey: '$targets',
      declaredMin: 0,
      declaredMax: 1,
      sampledCount: 0,
      reason: 'optional-chooseN-empty-draw-dead-end',
    });
  });

  it('does not emit the retry bias warning when drawDeadEnd lacked optional chooseN diagnostics', () => {
    const actionId = 'always-dead-end-template';
    const def = createDef(actionId, createAlwaysDeadEndProfile(actionId));
    const { state, classifiedMove } = getSinglePendingMove(def);

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [classifiedMove],
      rng: createRng(2n),
    }, {
      pendingTemplateCompletions: 1,
    });

    assert.equal(
      findWarning(prepared.movePreparations[0]?.warnings, 'MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY'),
      undefined,
    );
  });

  it('short-circuits structural failures without consuming retry extensions', () => {
    const actionId = 'structural-template';
    const def = createDef(actionId, createInsufficientProfile(actionId));
    const { state, classifiedMove } = getSinglePendingMove(def);

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
    assert.equal(prepared.statistics.templateCompletionSuccesses, 0);
    assert.equal(prepared.statistics.templateCompletionStructuralFailures, 1);
    assert.equal(prepared.movePreparations[0]?.templateCompletionOutcome, 'failed');
    assert.equal(prepared.movePreparations[0]?.rejection, 'structurallyUnsatisfiable');
  });
});
