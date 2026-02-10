import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  computeFullHash,
  createZobristTable,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'apply-move-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'energy', type: 'int', init: 0, min: 0, max: 20 },
      { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
      { name: 'triggered', type: 'int', init: 0, min: 0, max: 10 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    actions: [
      {
        id: asActionId('play'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [{ name: 'boost', domain: { query: 'intsInRange', min: 1, max: 2 } }],
        pre: { op: '>=', left: { ref: 'gvar', var: 'energy' }, right: 2 },
        cost: [{ addVar: { scope: 'global', var: 'energy', delta: -2 } }],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: 'boost' } } }],
        limits: [{ scope: 'turn', max: 2 }],
      },
      {
        id: asActionId('broken'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [{ setVar: { scope: 'global', var: 'energy', value: 1 } }],
        effects: [{ setVar: { scope: 'global', var: 'missingVar', value: 1 } }],
        limits: [],
      },
    ],
    triggers: [
      {
        id: asTriggerId('onPlay'),
        event: { type: 'actionResolved', action: asActionId('play') },
        effects: [{ addVar: { scope: 'global', var: 'triggered', delta: 1 } }],
      },
    ],
    endConditions: [],
  }) as unknown as GameDef;

const createState = (): GameState => ({
  globalVars: { energy: 5, score: 0, triggered: 0 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [7n, 11n] },
  stateHash: 0n,
  actionUsage: {},
});

const playMove = (boost: number): Move => ({
  actionId: asActionId('play'),
  params: { boost },
});

describe('applyMove', () => {
  it('applies cost then effects, increments action usage, dispatches actionResolved trigger, and updates hash', () => {
    const def = createDef();
    const state = createState();
    const result = applyMove(def, state, playMove(2));

    assert.equal(result.state.globalVars.energy, 3);
    assert.equal(result.state.globalVars.score, 2);
    assert.equal(result.state.globalVars.triggered, 1);
    assert.deepEqual(result.state.actionUsage.play, { turnCount: 1, phaseCount: 1, gameCount: 1 });
    assert.deepEqual(result.triggerFirings, [
      {
        kind: 'fired',
        triggerId: asTriggerId('onPlay'),
        event: { type: 'actionResolved', action: asActionId('play') },
        depth: 0,
      },
    ]);

    const table = createZobristTable(def);
    assert.notEqual(result.state.stateHash, state.stateHash);
    assert.equal(result.state.stateHash, computeFullHash(table, result.state));
  });

  it('throws descriptive illegal-move error with actionId, params, and reason', () => {
    const def = createDef();
    const state = createState();
    const badMove: Move = {
      actionId: asActionId('play'),
      params: { boost: 99 },
    };

    assert.throws(() => applyMove(def, state, badMove), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { actionId?: unknown; params?: unknown; reason?: unknown };
      assert.equal(details.actionId, asActionId('play'));
      assert.deepEqual(details.params, { boost: 99 });
      assert.equal(typeof details.reason, 'string');
      assert.match(details.message, /Illegal move/);
      return true;
    });
  });

  it('keeps input state unchanged when applyMove fails during effect execution', () => {
    const def = createDef();
    const state = createState();
    const originalSnapshot = structuredClone(state);

    assert.throws(
      () =>
        applyMove(def, state, {
          actionId: asActionId('broken'),
          params: {},
        }),
      /missingVar/,
    );

    assert.deepEqual(state, originalSnapshot);
  });

  it('advances to the next decision point after actionResolved processing', () => {
    const def: GameDef = {
      ...createDef(),
      globalVars: [],
      turnStructure: {
        phases: [{ id: asPhaseId('p1') }, { id: asPhaseId('p2') }],
        activePlayerOrder: 'roundRobin',
      },
      actions: [
        {
          id: asActionId('advance'),
          actor: 'active',
          phase: asPhaseId('p1'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [{ scope: 'turn', max: 1 }],
        },
        {
          id: asActionId('decide'),
          actor: 'active',
          phase: asPhaseId('p2'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: {},
      currentPhase: asPhaseId('p1'),
      actionUsage: {},
    };

    const result = applyMove(def, state, {
      actionId: asActionId('advance'),
      params: {},
    });

    assert.equal(result.state.currentPhase, asPhaseId('p2'));
    assert.equal(result.state.turnCount, 0);
    assert.equal(result.state.activePlayer, asPlayerId(0));
  });
});
