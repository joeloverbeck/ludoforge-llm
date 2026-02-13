import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asTriggerId,
  asZoneId,
  dispatchTriggers,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const createState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { enabled: 1, score: 0, enteredB: 0, enteredC: 0 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'a:none': [],
    'b:none': [],
    'c:none': [],
  },
  nextTokenOrdinal: 1,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [5n, 9n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

describe('dispatchTriggers', () => {
  it('accepts a prebuilt adjacency graph for trigger recursion paths', () => {
    const def: GameDef = {
      metadata: { id: 'trigger-prebuilt-graph', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
      perPlayerVars: [],
      zones: [{ id: asZoneId('a:none'), owner: 'none', visibility: 'public', ordering: 'stack' }],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [],
      triggers: [],
      terminal: { conditions: [] },
    };

    const state = createState({
      globalVars: { enabled: 1, score: 0, enteredB: 0, enteredC: 0 },
      zones: { 'a:none': [] },
    });
    const adjacencyGraph = buildAdjacencyGraph(def.zones);

    const result = dispatchTriggers(def, state, { state: state.rng }, { type: 'turnStart' }, 0, 8, [], adjacencyGraph);

    assert.equal(result.state, state);
    assert.deepEqual(result.triggerLog, []);
  });

  it('fires matching triggers in definition order and applies match/when filters', () => {
    const def: GameDef = {
      metadata: { id: 'trigger-match-when', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [
        { name: 'enabled', type: 'int', init: 1, min: 0, max: 1 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [],
      triggers: [
        {
          id: asTriggerId('byMatch'),
          event: { type: 'actionResolved' },
          match: { op: '==', left: { ref: 'binding', name: '$action' }, right: asActionId('play') },
          effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
        },
        {
          id: asTriggerId('byWhen'),
          event: { type: 'actionResolved', action: asActionId('play') },
          when: { op: '==', left: { ref: 'gvar', var: 'enabled' }, right: 1 },
          effects: [{ addVar: { scope: 'global', var: 'score', delta: 2 } }],
        },
        {
          id: asTriggerId('noMatch'),
          event: { type: 'actionResolved', action: asActionId('other') },
          effects: [{ addVar: { scope: 'global', var: 'score', delta: 50 } }],
        },
      ],
      terminal: { conditions: [] },
    };

    const result = dispatchTriggers(
      def,
      createState(),
      { state: createState().rng },
      { type: 'actionResolved', action: asActionId('play') },
      0,
      8,
      [],
    );

    assert.equal(result.state.globalVars.score, 3);
    assert.deepEqual(result.triggerLog, [
      { kind: 'fired', triggerId: asTriggerId('byMatch'), event: { type: 'actionResolved', action: asActionId('play') }, depth: 0 },
      { kind: 'fired', triggerId: asTriggerId('byWhen'), event: { type: 'actionResolved', action: asActionId('play') }, depth: 0 },
    ]);
  });

  it('cascades emitted events depth-first in deterministic order', () => {
    const def: GameDef = {
      metadata: { id: 'trigger-cascade-order', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [
        { name: 'enabled', type: 'int', init: 1, min: 0, max: 1 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
        { name: 'enteredB', type: 'int', init: 0, min: 0, max: 10 },
        { name: 'enteredC', type: 'int', init: 0, min: 0, max: 10 },
      ],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('a:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: asZoneId('b:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: asZoneId('c:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
      tokenTypes: [{ id: 'card', props: {} }],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [],
      triggers: [
        {
          id: asTriggerId('onTurnStart'),
          event: { type: 'turnStart' },
          effects: [{ moveAll: { from: 'a:none', to: 'b:none' } }],
        },
        {
          id: asTriggerId('onEnterB'),
          event: { type: 'tokenEntered', zone: asZoneId('b:none') },
          effects: [
            { addVar: { scope: 'global', var: 'enteredB', delta: 1 } },
            { moveAll: { from: 'b:none', to: 'c:none' } },
          ],
        },
        {
          id: asTriggerId('onEnterC'),
          event: { type: 'tokenEntered', zone: asZoneId('c:none') },
          effects: [{ addVar: { scope: 'global', var: 'enteredC', delta: 1 } }],
        },
      ],
      terminal: { conditions: [] },
    };

    const state = createState({
      zones: {
        'a:none': [{ id: asTokenId('t1'), type: 'card', props: {} }],
        'b:none': [],
        'c:none': [],
      },
      nextTokenOrdinal: 2,
    });

    const result = dispatchTriggers(def, state, { state: state.rng }, { type: 'turnStart' }, 0, 8, []);
    assert.equal(result.state.globalVars.enteredB, 1);
    assert.equal(result.state.globalVars.enteredC, 1);
    assert.deepEqual(result.triggerLog, [
      { kind: 'fired', triggerId: asTriggerId('onTurnStart'), event: { type: 'turnStart' }, depth: 0 },
      { kind: 'fired', triggerId: asTriggerId('onEnterB'), event: { type: 'tokenEntered', zone: asZoneId('b:none') }, depth: 1 },
      { kind: 'fired', triggerId: asTriggerId('onEnterC'), event: { type: 'tokenEntered', zone: asZoneId('c:none') }, depth: 2 },
    ]);
  });

  it('logs truncation at depth limit with no effects at truncated node', () => {
    const def: GameDef = {
      metadata: { id: 'trigger-truncation', players: { min: 2, max: 2 }, maxTriggerDepth: 1 },
      constants: {},
      globalVars: [
        { name: 'enabled', type: 'int', init: 1, min: 0, max: 1 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
        { name: 'enteredB', type: 'int', init: 0, min: 0, max: 10 },
        { name: 'enteredC', type: 'int', init: 0, min: 0, max: 10 },
      ],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('a:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: asZoneId('b:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: asZoneId('c:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
      tokenTypes: [{ id: 'card', props: {} }],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [],
      triggers: [
        {
          id: asTriggerId('onTurnStart'),
          event: { type: 'turnStart' },
          effects: [{ moveAll: { from: 'a:none', to: 'b:none' } }],
        },
        {
          id: asTriggerId('onEnterB'),
          event: { type: 'tokenEntered', zone: asZoneId('b:none') },
          effects: [
            { addVar: { scope: 'global', var: 'enteredB', delta: 1 } },
            { moveAll: { from: 'b:none', to: 'c:none' } },
          ],
        },
        {
          id: asTriggerId('onEnterC'),
          event: { type: 'tokenEntered', zone: asZoneId('c:none') },
          effects: [{ addVar: { scope: 'global', var: 'enteredC', delta: 1 } }],
        },
      ],
      terminal: { conditions: [] },
    };

    const state = createState({
      zones: {
        'a:none': [{ id: asTokenId('t1'), type: 'card', props: {} }],
        'b:none': [],
        'c:none': [],
      },
      nextTokenOrdinal: 2,
    });

    const result = dispatchTriggers(def, state, { state: state.rng }, { type: 'turnStart' }, 0, 1, []);

    assert.equal(result.state.globalVars.enteredB, 1);
    assert.equal(result.state.globalVars.enteredC, 0);
    assert.equal(result.state.zones['c:none']?.length, 1);
    assert.deepEqual(result.triggerLog, [
      { kind: 'fired', triggerId: asTriggerId('onTurnStart'), event: { type: 'turnStart' }, depth: 0 },
      { kind: 'fired', triggerId: asTriggerId('onEnterB'), event: { type: 'tokenEntered', zone: asZoneId('b:none') }, depth: 1 },
      { kind: 'truncated', event: { type: 'tokenEntered', zone: asZoneId('c:none') }, depth: 2 },
    ]);
  });
});
