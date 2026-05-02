// @test-class: architectural-invariant
// References docs/FOUNDATIONS.md F11 corollary "Single source of truth for kernel-mutated structural state fields"
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  createGameDefRuntime,
  initialState,
  type Agent,
  type GameDef,
  type GameState,
  type Move,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';
import { applyTurnFlowEligibilityAfterMove } from '../../src/kernel/turn-flow-eligibility.js';
import { runGame } from '../../src/sim/index.js';
import { eff } from '../helpers/effect-tag-helper.js';

const SEED = 153002;
const PLAYER_COUNT = 4;
const MAX_TURNS = 20;

// Corpus rationale:
// - The inline FITL-style short deck with seed 153002 drives a direct
//   `finalizeSuspendedOrEndedCard` call where `applyTurnFlowCardBoundary`
//   sets `lifecycleStatus.stalled = true`; commit ddcf3ef9 drops that field.
// - The same deck under `runGame(..., maxTurns=1)` reaches a coup handoff and
//   leaves `consecutiveCoupRounds = 1` visible to the simulator boundary.
// - The full `runGame(..., maxTurns=20)` trajectory then observes
//   `lifecycleStatus.stalled = true` and stops with `noLegalMoves`.

const firstLegalAgent: Agent = {
  chooseDecision: (input) => {
    const decision = input.microturn.legalActions[0];
    if (decision === undefined) {
      throw new Error('firstLegalAgent expected at least one legal decision');
    }
    return { decision, rng: input.rng };
  },
};

const createRuntimePropagationFitlDef = (): GameDef =>
  ({
    metadata: { id: 'turn-flow-runtime-field-propagation-fitl', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }, { id: 'VC' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'played:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'lookahead:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'leader:none', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
    setup: [
      eff({ createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } }),
      eff({ createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } }),
      eff({ createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } }),
      eff({ createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } }),
    ],
    turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('victory') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['US', 'ARVN', 'NVA', 'VC'] },
          windows: [],
          actionClassByActionId: { pass: 'pass' },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
        coupPlan: {
          phases: [{ id: 'victory', steps: ['check-thresholds'] }],
          maxConsecutiveRounds: 1,
        },
      },
    },
    actions: [
      {
        id: asActionId('pass'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [{ id: 'pass::turn::0', scope: 'turn', max: 1 }],
      },
    ],
    eventDecks: [
      {
        id: 'runtime-field-propagation-short-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const lifecycleTraceEntries = (
  triggerFirings: readonly TriggerLogEntry[],
): readonly Extract<TriggerLogEntry, { readonly kind: 'turnFlowLifecycle' }>[] =>
  triggerFirings.filter(
    (entry): entry is Extract<TriggerLogEntry, { readonly kind: 'turnFlowLifecycle' }> =>
      entry.kind === 'turnFlowLifecycle',
  );

const createStallAtFinalizerState = (def: GameDef): GameState => {
  const base = initialState(assertValidatedGameDef(def), SEED, PLAYER_COUNT).state;
  return {
    ...base,
    activePlayer: asPlayerId(3),
    currentPhase: asPhaseId('main'),
    zones: {
      ...base.zones,
      'deck:none': [],
      'played:none': [],
      'lookahead:none': [],
      'leader:none': [],
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        seatOrder: ['US', 'ARVN', 'NVA', 'VC'],
        eligibility: { US: true, ARVN: true, NVA: true, VC: true },
        pendingEligibilityOverrides: [],
        lifecycleStatus: { stalled: false },
        currentCard: {
          firstEligible: 'VC',
          secondEligible: null,
          actedSeats: ['US', 'ARVN', 'NVA'],
          passedSeats: ['US', 'ARVN', 'NVA'],
          nonPassCount: 0,
          firstActionClass: null,
        },
        consecutiveCoupRounds: 0,
      },
    },
  };
};

describe('turn-flow runtime field propagation property', () => {
  it('observes boundary-mutated runtime fields at the simulator stop boundary', () => {
    const def = assertValidatedGameDef(createRuntimePropagationFitlDef());
    const finalizerResult = applyTurnFlowEligibilityAfterMove(
      def,
      createStallAtFinalizerState(def),
      { actionId: asActionId('pass'), params: {} } satisfies Move,
    );

    assert.equal(
      finalizerResult.state.turnOrderState.type,
      'cardDriven',
      `seed=${SEED} profiles=firstLegal turn=${finalizerResult.state.turnCount} expected cardDriven finalizer state`,
    );
    if (finalizerResult.state.turnOrderState.type !== 'cardDriven') {
      return;
    }
    assert.equal(
      finalizerResult.state.turnOrderState.runtime.lifecycleStatus.stalled,
      true,
      `seed=${SEED} profiles=firstLegal turn=${finalizerResult.state.turnCount} dropped field=lifecycleStatus.stalled at finalizeSuspendedOrEndedCard`,
    );

    const stallTrace = runGame(
      def,
      SEED,
      Array.from({ length: PLAYER_COUNT }, () => firstLegalAgent),
      MAX_TURNS,
      PLAYER_COUNT,
      { skipDeltas: true },
      createGameDefRuntime(def),
    );
    assert.equal(
      stallTrace.finalState.turnOrderState.type,
      'cardDriven',
      `seed=${SEED} profiles=firstLegal turn=${stallTrace.turnsCount} expected cardDriven final state`,
    );
    if (stallTrace.finalState.turnOrderState.type !== 'cardDriven') {
      return;
    }

    assert.equal(
      stallTrace.finalState.turnOrderState.runtime.lifecycleStatus.stalled,
      true,
      `seed=${SEED} profiles=firstLegal turn=${stallTrace.turnsCount} dropped field=lifecycleStatus.stalled expected simulator-observed true`,
    );
    assert.equal(
      stallTrace.stopReason,
      'noLegalMoves',
      `seed=${SEED} profiles=firstLegal turn=${stallTrace.turnsCount} dropped field=lifecycleStatus.stalled before simulator noLegalMoves stop`,
    );

    const coupTrace = runGame(
      def,
      SEED,
      Array.from({ length: PLAYER_COUNT }, () => firstLegalAgent),
      1,
      PLAYER_COUNT,
      { skipDeltas: true },
      createGameDefRuntime(def),
    );
    const lifecycleEntries = coupTrace.decisions.flatMap((decision) => lifecycleTraceEntries(decision.triggerFirings));

    assert.ok(
      lifecycleEntries.some((entry) => entry.step === 'coupHandoff'),
      `seed=${SEED} profiles=firstLegal turn=${coupTrace.turnsCount} dropped field=consecutiveCoupRounds before simulator observation`,
    );
    assert.equal(
      coupTrace.finalState.turnOrderState.type,
      'cardDriven',
      `seed=${SEED} profiles=firstLegal turn=${coupTrace.turnsCount} expected cardDriven final state`,
    );
    if (coupTrace.finalState.turnOrderState.type !== 'cardDriven') {
      return;
    }
    assert.equal(
      coupTrace.finalState.turnOrderState.runtime.consecutiveCoupRounds,
      1,
      `seed=${SEED} profiles=firstLegal turn=${coupTrace.turnsCount} dropped field=consecutiveCoupRounds expected simulator-observed post-boundary value 1`,
    );
  });
});
