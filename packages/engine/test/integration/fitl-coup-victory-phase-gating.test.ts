import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  applyMove,
  asActionId,
  asPhaseId,
  asTokenId,
  createEvalRuntimeResources,
  initialState,
  legalMoves,
  initializeTurnFlowEligibilityState,
  legalChoicesDiscover,
  terminalResult,
  type GameDef,
  type GameState,
  type Move,
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

const withClearedZones = (def: GameDef, state: GameState): GameState => {
  const cleared: GameState = {
    ...state,
    zones: Object.fromEntries(Object.keys(state.zones).map((zoneId) => [zoneId, []])),
  };
  return initializeTurnFlowEligibilityState(def, cleared);
};

const resolveResourcesWithDefaultChoice = (def: GameDef, state: GameState): GameState => {
  const resourcesMove: Move = { actionId: asActionId('coupResourcesResolve'), params: {} };
  const pending = legalChoicesDiscover(def, state, resourcesMove);
  if (pending.kind !== 'pending') {
    return applyMove(def, state, resourcesMove).state;
  }
  if (pending.type !== 'chooseN') {
    throw new Error('Expected chooseN pending selector before coup resources resolution.');
  }
  return applyMove(def, state, {
    ...resourcesMove,
    params: {
      [pending.decisionKey]: pending.options.slice(0, pending.max ?? 0).map((option) => String(option.value)),
    },
  }).state;
};

