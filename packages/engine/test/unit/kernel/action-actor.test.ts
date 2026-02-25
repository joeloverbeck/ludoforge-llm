import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveActionActor } from '../../../src/kernel/action-actor.js';
import { buildAdjacencyGraph } from '../../../src/kernel/spatial.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  type ActionDef,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const makeAction = (overrides?: Partial<ActionDef>): ActionDef => ({
  id: asActionId('action'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
  ...overrides,
});

const makeDef = (action: ActionDef): GameDef =>
  ({
    metadata: { id: 'resolve-action-actor-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [action],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('resolveActionActor()', () => {
  it('returns applicable when decision player is included in actor selector', () => {
    const action = makeAction();
    const def = makeDef(action);
    const state = makeState();

    const result = resolveActionActor({
      def,
      state,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      action,
      decisionPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.deepEqual(result, { kind: 'applicable' });
  });

  it('returns notApplicable when actor does not include decision player', () => {
    const action = makeAction({ actor: { id: asPlayerId(1) } });
    const def = makeDef(action);
    const state = makeState();

    const result = resolveActionActor({
      def,
      state,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      action,
      decisionPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.deepEqual(result, { kind: 'notApplicable', reason: 'decisionPlayerNotActor' });
  });

  it('returns notApplicable when actor selector targets a player outside playerCount', () => {
    const action = makeAction({ actor: { id: asPlayerId(2) } });
    const def = makeDef(action);
    const state = makeState();

    const result = resolveActionActor({
      def,
      state,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      action,
      decisionPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.deepEqual(result, { kind: 'notApplicable', reason: 'actorOutsidePlayerCount' });
  });

  it('returns invalidSpec when actor selector shape is invalid', () => {
    const action = makeAction({ actor: '$owner' as unknown as ActionDef['actor'] });
    const def = makeDef(action);
    const state = makeState();

    const result = resolveActionActor({
      def,
      state,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      action,
      decisionPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.equal(result.kind, 'invalidSpec');
  });
});
