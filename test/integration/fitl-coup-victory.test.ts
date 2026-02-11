import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  initialState,
  terminalResult,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';

const baseDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-coup-victory-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    turnFlow: {
      cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
      eligibility: { factions: ['us', 'nva'], overrideWindows: [] },
      optionMatrix: [],
      passRewards: [],
      durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
    },
    actions: [],
    triggers: [],
    endConditions: [],
  }) as unknown as GameDef;

describe('FITL coup victory integration', () => {
  it('halts phase auto-advancement when a during-coup threshold is reached after a move', () => {
    const def: GameDef = {
      ...baseDef(),
      globalVars: [{ name: 'usSupport', type: 'int', init: 50, min: 0, max: 75 }],
      actions: [
        {
          id: asActionId('boostSupport'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ addVar: { scope: 'global', var: 'usSupport', delta: 1 } }],
          limits: [],
        },
      ],
      victory: {
        checkpoints: [
          {
            id: 'us-threshold',
            faction: 'us',
            timing: 'duringCoup',
            when: { op: '>', left: { ref: 'gvar', var: 'usSupport' }, right: 50 },
          },
        ],
      },
    };
    const start = initialState(def, 101, 2);
    const move: Move = { actionId: asActionId('boostSupport'), params: {} };

    const applied = applyMove(def, start, move);
    const terminal = terminalResult(def, applied.state);

    assert.equal(applied.state.turnCount, 0);
    assert.equal(applied.state.currentPhase, asPhaseId('main'));
    assert.deepEqual(terminal, {
      type: 'win',
      player: 0,
      victory: {
        timing: 'duringCoup',
        checkpointId: 'us-threshold',
        winnerFaction: 'us',
      },
    });
  });

  it('computes final-coup winner from declarative margins and emits ordered ranking metadata', () => {
    const def: GameDef = {
      ...baseDef(),
      globalVars: [
        { name: 'isFinalCoup', type: 'int', init: 0, min: 0, max: 1 },
        { name: 'usMargin', type: 'int', init: 2, min: -99, max: 99 },
        { name: 'nvaMargin', type: 'int', init: 4, min: -99, max: 99 },
      ],
      actions: [
        {
          id: asActionId('markFinalCoup'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ setVar: { scope: 'global', var: 'isFinalCoup', value: 1 } }],
          limits: [],
        },
      ],
      victory: {
        checkpoints: [
          {
            id: 'final-coup',
            faction: 'us',
            timing: 'finalCoup',
            when: { op: '==', left: { ref: 'gvar', var: 'isFinalCoup' }, right: 1 },
          },
        ],
        margins: [
          { faction: 'us', value: { ref: 'gvar', var: 'usMargin' } },
          { faction: 'nva', value: { ref: 'gvar', var: 'nvaMargin' } },
        ],
        ranking: { order: 'desc' },
      },
    };
    const start = initialState(def, 202, 2);
    const move: Move = { actionId: asActionId('markFinalCoup'), params: {} };

    const applied = applyMove(def, start, move);
    const terminal = terminalResult(def, applied.state);

    assert.deepEqual(terminal, {
      type: 'win',
      player: 1,
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-coup',
        winnerFaction: 'nva',
        ranking: [
          { faction: 'nva', margin: 4, rank: 1, tieBreakKey: 'nva' },
          { faction: 'us', margin: 2, rank: 2, tieBreakKey: 'us' },
        ],
      },
    });
  });
});
