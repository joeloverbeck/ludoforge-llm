import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  asActionId,
  createCollector,
  createEvalRuntimeResources,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asTriggerId,
  asZoneId,
  dispatchTriggers,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { eff } from '../helpers/effect-tag-helper.js';

const createState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { enabled: 1, score: 0, enteredB: 0, enteredC: 0 },
  perPlayerVars: {},
  zoneVars: {},
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
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

const createMinimalDef = (): GameDef => ({
  metadata: { id: 'trigger-contract-minimal', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const createValidRequest = (): Parameters<typeof dispatchTriggers>[0] => {
  const state = createState({ zones: {} });
  return {
    def: createMinimalDef(),
    state,
    rng: { state: state.rng },
    event: { type: 'turnStart' },
    depth: 0,
    maxDepth: 8,
    triggerLog: [],
  };
};

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

    const result = dispatchTriggers({
      def,
      state,
      rng: { state: state.rng },
      event: { type: 'turnStart' },
      depth: 0,
      maxDepth: 8,
      triggerLog: [],
      adjacencyGraph,
    });

    assert.equal(result.state, state);
    assert.deepEqual(result.triggerLog, []);
  });

  it('uses the provided eval runtime resources as the sole collector ownership path', () => {
    const def: GameDef = {
      metadata: { id: 'trigger-resource-ownership', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [],
      triggers: [
        {
          id: asTriggerId('onTurnStart'),
          event: { type: 'turnStart' },
          effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        },
      ],
      terminal: { conditions: [] },
    };

    const state = createState({ globalVars: { enabled: 1, score: 0, enteredB: 0, enteredC: 0 } });
    const collector = createCollector({ trace: true });
    const resources = createEvalRuntimeResources({ collector });

    const result = dispatchTriggers({
      def,
      state,
      rng: { state: state.rng },
      event: { type: 'turnStart' },
      depth: 0,
      maxDepth: 8,
      triggerLog: [],
      effectPathRoot: 'resourceContract',
      evalRuntimeResources: resources,
    });

    assert.equal(result.state.globalVars.score, 1);
    assert.ok(collector.trace !== null);
    assert.equal(collector.trace.length, 1);
    assert.equal(collector.trace[0]?.kind, 'varChange');
    assert.match(collector.trace[0]?.provenance.effectPath ?? '', /^resourceContract\.trigger:onTurnStart\.effects/);
  });

  it('fails fast when request.effectPathRoot is not a string', () => {
    const def: GameDef = {
      metadata: { id: 'trigger-invalid-effect-root', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [],
      triggers: [],
      terminal: { conditions: [] },
    };
    const state = createState({ zones: {} });

    assert.throws(
      () => dispatchTriggers({
        def,
        state,
        rng: { state: state.rng },
        event: { type: 'turnStart' },
        depth: 0,
        maxDepth: 8,
        triggerLog: [],
        effectPathRoot: 7 as unknown as string,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /effectPathRoot must be a string/);
        return true;
      },
    );
  });

  it('fails fast when request.evalRuntimeResources misses required ownership fields', () => {
    const def: GameDef = {
      metadata: { id: 'trigger-invalid-resources', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [],
      triggers: [],
      terminal: { conditions: [] },
    };
    const state = createState({ zones: {} });
    const invalidResources = {};

    assert.throws(
      () => dispatchTriggers({
        def,
        state,
        rng: { state: state.rng },
        event: { type: 'turnStart' },
        depth: 0,
        maxDepth: 8,
        triggerLog: [],
        evalRuntimeResources: invalidResources as unknown as ReturnType<typeof createEvalRuntimeResources>,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /evalRuntimeResources\.collector must be an object/);
        return true;
      },
    );
  });

  it('fails fast when request.evalRuntimeResources.collector.warnings is not an array', () => {
    const state = createState({ zones: {} });
    const invalidResources = {
      collector: { warnings: {}, trace: [] },
    };

    assert.throws(
      () => dispatchTriggers({
        ...createValidRequest(),
        state,
        rng: { state: state.rng },
        evalRuntimeResources: invalidResources as unknown as ReturnType<typeof createEvalRuntimeResources>,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /collector\.warnings must be an array/);
        return true;
      },
    );
  });

  it('fails fast when request.evalRuntimeResources.collector.trace is neither array nor null', () => {
    const state = createState({ zones: {} });
    const invalidResources = {
      collector: { warnings: [], trace: {} },
    };

    assert.throws(
      () => dispatchTriggers({
        ...createValidRequest(),
        state,
        rng: { state: state.rng },
        evalRuntimeResources: invalidResources as unknown as ReturnType<typeof createEvalRuntimeResources>,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /collector\.trace must be an array or null/);
        return true;
      },
    );
  });

  it('fails fast when request.evalRuntimeResources.collector contains unknown keys', () => {
    const state = createState({ zones: {} });
    const invalidResources = {
      collector: { warnings: [], trace: null, legacyTraceSink: [] },
    };

    assert.throws(
      () => dispatchTriggers({
        ...createValidRequest(),
        state,
        rng: { state: state.rng },
        evalRuntimeResources: invalidResources as unknown as ReturnType<typeof createEvalRuntimeResources>,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /collector contains unknown key\(s\): legacyTraceSink/);
        return true;
      },
    );
  });

  it('fails fast when request.evalRuntimeResources contains unknown top-level keys', () => {
    const state = createState({ zones: {} });
    const invalidResources = {
      collector: createCollector({ trace: true }),
      queryRuntimeCache: {
        getTokenStateIndex: 'not-a-function',
      } as const,
    };

    assert.throws(
      () =>
        dispatchTriggers({
        ...createValidRequest(),
        state,
        rng: { state: state.rng },
        evalRuntimeResources: invalidResources as unknown as ReturnType<typeof createEvalRuntimeResources>,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /unknown resource key\(s\): queryRuntimeCache/);
        return true;
      },
    );
  });

  it('fails fast when request is not an object', () => {
    assert.throws(
      () => dispatchTriggers(undefined as unknown as Parameters<typeof dispatchTriggers>[0]),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /request must be an object/);
        return true;
      },
    );
  });

  it('fails fast when request.event.type is not a string', () => {
    const invalidRequest = { ...createValidRequest(), event: { type: 7 } };

    assert.throws(
      () => dispatchTriggers(invalidRequest as unknown as Parameters<typeof dispatchTriggers>[0]),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /request.event.type must be a string/);
        return true;
      },
    );
  });

  it('fails fast when request.depth is not a safe integer', () => {
    const invalidRequest = { ...createValidRequest(), depth: Number.NaN };

    assert.throws(
      () => dispatchTriggers(invalidRequest as unknown as Parameters<typeof dispatchTriggers>[0]),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /request.depth must be a safe integer/);
        return true;
      },
    );
  });

  it('fails fast when request.triggerLog is not an array', () => {
    const invalidRequest = { ...createValidRequest(), triggerLog: {} };

    assert.throws(
      () => dispatchTriggers(invalidRequest as unknown as Parameters<typeof dispatchTriggers>[0]),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /request.triggerLog must be an array/);
        return true;
      },
    );
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
          match: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$action' }, right: asActionId('play') },
          effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        },
        {
          id: asTriggerId('byWhen'),
          event: { type: 'actionResolved', action: asActionId('play') },
          when: { op: '==', left: { _t: 2 as const, ref: 'gvar', var: 'enabled' }, right: 1 },
          effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 2 } })],
        },
        {
          id: asTriggerId('noMatch'),
          event: { type: 'actionResolved', action: asActionId('other') },
          effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 50 } })],
        },
      ],
      terminal: { conditions: [] },
    };

    const result = dispatchTriggers({
      def,
      state: createState(),
      rng: { state: createState().rng },
      event: { type: 'actionResolved', action: asActionId('play') },
      depth: 0,
      maxDepth: 8,
      triggerLog: [],
    });

    assert.equal(result.state.globalVars.score, 3);
    assert.deepEqual(result.triggerLog, [
      { kind: 'fired', triggerId: asTriggerId('byMatch'), event: { type: 'actionResolved', action: asActionId('play') }, depth: 0 },
      { kind: 'fired', triggerId: asTriggerId('byWhen'), event: { type: 'actionResolved', action: asActionId('play') }, depth: 0 },
    ]);
  });

  it('matches varChanged trigger filters and exposes var-change bindings', () => {
    const def: GameDef = {
      metadata: { id: 'trigger-var-changed', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [
        { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
        { name: 'capturedOld', type: 'int', init: 0, min: 0, max: 100 },
        { name: 'capturedNew', type: 'int', init: 0, min: 0, max: 100 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [],
      triggers: [
        {
          id: asTriggerId('onTrailChanged'),
          event: { type: 'varChanged', scope: 'global', var: 'trail' },
          when: { op: '>', left: { _t: 2 as const, ref: 'binding', name: '$newValue' }, right: { _t: 2 as const, ref: 'binding', name: '$oldValue' } },
          effects: [
            eff({ setVar: { scope: 'global', var: 'capturedOld', value: { _t: 2 as const, ref: 'binding', name: '$oldValue' } } }),
            eff({ setVar: { scope: 'global', var: 'capturedNew', value: { _t: 2 as const, ref: 'binding', name: '$newValue' } } }),
            eff({ addVar: { scope: 'global', var: 'score', delta: 1 } }),
          ],
        },
      ],
      terminal: { conditions: [] },
    };

    const state = createState({
      globalVars: {
        enabled: 1,
        score: 0,
        enteredB: 0,
        enteredC: 0,
        capturedOld: 0,
        capturedNew: 0,
      },
    });
    const result = dispatchTriggers({
      def,
      state,
      rng: { state: state.rng },
      event: { type: 'varChanged', scope: 'global', var: 'trail', oldValue: 1, newValue: 3 },
      depth: 0,
      maxDepth: 8,
      triggerLog: [],
    });

    assert.equal(result.state.globalVars.score, 1);
    assert.equal(result.state.globalVars.capturedOld, 1);
    assert.equal(result.state.globalVars.capturedNew, 3);
    assert.deepEqual(result.triggerLog, [
      {
        kind: 'fired',
        triggerId: asTriggerId('onTrailChanged'),
        event: { type: 'varChanged', scope: 'global', var: 'trail', oldValue: 1, newValue: 3 },
        depth: 0,
      },
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
          effects: [eff({ moveAll: { from: 'a:none', to: 'b:none' } })],
        },
        {
          id: asTriggerId('onEnterB'),
          event: { type: 'tokenEntered', zone: asZoneId('b:none') },
          effects: [
            eff({ addVar: { scope: 'global', var: 'enteredB', delta: 1 } }),
            eff({ moveAll: { from: 'b:none', to: 'c:none' } }),
          ],
        },
        {
          id: asTriggerId('onEnterC'),
          event: { type: 'tokenEntered', zone: asZoneId('c:none') },
          effects: [eff({ addVar: { scope: 'global', var: 'enteredC', delta: 1 } })],
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

    const result = dispatchTriggers({
      def,
      state,
      rng: { state: state.rng },
      event: { type: 'turnStart' },
      depth: 0,
      maxDepth: 8,
      triggerLog: [],
    });
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
          effects: [eff({ moveAll: { from: 'a:none', to: 'b:none' } })],
        },
        {
          id: asTriggerId('onEnterB'),
          event: { type: 'tokenEntered', zone: asZoneId('b:none') },
          effects: [
            eff({ addVar: { scope: 'global', var: 'enteredB', delta: 1 } }),
            eff({ moveAll: { from: 'b:none', to: 'c:none' } }),
          ],
        },
        {
          id: asTriggerId('onEnterC'),
          event: { type: 'tokenEntered', zone: asZoneId('c:none') },
          effects: [eff({ addVar: { scope: 'global', var: 'enteredC', delta: 1 } })],
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

    const result = dispatchTriggers({
      def,
      state,
      rng: { state: state.rng },
      event: { type: 'turnStart' },
      depth: 0,
      maxDepth: 1,
      triggerLog: [],
    });

    assert.equal(result.state.globalVars.enteredB, 1);
    assert.equal(result.state.globalVars.enteredC, 0);
    assert.equal(result.state.zones['c:none']?.length, 1);
    assert.deepEqual(result.triggerLog, [
      { kind: 'fired', triggerId: asTriggerId('onTurnStart'), event: { type: 'turnStart' }, depth: 0 },
      { kind: 'fired', triggerId: asTriggerId('onEnterB'), event: { type: 'tokenEntered', zone: asZoneId('b:none') }, depth: 1 },
      { kind: 'truncated', event: { type: 'varChanged', scope: 'global', var: 'enteredB', oldValue: 0, newValue: 1 }, depth: 2 },
      { kind: 'truncated', event: { type: 'tokenEntered', zone: asZoneId('c:none') }, depth: 2 },
    ]);
  });
});
