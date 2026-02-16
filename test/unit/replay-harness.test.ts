import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  initialState,
  type ActionDef,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import { advancePhaseBounded, replayScript } from '../helpers/replay-harness.js';

const createReplayDef = (): GameDef => {
  const tick: ActionDef = {
    id: asActionId('tick'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('p1'), asPhaseId('p2'), asPhaseId('p3')],
    params: [],
    pre: null,
    cost: [],
    effects: [
      { addVar: { scope: 'global', var: 'ticks', delta: 1 } },
      { advancePhase: {} },
    ],
    limits: [],
  };

  return {
    metadata: { id: 'replay-harness-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'ticks', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('p1') }, { id: asPhaseId('p2') }, { id: asPhaseId('p3') }],
    },
    actions: [tick],
    triggers: [],
    terminal: { conditions: [] },
  } as unknown as GameDef;
};

describe('replay harness helpers', () => {
  it('replays scripted moves and provides strict per-step assertions', () => {
    const def = createReplayDef();
    const seeded = initialState(def, 7, 2);
    const move: Move = { actionId: asActionId('tick'), params: {} };

    const replayed = replayScript({
      def,
      initialState: seeded,
      script: [{ move }, { move }],
      executionOptions: { advanceToDecisionPoint: false, maxPhaseTransitionsPerMove: 1 },
      assertStep: ({ stepIndex, executed }) => {
        assert.equal(Number(executed.after.globalVars.ticks), stepIndex + 1);
      },
      keyVars: ['ticks'],
    });

    assert.equal(replayed.steps.length, 2);
    assert.equal(replayed.final.currentPhase, 'p3');
    assert.equal(Number(replayed.final.globalVars.ticks), 2);
  });

  it('fails replay deterministically with actionable diagnostics when a step is illegal', () => {
    const def = createReplayDef();
    const seeded = initialState(def, 7, 2);
    const illegalMove: Move = { actionId: asActionId('missingAction'), params: {} };

    assert.throws(
      () =>
        replayScript({
          def,
          initialState: seeded,
          script: [{ move: illegalMove }],
          keyVars: ['ticks'],
        }),
      /Replay illegal move at step=0 .*phase=p1 .*activePlayer=0 .*keyVars=\{"ticks":0\}/,
    );
  });

  it('supports actionId legality mode when exact move serialization differs', () => {
    const action: ActionDef = {
      id: asActionId('pair'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('p1')],
      params: [
        { name: 'first', domain: { query: 'enums', values: ['A'] } },
        { name: 'second', domain: { query: 'enums', values: ['B'] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const def = {
      ...createReplayDef(),
      turnStructure: { phases: [{ id: asPhaseId('p1') }] },
      actions: [action],
    } as unknown as GameDef;
    const seeded = initialState(def, 7, 2);
    const scripted: Move = {
      actionId: asActionId('pair'),
      params: { second: 'B', first: 'A' },
    };

    assert.throws(() =>
      replayScript({
        def,
        initialState: seeded,
        script: [{ move: scripted }],
      }));

    assert.doesNotThrow(() =>
      replayScript({
        def,
        initialState: seeded,
        script: [{ move: scripted }],
        legalityMode: 'actionId',
      }));
  });

  it('fails bounded phase advance with deterministic diagnostics when cap is exceeded', () => {
    const def = createReplayDef();
    const seeded = initialState(def, 7, 2);

    assert.throws(
      () =>
        advancePhaseBounded({
          def,
          initialState: seeded,
          until: (state) => state.currentPhase === 'p3',
          maxSteps: 1,
          keyVars: ['ticks'],
        }),
      /Bounded phase advance exhausted maxSteps=1 phase=p2 activePlayer=0 keyVars=\{"ticks":0\}/,
    );
  });
});