describe('FITL coup victory phase gating', () => {
  it('compiles FITL checkpoint phase gates into the production GameDef', () => {
    const def = compileProductionDef();
    const phasesByCheckpoint = Object.fromEntries(
      (def.terminal.checkpoints ?? []).map((checkpoint) => [checkpoint.id, checkpoint.phases ?? null]),
    );

    assert.deepEqual(phasesByCheckpoint['us-victory'], ['coupVictory']);
    assert.deepEqual(phasesByCheckpoint['arvn-victory'], ['coupVictory']);
    assert.deepEqual(phasesByCheckpoint['nva-victory'], ['coupVictory']);
    assert.deepEqual(phasesByCheckpoint['vc-victory'], ['coupVictory']);
    assert.deepEqual(phasesByCheckpoint['final-coup-ranking'], ['coupRedeploy']);
  });

  it('halts in coupVictory when a during-coup checkpoint is met', () => {
    const def = compileProductionDef();
    const start = withClearedZones(def, initialState(def,8101, 4).state);
    const usReserve = Array.from({ length: 51 }, (_unused, index) => ({
      id: asTokenId(`us-reserve-${index}`),
      type: 'piece' as const,
      props: { faction: 'US', type: 'troops' as const },
    }));
    const state: GameState = {
      ...start,
      currentPhase: asPhaseId('coupVictory'),
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-during'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [{ id: asTokenId('lookahead-event'), type: 'card', props: { isCoup: false } }],
        'deck:none': [{ id: asTokenId('deck-event'), type: 'card', props: { isCoup: false } }],
        'available-US:none': usReserve,
      },
    };

    const applied = applyMove(def, state, { actionId: asActionId('coupVictoryCheck'), params: {} });

    assert.equal(applied.state.currentPhase, asPhaseId('coupVictory'));
    assert.equal(applied.state.turnCount, state.turnCount);
    assert.deepEqual(terminalResult(def, applied.state), {
      type: 'win',
      player: 0,
      victory: {
        timing: 'duringCoup',
        checkpointId: 'us-victory',
        winnerSeat: 'us',
        ranking: [
          { seat: 'us', margin: 1, rank: 1, tieBreakKey: 'us' },
          { seat: 'nva', margin: -18, rank: 2, tieBreakKey: 'nva' },
          { seat: 'vc', margin: -35, rank: 3, tieBreakKey: 'vc' },
          { seat: 'arvn', margin: -50, rank: 4, tieBreakKey: 'arvn' },
        ],
      },
    });
  });

  it('advances from coupVictory to coupResources, then to coupSupport after coupResourcesResolve', () => {
    const def = compileProductionDef();
    const start = withClearedZones(def, initialState(def,8102, 4).state);
    const state: GameState = {
      ...start,
      currentPhase: asPhaseId('coupVictory'),
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-no-win'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [{ id: asTokenId('lookahead-event'), type: 'card', props: { isCoup: false } }],
        'deck:none': [{ id: asTokenId('deck-event'), type: 'card', props: { isCoup: false } }],
      },
    };

    const applied = applyMove(def, state, { actionId: asActionId('coupVictoryCheck'), params: {} });
    const afterResources = { state: resolveResourcesWithDefaultChoice(def, applied.state) };

    assert.equal(terminalResult(def, applied.state), null);
    assert.equal(applied.state.currentPhase, asPhaseId('coupResources'));
    assert.equal(afterResources.state.currentPhase, asPhaseId('coupSupport'));
    assert.equal(afterResources.state.turnCount, state.turnCount);
  });

  it('resolves final-coup ranking after coupRedeploy on the last coup round', () => {
    const def = compileProductionDef();
    const start = withClearedZones(def, initialState(def,8103, 4).state);
    const state: GameState = {
      ...start,
      currentPhase: asPhaseId('coupRedeploy'),
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-final'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [],
        'deck:none': [],
      },
    };

    const applied = applyMove(def, state, { actionId: asActionId('coupRedeployPass'), params: {} });

    assert.equal(applied.state.currentPhase, asPhaseId('coupRedeploy'));
    assert.equal(applied.state.turnCount, state.turnCount);
    assert.deepEqual(terminalResult(def, applied.state), {
      type: 'win',
      player: 2,
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-coup-ranking',
        winnerSeat: 'nva',
        ranking: [
          { seat: 'nva', margin: -18, rank: 1, tieBreakKey: 'nva' },
          { seat: 'vc', margin: -35, rank: 2, tieBreakKey: 'vc' },
          { seat: 'arvn', margin: -50, rank: 3, tieBreakKey: 'arvn' },
          { seat: 'us', margin: -50, rank: 4, tieBreakKey: 'us' },
        ],
      },
    });
  });

  it('does not end the game when a during-coup threshold is crossed in coupSupport', () => {
    const def = compileProductionDef();
    const start = withClearedZones(def, initialState(def, 8104, 4).state);
    const usReserve = Array.from({ length: 51 }, (_unused, index) => ({
      id: asTokenId(`us-mid-coup-reserve-${index}`),
      type: 'piece' as const,
      props: { faction: 'US', type: 'troops' as const },
    }));
    const state: GameState = {
      ...start,
      currentPhase: asPhaseId('coupSupport'),
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-support'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [{ id: asTokenId('lookahead-event'), type: 'card', props: { isCoup: false } }],
        'deck:none': [{ id: asTokenId('deck-event'), type: 'card', props: { isCoup: false } }],
        'available-US:none': usReserve,
      },
    };

    assert.equal(terminalResult(def, state), null);
  });

  it('reaches coupRedeploy with redeploy-phase actions when nobody wins at coupVictory', () => {
    const def = compileProductionDef();
    const start = withClearedZones(def, initialState(def, 8105, 4).state);
    const state: GameState = {
      ...start,
      currentPhase: asPhaseId('coupVictory'),
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-nonfinal'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [{ id: asTokenId('lookahead-event'), type: 'card', props: { isCoup: false } }],
        'deck:none': [{ id: asTokenId('deck-event'), type: 'card', props: { isCoup: false } }],
      },
    };

    const afterVictory = applyMove(def, state, { actionId: asActionId('coupVictoryCheck'), params: {} }).state;
    const afterResources = resolveResourcesWithDefaultChoice(def, afterVictory);
    const atRedeploy = advancePhase({ def, state: afterResources, evalRuntimeResources: createEvalRuntimeResources() });
    const moveIds = new Set(legalMoves(def, atRedeploy).map((move) => String(move.actionId)));

    assert.equal(terminalResult(def, afterVictory), null);
    assert.equal(terminalResult(def, afterResources), null);
    assert.equal(afterVictory.currentPhase, asPhaseId('coupResources'));
    assert.equal(afterResources.currentPhase, asPhaseId('coupSupport'));
    assert.equal(atRedeploy.currentPhase, asPhaseId('coupRedeploy'));
    assert.equal(moveIds.has('coupRedeployPass'), true);
  });

  it('plays through coupResources and coupSupport before final-coup ranking resolves at coupRedeploy', () => {
    const def = compileProductionDef();
    const start = withClearedZones(def, initialState(def, 8106, 4).state);
    const atResources: GameState = {
      ...start,
      currentPhase: asPhaseId('coupResources'),
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-final-flow'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [],
        'deck:none': [],
      },
    };
    const atSupport: GameState = {
      ...atResources,
      currentPhase: asPhaseId('coupSupport'),
    };
    const atRedeploy: GameState = {
      ...atResources,
      currentPhase: asPhaseId('coupRedeploy'),
    };
    const afterRedeployPass = applyMove(def, atRedeploy, { actionId: asActionId('coupRedeployPass'), params: {} }).state;

    assert.equal(terminalResult(def, atResources), null);
    assert.equal(terminalResult(def, atSupport), null);
    assert.deepEqual(terminalResult(def, atRedeploy), {
      type: 'win',
      player: 2,
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-coup-ranking',
        winnerSeat: 'nva',
        ranking: [
          { seat: 'nva', margin: -18, rank: 1, tieBreakKey: 'nva' },
          { seat: 'vc', margin: -35, rank: 2, tieBreakKey: 'vc' },
          { seat: 'arvn', margin: -50, rank: 3, tieBreakKey: 'arvn' },
          { seat: 'us', margin: -50, rank: 4, tieBreakKey: 'us' },
        ],
      },
    });
    assert.deepEqual(terminalResult(def, afterRedeployPass), {
      type: 'win',
      player: 2,
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-coup-ranking',
        winnerSeat: 'nva',
        ranking: [
          { seat: 'nva', margin: -18, rank: 1, tieBreakKey: 'nva' },
          { seat: 'vc', margin: -35, rank: 2, tieBreakKey: 'vc' },
          { seat: 'arvn', margin: -50, rank: 3, tieBreakKey: 'arvn' },
          { seat: 'us', margin: -50, rank: 4, tieBreakKey: 'us' },
        ],
      },
    });
  });
});
