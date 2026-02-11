import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DataAssetEnvelopeSchema,
  EvalReportSchema,
  GameDefSchema,
  GameTraceSchema,
  OBJECT_STRICTNESS_POLICY,
} from '../../src/kernel/index.js';

const minimalGameDef = {
  metadata: { id: 'minimal-game', players: { min: 2, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
} as const;

const fullGameDef = {
  metadata: { id: 'full-game', players: { min: 2, max: 4 }, maxTriggerDepth: 5 },
  constants: { startGold: 3 },
  globalVars: [{ name: 'round', type: 'int', init: 1, min: 0, max: 99 }],
  perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 100 }],
  zones: [
    {
      id: 'deck:none',
      owner: 'none',
      visibility: 'hidden',
      ordering: 'stack',
      adjacentTo: ['discard:none'],
    },
    { id: 'discard:none', owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: { cost: 'int', name: 'string', rare: 'boolean' } }],
  setup: [{ shuffle: { zone: 'deck:none' } }],
  turnStructure: {
    phases: [{ id: 'main', onEnter: [{ addVar: { scope: 'global', var: 'round', delta: 1 } }] }],
    activePlayerOrder: 'roundRobin',
  },
  actions: [
    {
      id: 'playCard',
      actor: 'active',
      phase: 'main',
      params: [{ name: '$card', domain: { query: 'tokensInZone', zone: 'deck:none' } }],
      pre: { op: '==', left: 1, right: 1 },
      cost: [],
      effects: [{ draw: { from: 'deck:none', to: 'discard:none', count: 1 } }],
      limits: [{ scope: 'turn', max: 1 }],
    },
  ],
  triggers: [
    {
      id: 'onMainEnter',
      event: { type: 'phaseEnter', phase: 'main' },
      effects: [{ shuffle: { zone: 'deck:none' } }],
    },
  ],
  endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
  scoring: { method: 'highest', value: 1 },
} as const;

const validGameState = {
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: { 'deck:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: 'main',
  activePlayer: 0,
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 3n] },
  stateHash: 42n,
  actionUsage: {},
} as const;

const validGameTrace = {
  gameDefId: 'full-game',
  seed: 1234,
  moves: [
    {
      stateHash: 43n,
      player: 0,
      move: { actionId: 'playCard', params: { amount: 1, target: 'deck:none', legal: true } },
      legalMoveCount: 3,
      deltas: [{ path: 'globalVars.round', before: 1, after: 2 }],
      triggerFirings: [{ kind: 'fired', triggerId: 'onMainEnter', event: { type: 'turnStart' }, depth: 0 }],
    },
  ],
  finalState: validGameState,
  result: { type: 'draw' },
  turnsCount: 1,
  stopReason: 'terminal',
} as const;

const validEvalReport = {
  gameDefId: 'full-game',
  runCount: 10,
  metrics: {
    avgGameLength: 12,
    avgBranchingFactor: 2.5,
    actionDiversity: 0.6,
    resourceTension: 0.4,
    interactionProxy: 0.7,
    dominantActionFreq: 0.3,
    dramaMeasure: 0.5,
  },
  degeneracyFlags: ['STALL'],
  traces: [validGameTrace],
} as const;

describe('top-level runtime schemas', () => {
  it('parses valid map/scenario data-asset envelopes', () => {
    const mapEnvelope = {
      id: 'fitl-map-foundation',
      version: 1,
      kind: 'map',
      payload: { spaces: [] },
    } as const;
    const scenarioEnvelope = {
      id: 'fitl-foundation-westys-war',
      version: 1,
      kind: 'scenario',
      payload: { setup: {} },
    } as const;

    assert.equal(DataAssetEnvelopeSchema.safeParse(mapEnvelope).success, true);
    assert.equal(DataAssetEnvelopeSchema.safeParse(scenarioEnvelope).success, true);
  });

  it('rejects unsupported data-asset envelope kinds', () => {
    const result = DataAssetEnvelopeSchema.safeParse({
      id: 'bad-kind',
      version: 1,
      kind: 'pieceCatalog',
      payload: {},
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'kind'));
  });

  it('parses a minimal valid GameDef with zero issues', () => {
    const result = GameDefSchema.safeParse(minimalGameDef);
    assert.equal(result.success, true);
  });

  it('parses a full-featured valid GameDef with zero issues', () => {
    const result = GameDefSchema.safeParse(fullGameDef);
    assert.equal(result.success, true);
  });

  it('fails on missing metadata with path metadata', () => {
    const result = GameDefSchema.safeParse({
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
      actions: [],
      triggers: [],
      endConditions: [],
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'metadata'));
  });

  it('fails on invalid VariableDef.init type at the correct path', () => {
    const result = GameDefSchema.safeParse({
      ...minimalGameDef,
      globalVars: [{ name: 'g', type: 'int', init: 'bad', min: 0, max: 10 }],
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'globalVars.0.init'));
  });

  it('enforces strict top-level object policy', () => {
    assert.equal(OBJECT_STRICTNESS_POLICY, 'strict');

    const result = GameDefSchema.safeParse({ ...minimalGameDef, extra: true });
    assert.equal(result.success, false);
  });

  it('fails malformed top-level GameTrace with actionable nested path', () => {
    const result = GameTraceSchema.safeParse({
      ...validGameTrace,
      finalState: { ...validGameState, stateHash: '0x2a' },
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'finalState.stateHash'));
  });

  it('fails GameState missing nextTokenOrdinal with actionable path', () => {
    const invalidState = { ...validGameState } as Record<string, unknown>;
    delete invalidState.nextTokenOrdinal;

    const result = GameTraceSchema.safeParse({
      ...validGameTrace,
      finalState: invalidState,
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'finalState.nextTokenOrdinal'));
  });

  it('fails GameTrace missing stopReason with actionable path', () => {
    const invalidTrace = { ...validGameTrace } as Record<string, unknown>;
    delete invalidTrace.stopReason;

    const result = GameTraceSchema.safeParse(invalidTrace);

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'stopReason'));
  });

  it('accepts all allowed stopReason literals', () => {
    for (const stopReason of ['terminal', 'maxTurns', 'noLegalMoves'] as const) {
      const result = GameTraceSchema.safeParse({
        ...validGameTrace,
        stopReason,
      });

      assert.equal(result.success, true);
    }
  });

  it('fails malformed top-level EvalReport with actionable nested path', () => {
    const result = EvalReportSchema.safeParse({
      ...validEvalReport,
      metrics: { ...validEvalReport.metrics, avgGameLength: '12' },
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'metrics.avgGameLength'));
  });
});
