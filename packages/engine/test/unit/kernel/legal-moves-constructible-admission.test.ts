// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  type DecisionKey,
  asPhaseId,
  asPlayerId,
  asZoneId,
  classifyMoveDecisionSequenceSatisfiabilityForLegalMove,
  enumerateLegalMoves,
  MISSING_BINDING_POLICY_CONTEXTS,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

const PHASE_ID = asPhaseId('main');
const ACTION_ID = asActionId('constructible-op');

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: PHASE_ID,
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  ...overrides,
});

const makePipelineAction = (): ActionDef => ({
  id: ACTION_ID,
  actor: 'active',
  executor: 'actor',
  phase: [PHASE_ID],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const makePipelineProfile = (effects: ActionPipelineDef['stages'][number]['effects']): ActionPipelineDef => ({
  id: 'constructible-profile',
  actionId: ACTION_ID,
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [{ effects }],
  atomicity: 'partial',
});

const makePipelineDef = (effects: ActionPipelineDef['stages'][number]['effects']): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'legal-moves-constructible-admission-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: PHASE_ID }] },
    actions: [makePipelineAction()],
    actionPipelines: [makePipelineProfile(effects)],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeTemplateMove = (freeOperation = false): Move => ({
  actionId: ACTION_ID,
  params: {},
  ...(freeOperation ? { freeOperation: true } : {}),
});

describe('legal move constructible admission', () => {
  it('drops unknown, indexes satisfiable templates, and publishes stochastic-frontier moves without certificate leakage', () => {
    const decisionDef = makePipelineDef([
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$target',
          bind: '$target',
          options: { query: 'enums', values: ['allowed'] },
        },
      }) as ActionDef['effects'][number],
    ]);
    const state = makeBaseState();

    const unknown = enumerateLegalMoves(decisionDef, state, {
      budgets: { maxDecisionProbeSteps: 0 },
    });
    assert.equal(unknown.moves.length, 0);
    assert.equal(
      unknown.warnings.some((warning) => warning.code === 'CLASSIFIER_UNKNOWN_VERDICT_DROPPED'),
      true,
    );

    const satisfiable = enumerateLegalMoves(decisionDef, state);
    assert.equal(satisfiable.moves.length, 1);
    assert.equal(
      satisfiable.certificateIndex?.has(toMoveIdentityKey(decisionDef, makeTemplateMove())),
      true,
    );
    assert.deepEqual(
      Object.keys(satisfiable.moves[0] ?? {}).sort(),
      ['move', 'trustedMove', 'viability'],
    );

    const stochasticDef = makePipelineDef([
      eff({
        rollRandom: {
          bind: '$roll',
          min: 1,
          max: 2,
          in: [],
        },
      }) as ActionDef['effects'][number],
    ]);
    const stochastic = enumerateLegalMoves(stochasticDef, state);
    assert.equal(stochastic.moves.length, 1);
    assert.equal(stochastic.certificateIndex, undefined);
    assert.equal(stochastic.moves[0]?.viability.stochasticDecision?.kind, 'pendingStochastic');
    assert.equal(
      classifyMoveDecisionSequenceSatisfiabilityForLegalMove(
        stochasticDef,
        state,
        makeTemplateMove(),
        MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE,
        { emitCompletionCertificate: true },
      ).classification,
      'explicitStochastic',
    );

    const mixedStochasticDef = makePipelineDef([
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$pick',
          bind: '$pick',
          options: { query: 'enums', values: ['good'] },
        },
      }) as ActionDef['effects'][number],
      eff({
        rollRandom: {
          bind: '$roll',
          min: 1,
          max: 2,
          in: [],
        },
      }) as ActionDef['effects'][number],
    ]);
    const mixedStochastic = enumerateLegalMoves(mixedStochasticDef, state);
    assert.equal(mixedStochastic.moves.length, 1);
    assert.equal(mixedStochastic.certificateIndex, undefined);
    assert.equal(mixedStochastic.moves[0]?.viability.stochasticDecision?.kind, 'pendingStochastic');
    assert.equal(mixedStochastic.moves[0]?.viability.nextDecision, undefined);
    assert.equal(
      mixedStochastic.moves[0]?.trustedMove !== undefined,
      true,
    );
    assert.deepEqual(mixedStochastic.moves[0]?.move.params, {
      $pick: 'good',
    });
    const mixedClassification = classifyMoveDecisionSequenceSatisfiabilityForLegalMove(
      mixedStochasticDef,
      state,
      makeTemplateMove(),
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE,
      { emitCompletionCertificate: true },
    );
    assert.equal(mixedClassification.classification, 'explicitStochastic');
    assert.deepEqual(mixedClassification.certificate?.assignments, [
      {
        decisionKey: asDecisionKey('$pick'),
        requestType: 'chooseOne',
        value: 'good',
      },
    ]);

  });

  it('preserves the offered-phase branch in must-change outcome-grant handling', () => {
    const source = readKernelSource('src/kernel/legal-moves.ts');
    assert.match(
      source,
      /if \(strongestOutcomeGrant\.phase !== 'ready'\) \{\s+return strongestOutcomeGrant\.phase === 'offered';\s+\}/u,
    );
  });
});
