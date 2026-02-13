import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  evalCondition,
  evalQuery,
  initialState,
  legalMoves,
  validateGameDef,
  type EvalContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { generateGrid, generateHex } from '../../src/cnl/index.js';

const makeRuntimeDef = (): GameDef => ({
  metadata: { id: 'spatial-kernel-integration', players: { min: 1, max: 2 }, maxTriggerDepth: 8 },
  constants: {},
  globalVars: [{ name: 'entered', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('a:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [asZoneId('b:none')] },
    { id: asZoneId('b:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [asZoneId('a:none')] },
    { id: asZoneId('c:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [{ id: 'pawn', props: {} }],
  setup: [{ createToken: { type: 'pawn', zone: 'a:none' } }],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [
    {
      id: asActionId('step'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [{ name: '$token', domain: { query: 'tokensInZone', zone: 'a:none' } }],
      pre: null,
      cost: [],
      effects: [{ moveTokenAdjacent: { token: '$token', from: 'a:none', direction: 'b:none' } }],
      limits: [],
    },
  ],
  triggers: [
    {
      id: asTriggerId('onEnteredB'),
      event: { type: 'tokenEntered', zone: asZoneId('b:none') },
      effects: [{ addVar: { scope: 'global', var: 'entered', delta: 1 } }],
    },
  ],
  terminal: { conditions: [{ when: { op: '>=', left: { ref: 'gvar', var: 'entered' }, right: 1 }, result: { type: 'draw' } }] },
});

const makeRuntimeState = (): GameState => ({
  globalVars: { entered: 0 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'a:none': [],
    'b:none': [],
    'c:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [3n, 7n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeEvalCtx = (): EvalContext => {
  const def = makeRuntimeDef();
  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: makeRuntimeState(),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: { $reachable: [asZoneId('b:none')] },
    collector: createCollector(),
  };
};

const makeMacroBackedDef = (zones: GameDef['zones']): GameDef => ({
  metadata: { id: 'spatial-macro-validation', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones,
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

describe('spatial kernel integration', () => {
  it('evaluates spatial query and spatial condition together via runtime context', () => {
    const ctx = makeEvalCtx();

    const connected = evalQuery(
      {
        query: 'connectedZones',
        zone: 'a:none',
        via: { op: 'in', item: { ref: 'binding', name: '$zone' }, set: { ref: 'binding', name: '$reachable' } },
      },
      ctx,
    );
    const isConnected = evalCondition({ op: 'connected', from: 'a:none', to: 'b:none' }, ctx);

    assert.deepEqual(connected, [asZoneId('b:none')]);
    assert.equal(isConnected, true);
  });

  it('moveTokenAdjacent emits tokenEntered and trigger dispatch applies downstream effects', () => {
    const def = makeRuntimeDef();
    const state = initialState(def, 11, 2);
    const move = legalMoves(def, state)[0];

    assert.ok(move !== undefined);

    const result = applyMove(def, state, move);

    assert.equal(result.state.globalVars.entered, 1);
    assert.equal(result.state.zones['b:none']?.length, 1);
    assert.equal(result.state.zones['a:none']?.length, 0);
    assert.ok(result.triggerFirings.some((entry) => entry.kind === 'fired' && String(entry.triggerId) === 'onEnteredB'));
  });

  it('macro-generated topologies validate without spatial diagnostics', () => {
    const gridDiagnostics = validateGameDef(makeMacroBackedDef(generateGrid(3, 3)));
    const hexDiagnostics = validateGameDef(makeMacroBackedDef(generateHex(1)));
    const hasSpatialError = (code: string): boolean => code.startsWith('SPATIAL_');

    assert.equal(gridDiagnostics.some((diag) => hasSpatialError(diag.code) && diag.severity === 'error'), false);
    assert.equal(hexDiagnostics.some((diag) => hasSpatialError(diag.code) && diag.severity === 'error'), false);
  });
});
