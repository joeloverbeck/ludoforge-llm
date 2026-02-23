import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  asPhaseId,
  asTokenId,
  initialState,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const compileProductionDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const cardToken = (id: string, isCoup: boolean): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { isCoup },
});

const withBoundaryCards = (
  state: GameState,
  options: {
    readonly currentPhase: GameState['currentPhase'];
    readonly playedIsCoup: boolean;
    readonly lookaheadIsCoup?: boolean;
    readonly consecutiveCoupRounds?: number;
  },
): GameState => ({
  ...state,
  currentPhase: options.currentPhase,
  turnOrderState:
    state.turnOrderState.type === 'cardDriven'
      ? {
          type: 'cardDriven',
          runtime: {
            ...state.turnOrderState.runtime,
            ...(options.consecutiveCoupRounds === undefined
              ? {}
              : { consecutiveCoupRounds: options.consecutiveCoupRounds }),
          },
        }
      : state.turnOrderState,
  zones: {
    ...state.zones,
    'played:none': [cardToken('played-card', options.playedIsCoup)],
    'lookahead:none': options.lookaheadIsCoup === undefined ? [] : [cardToken('lookahead-card', options.lookaheadIsCoup)],
    'deck:none': [],
  },
});

describe('FITL production coup phase structure', () => {
  it('compiles production phases and executable coupPlan phase contract', () => {
    const def = compileProductionDef();

    assert.deepEqual(
      def.turnStructure.phases.map((phase) => String(phase.id)),
      ['main', 'coupVictory', 'coupResources', 'coupSupport', 'coupRedeploy', 'coupCommitment', 'coupReset'],
    );

    assert.equal(def.turnOrder?.type, 'cardDriven');
    if (def.turnOrder?.type !== 'cardDriven') {
      return;
    }
    assert.deepEqual(def.turnOrder.config.coupPlan?.phases.map((phase) => phase.id), [
      'coupVictory',
      'coupResources',
      'coupSupport',
      'coupRedeploy',
      'coupCommitment',
      'coupReset',
    ]);
    assert.deepEqual(def.turnOrder.config.coupPlan?.finalRoundOmitPhases, ['coupCommitment', 'coupReset']);
    assert.equal(def.turnOrder.config.coupPlan?.maxConsecutiveRounds, 1);
  });

  it('enters coup phases only on eligible coup turns and suppresses consecutive rounds', () => {
    const def = compileProductionDef();
    const base = initialState(def, 171, 4).state;

    const nonCoup = withBoundaryCards(base, {
      currentPhase: asPhaseId('main'),
      playedIsCoup: false,
      lookaheadIsCoup: false,
      consecutiveCoupRounds: 0,
    });
    const afterNonCoupMain = advancePhase(def, nonCoup);
    assert.equal(afterNonCoupMain.currentPhase, asPhaseId('main'));
    assert.equal(afterNonCoupMain.turnCount, nonCoup.turnCount + 1);

    const firstCoup = withBoundaryCards(base, {
      currentPhase: asPhaseId('main'),
      playedIsCoup: true,
      lookaheadIsCoup: false,
      consecutiveCoupRounds: 0,
    });
    const afterFirstCoupMain = advancePhase(def, firstCoup);
    assert.equal(afterFirstCoupMain.currentPhase, asPhaseId('coupVictory'));
    assert.equal(afterFirstCoupMain.turnCount, firstCoup.turnCount);

    const suppressedConsecutive = withBoundaryCards(base, {
      currentPhase: asPhaseId('main'),
      playedIsCoup: true,
      lookaheadIsCoup: false,
      consecutiveCoupRounds: 1,
    });
    const afterSuppressedMain = advancePhase(def, suppressedConsecutive);
    assert.equal(afterSuppressedMain.currentPhase, asPhaseId('main'));
    assert.equal(afterSuppressedMain.turnCount, suppressedConsecutive.turnCount + 1);
  });

  it('omits configured final-coup phases from effective turn progression', () => {
    const def = compileProductionDef();
    const base = initialState(def, 172, 4).state;
    const finalCoupRedeploy = withBoundaryCards(base, {
      currentPhase: asPhaseId('coupRedeploy'),
      playedIsCoup: true,
      consecutiveCoupRounds: 0,
    });
    const afterRedeploy = advancePhase(def, finalCoupRedeploy);

    assert.equal(afterRedeploy.currentPhase, asPhaseId('main'));
    assert.equal(afterRedeploy.turnCount, finalCoupRedeploy.turnCount + 1);
  });
});
