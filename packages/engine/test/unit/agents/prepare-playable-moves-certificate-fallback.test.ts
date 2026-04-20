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
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type ChoicePendingRequest,
  type ClassifiedMove,
  type GameDef,
  type MoveParamValue,
} from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');
const actionId = asActionId('certificate-fallback');

const createAction = (): ActionDef => ({
  id: actionId,
  actor: 'active',
  executor: 'actor',
  phase: [phaseId],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const createRetryProfile = (): ActionPipelineDef => ({
  id: 'profile-certificate-fallback',
  actionId,
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

const createDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'prepare-playable-moves-certificate-fallback', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [createAction()],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [createRetryProfile()],
});

const getSinglePendingMove = (def: GameDef): {
  readonly state: ReturnType<typeof initialState>['state'];
  readonly classifiedMove: ClassifiedMove;
  readonly certificateIndex: NonNullable<ReturnType<typeof enumerateLegalMoves>['certificateIndex']>;
} => {
  const state = initialState(def, 1, 2).state;
  const enumerated = enumerateLegalMoves(def, state);
  assert.equal(enumerated.moves.length, 1);
  assert.ok(enumerated.certificateIndex, 'expected certificate index for satisfiable pending move');
  const classifiedMove = enumerated.moves[0];
  assert.ok(classifiedMove);
  return {
    state,
    classifiedMove,
    certificateIndex: enumerated.certificateIndex!,
  };
};

const chooseDeadPath = (request: ChoicePendingRequest): MoveParamValue | undefined => {
  if (request.type === 'chooseN') {
    return ['dead'];
  }
  return undefined;
};

describe('preparePlayableMoves certificate fallback', () => {
  it('materializes a certificate-backed completion without advancing rng beyond the retry loop', () => {
    const def = createDef();
    const { state, classifiedMove, certificateIndex } = getSinglePendingMove(def);
    const stableMoveKey = toMoveIdentityKey(def, classifiedMove.move);
    assert.equal(certificateIndex.has(stableMoveKey), true);

    const withoutCertificate = preparePlayableMoves({
      def,
      state,
      legalMoves: [classifiedMove],
      rng: createRng(11n),
    }, {
      pendingTemplateCompletions: 1,
      choose: chooseDeadPath,
    });

    const withCertificate = preparePlayableMoves({
      def,
      state,
      legalMoves: [classifiedMove],
      certificateIndex,
      rng: createRng(11n),
    }, {
      pendingTemplateCompletions: 1,
      choose: chooseDeadPath,
    });

    assert.equal(withCertificate.completedMoves.length, 1);
    assert.equal(withCertificate.stochasticMoves.length, 0);
    assert.deepEqual(withCertificate.completedMoves[0]?.move.params.$targets, ['safe']);
    assert.equal(withCertificate.completedMoves[0]?.move.params.$safe, 'done');
    assert.deepEqual(withCertificate.rng, withoutCertificate.rng);
    assert.equal(withCertificate.movePreparations[0]?.finalClassification, 'complete');
  });

  it('warns and drops the move when the certificate is missing at fallback time', () => {
    const def = createDef();
    const { state, classifiedMove } = getSinglePendingMove(def);

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [classifiedMove],
      rng: createRng(11n),
    }, {
      pendingTemplateCompletions: 1,
      choose: chooseDeadPath,
    });

    assert.equal(prepared.completedMoves.length, 0);
    assert.equal(prepared.stochasticMoves.length, 0);
    assert.equal(
      prepared.movePreparations[0]?.warnings?.some((warning) => warning.code === 'CONSTRUCTIBILITY_INVARIANT_VIOLATION'),
      true,
    );
  });
});
