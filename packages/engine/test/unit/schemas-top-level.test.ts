import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DataAssetEnvelopeSchema,
  EvalReportSchema,
  EventDeckSchema,
  GameDefSchema,
  GameTraceSchema,
  MapPayloadSchema,
  OBJECT_STRICTNESS_POLICY,
  PieceCatalogPayloadSchema,
  StackingConstraintSchema,
  TriggerLogEntrySchema,
} from '../../src/kernel/index.js';

const minimalGameDef = {
  metadata: { id: 'minimal-game', players: { min: 2, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
} as const;

const fullGameDef = {
  metadata: {
    id: 'full-game',
    name: 'Full Game',
    description: 'A full-featured schema fixture.',
    players: { min: 2, max: 4 },
    maxTriggerDepth: 5,
  },
  constants: { startGold: 3 },
  globalVars: [{ name: 'round', type: 'int', init: 1, min: 0, max: 99 }],
  perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 100 }],
  zones: [
    {
      id: 'deck:none',
      owner: 'none',
      visibility: 'hidden',
      ordering: 'stack',
      adjacentTo: [{ to: 'discard:none' }],
    },
    { id: 'discard:none', owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: { cost: 'int', name: 'string', rare: 'boolean' } }],
  setup: [{ shuffle: { zone: 'deck:none' } }],
  turnStructure: {
    phases: [{ id: 'main', onEnter: [{ addVar: { scope: 'global', var: 'round', delta: 1 } }] }],
  },
  turnOrder: {
    type: 'cardDriven',
    config: {
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: {
          seats: ['us', 'arvn', 'nva', 'vc'],
          overrideWindows: [{ id: 'remain-eligible', duration: 'nextTurn' }],
        },
        optionMatrix: [{ first: 'event', second: ['operation', 'operationPlusSpecialActivity'] }],
        passRewards: [{ seatClass: 'coin', resource: 'arvnResources', amount: 3 }],
        durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
      },
      coupPlan: {
        phases: [{ id: 'victory', steps: ['check-thresholds'] }],
        finalRoundOmitPhases: ['victory'],
        maxConsecutiveRounds: 1,
      },
    },
  },
  actionPipelines: [
    {
      id: 'play-card-profile',
      actionId: 'playCard',
      legality: null,
      costValidation: null, costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'atomic',
      linkedWindows: ['window-a'],
    },
  ],
  actions: [
    {
      id: 'playCard',
actor: 'active',
executor: 'actor',
phase: ['main'],
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
  terminal: {
    conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
    checkpoints: [
      { id: 'us-threshold', seat: 'us', timing: 'duringCoup', when: { op: '>', left: 51, right: 50 } },
    ],
    margins: [{ seat: 'us', value: { op: '-', left: 55, right: 50 } }],
    ranking: { order: 'desc' },
    scoring: { method: 'highest', value: 1 },
  },
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
  turnOrderState: { type: 'roundRobin' },
  markers: {},
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
      warnings: [],
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
      kind: 'map',
      payload: { spaces: [] },
    } as const;
    const scenarioEnvelope = {
      id: 'fitl-foundation-westys-war',
      kind: 'scenario',
      payload: { setup: {} },
    } as const;

    assert.equal(DataAssetEnvelopeSchema.safeParse(mapEnvelope).success, true);
    assert.equal(DataAssetEnvelopeSchema.safeParse(scenarioEnvelope).success, true);
  });

  it('parses valid map payload contracts with typed tracks and marker lattices', () => {
    const result = MapPayloadSchema.safeParse({
      spaces: [
        {
          id: 'hue:none',
          category: 'city',
          attributes: { population: 1, econ: 1, terrainTags: ['urban'], country: 'south-vietnam', coastal: true },
          adjacentTo: [{ to: 'south_vietnam:none' }],
        },
      ],
      tracks: [{ id: 'aid', scope: 'global', min: 0, max: 80, initial: 10 }],
      markerLattices: [
        {
          id: 'support-opposition',
          states: ['neutral', 'passive-support'],
          defaultState: 'neutral',
          constraints: [{ category: ['city'], allowedStates: ['neutral', 'passive-support'] }],
        },
      ],
      spaceMarkers: [{ spaceId: 'hue:none', markerId: 'support-opposition', state: 'passive-support' }],
    });

    assert.equal(result.success, true);
  });

  it('parses adjacency direction in map payload space entries', () => {
    const result = MapPayloadSchema.safeParse({
      spaces: [
        {
          id: 'canal-a:none',
          adjacentTo: [{ to: 'canal-b:none', direction: 'unidirectional' }],
        },
        {
          id: 'canal-b:none',
          adjacentTo: [],
        },
      ],
    });

    assert.equal(result.success, true);
  });

  it('rejects malformed map tracks without explicit bounds', () => {
    const result = MapPayloadSchema.safeParse({
      spaces: [],
      tracks: [{ id: 'aid', scope: 'global', min: 0, initial: 10 }],
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'tracks.0.max'));
  });

  it('accepts piece-catalog data-asset envelope kind', () => {
    const result = DataAssetEnvelopeSchema.safeParse({
      id: 'fitl-piece-catalog',
      kind: 'pieceCatalog',
      payload: {
        seats: [{ id: 'vc' }],
        pieceTypes: [],
        inventory: [],
      },
    });

    assert.equal(result.success, true);
  });

  it('accepts custom data-asset envelope kinds', () => {
    const result = DataAssetEnvelopeSchema.safeParse({
      id: 'fitl-event-cards-initial',
      kind: 'eventCardSet',
      payload: {
        cards: [],
      },
    });

    assert.equal(result.success, true);
  });

  it('parses valid event-deck payloads with dual-use sides and lasting effects', () => {
    const result = EventDeckSchema.safeParse({
      id: 'fitl-events-initial',
      drawZone: 'leader:none',
      discardZone: 'played:none',
      cards: [
        {
          id: 'card-82',
          title: 'Domino Theory',
          sideMode: 'dual',
          order: 82,
          unshaded: {
            branches: [
              {
                id: 'branch-a',
                order: 0,
                effects: [{ shuffle: { zone: 'played:none' } }],
              },
            ],
          },
          shaded: {
            targets: [{ id: 'us-troops', selector: { query: 'players' }, cardinality: { max: 3 } }],
            lastingEffects: [
              {
                id: 'aid-mod',
                duration: 'nextTurn',
                setupEffects: [{ addVar: { scope: 'global', var: 'aid', delta: -9 } }],
              },
            ],
          },
        },
      ],
    });

    assert.equal(result.success, true);
  });

  it('rejects malformed event-deck payload cardinality ranges', () => {
    const result = EventDeckSchema.safeParse({
      id: 'fitl-events-initial',
      drawZone: 'leader:none',
      discardZone: 'played:none',
      cards: [
        {
          id: 'card-82',
          title: 'Domino Theory',
          sideMode: 'single',
          unshaded: {
            targets: [{ id: 'us-troops', selector: { query: 'players' }, cardinality: { min: 3, max: 2 } }],
          },
        },
      ],
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue: { path: readonly PropertyKey[] }) => issue.path.join('.') === 'cards.0.unshaded.targets.0.cardinality.min'));
  });

  it('rejects legacy opaque event effect payloads that are not EffectAST nodes', () => {
    const result = EventDeckSchema.safeParse({
      id: 'fitl-events-initial',
      drawZone: 'leader:none',
      discardZone: 'played:none',
      cards: [
        {
          id: 'card-82',
          title: 'Domino Theory',
          sideMode: 'single',
          unshaded: {
            effects: [{ op: 'addTrack', track: 'aid', delta: -9 }],
          },
        },
      ],
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue: { path: readonly PropertyKey[] }) => issue.path.join('.').startsWith('cards.0.unshaded.effects.0')));
  });

  it('parses valid piece-catalog payload contracts', () => {
    const result = PieceCatalogPayloadSchema.safeParse({
      seats: [{ id: 'vc' }],
      pieceTypes: [
        {
          id: 'vc-guerrilla',
          seat: 'vc',
          statusDimensions: ['activity'],
          transitions: [{ dimension: 'activity', from: 'underground', to: 'active' }],
        },
      ],
      inventory: [{ pieceTypeId: 'vc-guerrilla', seat: 'vc', total: 30 }],
    });

    assert.equal(result.success, true);
  });

  it('rejects piece-catalog payloads missing factions catalog', () => {
    const result = PieceCatalogPayloadSchema.safeParse({
      pieceTypes: [],
      inventory: [],
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'seats'));
  });

  it('parses a minimal valid GameDef with zero issues', () => {
    const result = GameDefSchema.safeParse(minimalGameDef);
    assert.equal(result.success, true);
  });

  it('parses a full-featured valid GameDef with zero issues', () => {
    const result = GameDefSchema.safeParse(fullGameDef);
    assert.equal(result.success, true);
  });

  it('rejects non-string metadata name/description values', () => {
    const result = GameDefSchema.safeParse({
      ...minimalGameDef,
      metadata: {
        ...minimalGameDef.metadata,
        name: 123,
        description: false,
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'metadata.name'));
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'metadata.description'));
  });

  it('rejects invalid adjacency direction in GameDef zones', () => {
    const result = GameDefSchema.safeParse({
      ...minimalGameDef,
      zones: [
        {
          id: 'a:none',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          adjacentTo: [{ to: 'b:none', direction: 'invalid' }],
        },
      ],
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'zones.0.adjacentTo.0.direction'));
  });

  it('parses runtime table contracts with uniqueBy tuples', () => {
    const result = GameDefSchema.safeParse({
      ...minimalGameDef,
      runtimeDataAssets: [{ id: 'scenario-1', kind: 'scenario', payload: { levels: [{ level: 1, phase: 'early' }] } }],
      tableContracts: [
        {
          id: 'scenario-1::levels',
          assetId: 'scenario-1',
          tablePath: 'levels',
          fields: [
            { field: 'level', type: 'int' },
            { field: 'phase', type: 'string' },
          ],
          uniqueBy: [['level'], ['level', 'phase']],
        },
      ],
    });

    assert.equal(result.success, true);
  });

  it('rejects runtime table contracts with empty uniqueBy tuples', () => {
    const result = GameDefSchema.safeParse({
      ...minimalGameDef,
      runtimeDataAssets: [{ id: 'scenario-1', kind: 'scenario', payload: { levels: [{ level: 1 }] } }],
      tableContracts: [
        {
          id: 'scenario-1::levels',
          assetId: 'scenario-1',
          tablePath: 'levels',
          fields: [{ field: 'level', type: 'int' }],
          uniqueBy: [[]],
        },
      ],
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'tableContracts.0.uniqueBy.0'));
  });

  it('parses varChanged trigger event shape in GameDefSchema', () => {
    const result = GameDefSchema.safeParse({
      ...minimalGameDef,
      globalVars: [{ name: 'trail', type: 'int', init: 0, min: 0, max: 4 }],
      triggers: [
        {
          id: 'onTrailChanged',
          event: { type: 'varChanged', scope: 'global', var: 'trail' },
          effects: [],
        },
      ],
    });
    assert.equal(result.success, true);
  });

  it('fails on invalid coupPlan.maxConsecutiveRounds path', () => {
    const result = GameDefSchema.safeParse({
      ...minimalGameDef,
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: fullGameDef.turnOrder.config.turnFlow,
          coupPlan: { phases: [{ id: 'victory', steps: ['check-thresholds'] }], maxConsecutiveRounds: 0 },
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'turnOrder.config.coupPlan.maxConsecutiveRounds'));
  });

  it('fails on empty coupPlan.phases path', () => {
    const result = GameDefSchema.safeParse({
      ...minimalGameDef,
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: fullGameDef.turnOrder.config.turnFlow,
          coupPlan: { phases: [] },
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'turnOrder.config.coupPlan.phases'));
  });

  it('fails on missing metadata with path metadata', () => {
    const result = GameDefSchema.safeParse({
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [] },
      actions: [],
      triggers: [],
      terminal: { conditions: [] },
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

  it('fails on invalid turnOrder turnFlow duration with actionable nested path', () => {
    const result = GameDefSchema.safeParse({
      ...fullGameDef,
      turnOrder: {
        type: 'cardDriven',
        config: {
          ...fullGameDef.turnOrder.config,
          turnFlow: {
            ...fullGameDef.turnOrder.config.turnFlow,
            durationWindows: ['turn', 'season'],
          },
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'turnOrder'));
  });

  it('fails on invalid actionPipelines atomicity mode with actionable nested path', () => {
    const result = GameDefSchema.safeParse({
      ...fullGameDef,
      actionPipelines: [
        {
          ...fullGameDef.actionPipelines[0],
          atomicity: 'sometimes',
        },
      ],
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'actionPipelines.0.atomicity'));
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

  it('requires pending map for simultaneous turnOrder runtime state', () => {
    const result = GameTraceSchema.safeParse({
      ...validGameTrace,
      finalState: {
        ...validGameState,
        turnOrderState: {
          type: 'simultaneous',
          submitted: { '0': true, '1': false },
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'finalState.turnOrderState'));
  });

  it('accepts all runtime TriggerLogEntry variants in runtime schema', () => {
    const entries = [
      { kind: 'fired', triggerId: 'onMainEnter', event: { type: 'turnStart' }, depth: 0 },
      { kind: 'truncated', event: { type: 'turnEnd' }, depth: 2 },
      {
        kind: 'turnFlowLifecycle',
        step: 'promoteLookaheadToPlayed',
        slots: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        before: { playedCardId: null, lookaheadCardId: 'card-1', leaderCardId: null },
        after: { playedCardId: 'card-1', lookaheadCardId: null, leaderCardId: null },
      },
      {
        kind: 'turnFlowEligibility',
        step: 'cardEnd',
        seat: '0',
        before: {
          firstEligible: '0',
          secondEligible: '1',
          actedSeats: ['0'],
          passedSeats: [],
          nonPassCount: 1,
          firstActionClass: 'event',
        },
        after: {
          firstEligible: '1',
          secondEligible: '0',
          actedSeats: ['0', '1'],
          passedSeats: [],
          nonPassCount: 2,
          firstActionClass: 'event',
        },
      },
      {
        kind: 'simultaneousSubmission',
        player: 0,
        move: { actionId: 'commit', params: { value: 1 } },
        submittedBefore: { 0: false, 1: false },
        submittedAfter: { 0: true, 1: false },
      },
      {
        kind: 'simultaneousCommit',
        playersInOrder: ['0', '1'],
        pendingCount: 2,
      },
      {
        kind: 'operationPartial',
        actionId: 'train',
        profileId: 'train-profile',
        step: 'costSpendSkipped',
        reason: 'costValidationFailed',
      },
      {
        kind: 'operationFree',
        actionId: 'train',
        step: 'costSpendSkipped',
      },
    ] as const;

    for (const entry of entries) {
      const result = TriggerLogEntrySchema.safeParse(entry);
      assert.equal(result.success, true, `expected success for kind=${entry.kind}`);
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

describe('StackingConstraintSchema', () => {
  it('accepts valid maxCount constraint', () => {
    const result = StackingConstraintSchema.safeParse({
      id: 'max-2-bases',
      description: 'Max 2 bases per province or city',
      spaceFilter: { category: ['province', 'city'] },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'maxCount',
      maxCount: 2,
    });

    assert.equal(result.success, true);
  });

  it('accepts valid prohibit constraint', () => {
    const result = StackingConstraintSchema.safeParse({
      id: 'no-bases-on-loc',
      description: 'No bases on LoCs',
      spaceFilter: { category: ['loc'] },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'prohibit',
    });

    assert.equal(result.success, true);
  });

  it('rejects maxCount rule with missing maxCount value', () => {
    const result = StackingConstraintSchema.safeParse({
      id: 'max-2-bases',
      description: 'Max 2 bases per province or city',
      spaceFilter: { category: ['province', 'city'] },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'maxCount',
    });

    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'maxCount'));
  });

  it('accepts empty spaceFilter and pieceFilter (matches all)', () => {
    const result = StackingConstraintSchema.safeParse({
      id: 'global-limit',
      description: 'Global piece limit',
      spaceFilter: {},
      pieceFilter: {},
      rule: 'maxCount',
      maxCount: 10,
    });

    assert.equal(result.success, true);
  });

  it('accepts constraint with attributeEquals country filter', () => {
    const result = StackingConstraintSchema.safeParse({
      id: 'nv-restriction',
      description: 'Only NVA/VC in North Vietnam',
      spaceFilter: { attributeEquals: { country: 'northVietnam' } },
      pieceFilter: { seats: ['US', 'ARVN'] },
      rule: 'prohibit',
    });

    assert.equal(result.success, true);
  });

  it('accepts constraint with attributeEquals filter', () => {
    const result = StackingConstraintSchema.safeParse({
      id: 'zero-pop-limit',
      description: 'Limit pieces in zero-pop spaces',
      spaceFilter: { attributeEquals: { population: 0 } },
      pieceFilter: {},
      rule: 'maxCount',
      maxCount: 5,
    });

    assert.equal(result.success, true);
  });
});

describe('MapPayloadSchema with stackingConstraints', () => {
  it('accepts map payload with stacking constraints', () => {
    const result = MapPayloadSchema.safeParse({
      spaces: [
        {
          id: 'saigon',
          category: 'city',
          attributes: { population: 6, econ: 0, terrainTags: [], country: 'south-vietnam', coastal: true },
          adjacentTo: [],
        },
      ],
      stackingConstraints: [
        {
          id: 'max-2-bases',
          description: 'Max 2 bases per province or city',
          spaceFilter: { category: ['province', 'city'] },
          pieceFilter: { pieceTypeIds: ['base'] },
          rule: 'maxCount',
          maxCount: 2,
        },
      ],
    });

    assert.equal(result.success, true);
  });

  it('accepts map payload without stacking constraints (backward compatible)', () => {
    const result = MapPayloadSchema.safeParse({
      spaces: [],
    });

    assert.equal(result.success, true);
  });
});

describe('GameDefSchema with stackingConstraints', () => {
  it('accepts GameDef with stacking constraints', () => {
    const result = GameDefSchema.safeParse({
      ...minimalGameDef,
      stackingConstraints: [
        {
          id: 'no-bases-on-loc',
          description: 'No bases on LoCs',
          spaceFilter: { category: ['loc'] },
          pieceFilter: { pieceTypeIds: ['base'] },
          rule: 'prohibit',
        },
      ],
    });

    assert.equal(result.success, true);
  });

  it('accepts GameDef without stacking constraints (backward compatible)', () => {
    const result = GameDefSchema.safeParse(minimalGameDef);
    assert.equal(result.success, true);
  });
});
