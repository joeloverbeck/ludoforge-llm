// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  classifyMoveDecisionSequenceSatisfiability,
  deriveCompletionCertificateFingerprint,
  evaluateMoveLegality,
  materializeCompletionCertificate,
  resolveMoveDecisionSequence,
  type ActionDef,
  type ActionPipelineDef,
  type CompletionCertificate,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const makeBaseState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [11n, 29n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeCertificateAction = (): ActionDef => ({
  id: asActionId('certificate-op'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const makeCertificatePipeline = (): ActionPipelineDef => ({
  id: 'certificate-op-profile',
  actionId: asActionId('certificate-op'),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [
    {
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$squad',
            bind: '$squad',
            options: { query: 'enums', values: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'] },
            min: 1,
            max: 3,
          },
        }) as GameDef['actions'][number]['effects'][number],
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$lead',
            bind: '$lead',
            options: { query: 'enums', values: ['left', 'right'] },
          },
        }) as GameDef['actions'][number]['effects'][number],
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$support',
            bind: '$support',
            options: { query: 'enums', values: ['lock', 'wrong'] },
          },
        }) as GameDef['actions'][number]['effects'][number],
      ],
    },
  ],
  atomicity: 'partial',
});

const makeDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'completion-certificate-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [makeCertificateAction()],
    actionPipelines: [makeCertificatePipeline()],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeBaseMove = (): Move => ({
  actionId: asActionId('certificate-op'),
  params: {},
});

const collectCanonicalAssignments = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
): CompletionCertificate['assignments'] => {
  let move = baseMove;
  const selectedValues: ReadonlyArray<Move['params'][string]> = [
    ['alpha', 'beta'],
    'left',
    'lock',
  ];
  const assignments = selectedValues.map((value, index) => {
    const result = resolveMoveDecisionSequence(def, state, move, { choose: () => undefined });
    if (result.nextDecision === undefined) {
      assert.fail(`expected pending decision at step ${index}`);
    }
    move = {
      ...move,
      params: {
        ...move.params,
        [result.nextDecision.decisionKey]: value,
      },
    };
    return {
      decisionKey: result.nextDecision.decisionKey,
      value,
      requestType: result.nextDecision.type,
    };
  });

  return assignments;
};

const makeCertificate = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
): CompletionCertificate => {
  const assignments = collectCanonicalAssignments(def, state, baseMove);
  return {
    assignments,
    fingerprint: deriveCompletionCertificateFingerprint({
      stateHash: state.stateHash,
      actionId: baseMove.actionId,
      baseParams: baseMove.params,
      assignments,
    }),
  };
};

const makeUnderspecifiedCertificate = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
): CompletionCertificate => {
  const assignments = collectCanonicalAssignments(def, state, baseMove).slice(0, 2);
  return {
    assignments,
    fingerprint: deriveCompletionCertificateFingerprint({
      stateHash: state.stateHash,
      actionId: baseMove.actionId,
      baseParams: baseMove.params,
      assignments,
    }),
  };
};

describe('completion certificate materialization', () => {
  it('materializes a deterministic legal move from ordered assignments', () => {
    const def = makeDef();
    const state = makeBaseState();
    const baseMove = makeBaseMove();
    const certificate = makeCertificate(def, state, baseMove);

    const satisfiability = classifyMoveDecisionSequenceSatisfiability(def, state, baseMove);
    assert.equal(satisfiability.classification, 'satisfiable');

    const materialized = materializeCompletionCertificate(def, state, baseMove, certificate);
    const repeated = materializeCompletionCertificate(def, state, baseMove, certificate);

    const legality = evaluateMoveLegality(def, state, materialized);
    assert.deepEqual(legality, { kind: 'legal' });

    const resolved = resolveMoveDecisionSequence(def, state, materialized, { choose: () => undefined });
    assert.equal(resolved.complete, true);

    assert.deepEqual(materialized, repeated);
    assert.equal(JSON.stringify(materialized), JSON.stringify(repeated));
    assert.deepEqual(state.rng, makeBaseState().rng);
    assert.equal(state.stateHash, 0n);
  });

  it('throws a kernel invariant error when a certificate underspecifies the path', () => {
    const def = makeDef();
    const state = makeBaseState();
    const baseMove = makeBaseMove();
    const underspecified = makeUnderspecifiedCertificate(def, state, baseMove);

    assert.throws(
      () => materializeCompletionCertificate(def, state, baseMove, underspecified),
      (error: unknown) => {
        const details = error as { readonly code?: unknown };
        assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
        return true;
      },
    );
  });
});
