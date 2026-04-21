// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  enumerateLegalMoves,
  MISSING_BINDING_POLICY_CONTEXTS,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import {
  classifyDecisionContinuationAdmissionForLegalMove,
  isDecisionContinuationAdmittedForLegalMove,
} from '../../../src/kernel/microturn/continuation.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const PHASE_ID = asPhaseId('main');
const ACTION_ID = asActionId('unknown-drop-inventory-op');

const makeDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'admission-unknown-drop-inventory-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: PHASE_ID }] },
    actions: [{
      id: ACTION_ID,
      actor: 'active',
      executor: 'actor',
      phase: [PHASE_ID],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    } satisfies ActionDef],
    actionPipelines: [{
      id: 'unknown-drop-inventory-profile',
      actionId: ACTION_ID,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: ['allowed'] },
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
        ],
      }],
      atomicity: 'partial',
    }],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeState = (): GameState => ({
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
});

const makeMove = (): Move => ({
  actionId: ACTION_ID,
  params: {},
});

describe('admission unknown drop inventory', () => {
  it('keeps helper and enumerateLegalMoves callsites aligned on dropping unknown verdicts', () => {
    const def = makeDef();
    const state = makeState();
    const move = makeMove();
    const context = MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE;

    assert.equal(
      classifyDecisionContinuationAdmissionForLegalMove(def, state, move, context, {
        budgets: { maxDecisionProbeSteps: 0 },
      }),
      'unknown',
    );
    assert.equal(
      isDecisionContinuationAdmittedForLegalMove(def, state, move, context, {
        budgets: { maxDecisionProbeSteps: 0 },
      }),
      false,
    );

    const enumerated = enumerateLegalMoves(def, state, {
      budgets: { maxDecisionProbeSteps: 0 },
    });
    assert.equal(enumerated.moves.length, 0);
    assert.equal(
      enumerated.warnings.some((warning) => warning.code === 'CLASSIFIER_UNKNOWN_VERDICT_DROPPED'),
      true,
    );
  });
});
