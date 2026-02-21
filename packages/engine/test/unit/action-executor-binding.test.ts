import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  legalMoves,
  type GameDef,
} from '../../src/kernel/index.js';

const buildDef = (): GameDef =>
  ({
    metadata: { id: 'action-executor-binding', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('assignScore'),
        actor: 'active',
        executor: { chosen: '$owner' },
        phase: [asPhaseId('main')],
        params: [{ name: '$owner', domain: { query: 'players' } }],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'perPlayer', player: 'actor', var: 'score', delta: 1 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const buildInvalidBindingDef = (): GameDef =>
  ({
    metadata: { id: 'action-executor-binding-invalid', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('invalidExecutorBinding'),
        actor: 'active',
        executor: { chosen: '$owner' },
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('action executor binding', () => {
  it('resolves executor from declared action params in legalMoves and applyMove', () => {
    const def = buildDef();
    const state = initialState(def, 7, 2).state;
    const moves = legalMoves(def, state);

    assert.deepEqual(
      moves.map((move) => move.params.$owner).sort(),
      [asPlayerId(0), asPlayerId(1)],
    );

    const pickOne = moves.find((move) => move.params.$owner === asPlayerId(1));
    assert.ok(pickOne !== undefined);

    const next = applyMove(def, state, pickOne!).state;
    assert.equal(next.perPlayerVars[0]?.score, 0);
    assert.equal(next.perPlayerVars[1]?.score, 1);
  });

  it('reports applyMove surface for missing required executor binding', () => {
    const def = buildDef();
    const state = initialState(def, 7, 2).state;

    assert.throws(() => applyMove(def, state, { actionId: asActionId('assignScore'), params: {} }), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.equal(details.context?.surface, 'applyMove');
      assert.equal(details.context?.selector, 'executor');
      assert.equal(String(details.context?.actionId), 'assignScore');
      return true;
    });
  });

  it('projects missing executor binding as runtime contract error on legalMoves surface', () => {
    const def = buildInvalidBindingDef();
    const state = initialState(def, 7, 2).state;

    assert.throws(() => legalMoves(def, state), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.equal(details.context?.surface, 'legalMoves');
      assert.equal(details.context?.selector, 'executor');
      assert.equal(String(details.context?.actionId), 'invalidExecutorBinding');
      return true;
    });
  });
});
