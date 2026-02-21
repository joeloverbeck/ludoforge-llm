import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { Ajv, type ErrorObject } from 'ajv';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  asZoneId,
  serializeTrace,
} from '../../src/kernel/index.js';
import type { GameDef, GameTrace } from '../../src/kernel/index.js';

const readSchema = (filename: string): Record<string, unknown> => {
  const schemaPath = path.join(process.cwd(), 'schemas', filename);
  return JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
};

const traceSchema = readSchema('Trace.schema.json');
const evalReportSchema = readSchema('EvalReport.schema.json');
const gameDefSchema = readSchema('GameDef.schema.json');

const fullGameDef: GameDef = {
  metadata: { id: 'full-game', players: { min: 2, max: 4 }, maxTriggerDepth: 5 },
  constants: { startGold: 3 },
  globalVars: [
    { name: 'round', type: 'int', init: 1, min: 0, max: 99 },
    { name: 'flag', type: 'boolean', init: false },
  ],
  perPlayerVars: [
    { name: 'vp', type: 'int', init: 0, min: 0, max: 100 },
    { name: 'eligible', type: 'boolean', init: true },
  ],
  zones: [
    {
      id: asZoneId('deck:none'),
      zoneKind: 'aux',
      owner: 'none',
      visibility: 'hidden',
      ordering: 'stack',
      adjacentTo: [{ to: asZoneId('discard:none'), direction: 'unidirectional' }],
    },
    { id: asZoneId('discard:none'), zoneKind: 'aux', owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: { cost: 'int', name: 'string', rare: 'boolean' } }],
  setup: [{ shuffle: { zone: 'deck:none' } }],
  turnStructure: {
    phases: [{ id: asPhaseId('main'), onEnter: [{ addVar: { scope: 'global', var: 'round', delta: 1 } }] }],
  },
  actionPipelines: [
    {
      id: 'play-card-profile',
      actionId: asActionId('playCard'),
      accompanyingOps: 'any',
      compoundParamConstraints: [
        { relation: 'disjoint', operationParam: 'targets', specialActivityParam: 'targets' },
        { relation: 'subset', operationParam: 'targets', specialActivityParam: 'saTargets' },
      ],
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
      id: asActionId('playCard'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [{ name: '$card', domain: { query: 'tokensInZone', zone: 'deck:none' } }],
      pre: { op: 'zonePropIncludes', zone: 'discard:none', prop: 'terrainTags', value: 'urban' },
      cost: [],
      effects: [
        { draw: { from: { zoneExpr: 'deck:none' }, to: { zoneExpr: { ref: 'tokenZone', token: '$card' } }, count: 1 } },
        {
          setVar: {
            scope: 'global',
            var: 'round',
            value: {
              if: {
                when: { op: '==', left: { ref: 'zoneProp', zone: 'discard:none', prop: 'category' }, right: 'city' },
                then: { op: 'floorDiv', left: 5, right: 2 },
                else: { op: 'ceilDiv', left: 5, right: 2 },
              },
            },
          },
        },
        {
          setTokenProp: {
            token: '$card',
            prop: 'name',
            value: { concat: ['zone=', { ref: 'tokenZone', token: '$card' }] },
          },
        },
        { setMarker: { space: { zoneExpr: 'discard:none' }, marker: 'support', state: 'neutral' } },
      ],
      limits: [{ scope: 'turn', max: 1 }],
    },
  ],
  triggers: [
    {
      id: asTriggerId('onMainEnter'),
      event: { type: 'phaseEnter', phase: asPhaseId('main') },
      effects: [{ shuffle: { zone: 'deck:none' } }],
    },
  ],
  terminal: {
    conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
    scoring: { method: 'highest', value: 1 },
  },
};

const gameDefWithModernEventDeck: GameDef = {
  ...fullGameDef,
  eventDecks: [
    {
      id: 'events',
      drawZone: 'deck:none',
      discardZone: 'discard:none',
      shuffleOnSetup: true,
      cards: [
        {
          id: 'card-1',
          title: 'Card One',
          sideMode: 'single',
          unshaded: {
            text: 'Test payload',
            freeOperationGrants: [
              {
                seat: '0',
                sequence: { chain: 'play-card-grant', step: 0 },
                operationClass: 'operation',
                actionIds: ['playCard'],
                uses: 1,
              },
            ],
            eligibilityOverrides: [{ target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' }],
            lastingEffects: [
              {
                id: 'lasting-1',
                duration: 'nextTurn',
                setupEffects: [{ addVar: { scope: 'global', var: 'round', delta: 1 } }],
                teardownEffects: [{ addVar: { scope: 'global', var: 'round', delta: -1 } }],
              },
            ],
          },
        },
      ],
    },
  ],
};

const validRuntimeTrace: GameTrace = {
  gameDefId: 'full-game',
  seed: 1234,
  moves: [
    {
      stateHash: 43n,
      player: asPlayerId(0),
      move: { actionId: asActionId('playCard'), params: { amount: 1, target: 'deck:none', legal: true } },
      legalMoveCount: 3,
      deltas: [{ path: 'globalVars.round', before: 1, after: 2 }],
      triggerFirings: [
        {
          kind: 'turnFlowLifecycle',
          step: 'initialRevealPlayed',
          slots: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          before: { playedCardId: null, lookaheadCardId: null, leaderCardId: null },
          after: { playedCardId: 'card-1', lookaheadCardId: null, leaderCardId: null },
        },
        {
          kind: 'turnFlowEligibility',
          step: 'overrideCreate',
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
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: ['0'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'event',
          },
          overrides: [{ seat: '0', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' }],
        },
        {
          kind: 'operationPartial',
          actionId: asActionId('playCard'),
          profileId: 'play-card-profile',
          step: 'costSpendSkipped',
          reason: 'costValidationFailed',
        },
        {
          kind: 'operationFree',
          actionId: asActionId('playCard'),
          step: 'costSpendSkipped',
        },
        {
          kind: 'simultaneousSubmission',
          player: asPlayerId(0),
          move: { actionId: asActionId('playCard'), params: { amount: 1 } },
          submittedBefore: { '0': false, '1': false },
          submittedAfter: { '0': true, '1': false },
        },
        {
          kind: 'simultaneousCommit',
          playersInOrder: ['0', '1'],
          pendingCount: 2,
        },
        { kind: 'fired', triggerId: asTriggerId('onMainEnter'), event: { type: 'turnStart' }, depth: 0 },
      ],
      warnings: [],
    },
  ],
  finalState: {
    globalVars: {},
    perPlayerVars: {},
    playerCount: 2,
    zones: { 'deck:none': [] },
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 3n] },
    stateHash: 42n,
    actionUsage: {},
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        seatOrder: ['0', '1'],
        eligibility: { '0': true, '1': true },
        currentCard: {
          firstEligible: '0',
          secondEligible: '1',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingEligibilityOverrides: [{ seat: '0', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' }],
        consecutiveCoupRounds: 0,
      },
    },
    markers: {},
  },
  result: { type: 'draw' },
  turnsCount: 1,
  stopReason: 'terminal',
};

describe('json schema artifacts', () => {
  it('each schema file is valid JSON and declares a draft version', () => {
    const schemas = [traceSchema, evalReportSchema, gameDefSchema];

    for (const schema of schemas) {
      assert.equal(typeof schema.$schema, 'string');
      assert.ok(String(schema.$schema).startsWith('http://json-schema.org/draft-07/schema#'));
    }
  });

  it('known-good serialized trace validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const serializedTrace = serializeTrace(validRuntimeTrace);

    assert.equal(validate(serializedTrace), true, JSON.stringify(validate.errors, null, 2));
  });

  it('serialized trace with reveal/conceal effect entries validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const serializedTrace = {
      ...baseSerializedTrace,
      moves: [
        {
          ...baseSerializedTrace.moves[0],
          effectTrace: [
            {
              kind: 'reveal',
              zone: 'deck:none',
              observers: [0],
              filter: [{ prop: 'cost', op: 'eq', value: 2 }],
              provenance: {
                phase: 'main',
                eventContext: 'actionEffect',
                effectPath: 'effects[0]',
              },
            },
            {
              kind: 'conceal',
              zone: 'deck:none',
              from: [0],
              filter: [{ prop: 'cost', op: 'eq', value: 2 }],
              grantsRemoved: 1,
              provenance: {
                phase: 'main',
                eventContext: 'actionEffect',
                effectPath: 'effects[1]',
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(serializedTrace), true, JSON.stringify(validate.errors, null, 2));
  });

  it('trace with non-hex stateHash fails schema validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const serializedTrace = {
      ...baseSerializedTrace,
      finalState: {
        ...baseSerializedTrace.finalState,
        stateHash: '0xFF',
      },
    };

    assert.equal(validate(serializedTrace), false);
    assert.ok(
      validate.errors?.some(
        (error: ErrorObject<string, Record<string, unknown>, unknown>) =>
          error.instancePath === '/finalState/stateHash',
      ),
    );
  });

  it('known-good eval report validates against EvalReport.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addSchema(traceSchema, 'Trace.schema.json');
    const validate = ajv.compile(evalReportSchema);

    const serializedTrace = serializeTrace(validRuntimeTrace);
    const report = {
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
      traces: [serializedTrace],
    };

    assert.equal(validate(report), true, JSON.stringify(validate.errors, null, 2));
  });

  it('known-good game def validates against GameDef.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);

    assert.equal(validate(fullGameDef), true, JSON.stringify(validate.errors, null, 2));
  });

  it('game def with invalid adjacency direction fails GameDef.schema.json validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const invalid = {
      ...fullGameDef,
      zones: [
        {
          ...fullGameDef.zones[0],
          adjacentTo: [{ to: 'discard:none', direction: 'invalid' }],
        },
        fullGameDef.zones[1],
      ],
    };

    assert.equal(validate(invalid), false);
    assert.ok(
      validate.errors?.some((error) => error.instancePath.includes('/zones/0/adjacentTo/0/direction')),
      JSON.stringify(validate.errors, null, 2),
    );
  });

  it('game def with modern eventDeck fields validates against GameDef.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);

    assert.equal(validate(gameDefWithModernEventDeck), true, JSON.stringify(validate.errors, null, 2));
  });

  it('game def with legacy event lastingEffects.effect fails GameDef.schema.json validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const legacy = {
      ...gameDefWithModernEventDeck,
      eventDecks: [
        {
          ...gameDefWithModernEventDeck.eventDecks![0],
          cards: [
            {
              ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0],
              unshaded: {
                ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!,
                lastingEffects: [{ id: 'legacy', duration: 'nextTurn', effect: { noop: {} } }],
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(legacy), false);
    assert.ok(
      validate.errors?.some((error) => error.instancePath.includes('/eventDecks/0/cards/0/unshaded/lastingEffects/0')),
      JSON.stringify(validate.errors, null, 2),
    );
  });

  it('eventDeck missing drawZone fails GameDef.schema.json validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const missingDrawZone = {
      ...gameDefWithModernEventDeck,
      eventDecks: [
        {
          id: 'events',
          discardZone: 'discard:none',
          cards: gameDefWithModernEventDeck.eventDecks![0]!.cards,
        },
      ],
    };

    assert.equal(validate(missingDrawZone), false);
    assert.ok(
      validate.errors?.some((error) => error.instancePath === '/eventDecks/0'),
      JSON.stringify(validate.errors, null, 2),
    );
  });

  it('trace with non-hex RNG word fails schema validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const serializedTrace = {
      ...baseSerializedTrace,
      finalState: {
        ...baseSerializedTrace.finalState,
        rng: { algorithm: 'pcg-dxsm-128', version: 1, state: ['0x1', '0xBAD'] },
      },
    };

    assert.equal(validate(serializedTrace), false);
    assert.ok(
      validate.errors?.some(
        (error: ErrorObject<string, Record<string, unknown>, unknown>) =>
          error.instancePath === '/finalState/rng/state/1',
      ),
    );
  });

  it('trace with unknown trigger entry kind fails schema validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const serializedTrace = {
      ...baseSerializedTrace,
      moves: [
        {
          ...baseSerializedTrace.moves[0],
          triggerFirings: [
            ...baseSerializedTrace.moves[0]!.triggerFirings,
            { kind: 'unexpectedEntry', value: 1 },
          ],
        },
      ],
    };

    assert.equal(validate(serializedTrace), false);
    assert.ok(
      validate.errors?.some(
        (error: ErrorObject<string, Record<string, unknown>, unknown>) =>
          error.instancePath === '/moves/0/triggerFirings/7' || error.instancePath === '/moves/0/triggerFirings/8',
      ),
      JSON.stringify(validate.errors, null, 2),
    );
  });

  it('simultaneous turnOrderState without pending fails Trace.schema.json validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const serializedTrace = {
      ...baseSerializedTrace,
      finalState: {
        ...baseSerializedTrace.finalState,
        turnOrderState: {
          type: 'simultaneous',
          submitted: { '0': true, '1': false },
        },
      },
    };

    assert.equal(validate(serializedTrace), false);
    assert.ok(
      validate.errors?.some(
        (error: ErrorObject<string, Record<string, unknown>, unknown>) =>
          error.instancePath === '/finalState/turnOrderState',
      ),
      JSON.stringify(validate.errors, null, 2),
    );
  });

  it('simultaneous turnOrderState with pending move payload validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const serializedTrace = {
      ...baseSerializedTrace,
      finalState: {
        ...baseSerializedTrace.finalState,
        turnOrderState: {
          type: 'simultaneous',
          submitted: { '0': true, '1': false },
          pending: {
            '0': {
              actionId: 'playCard',
              params: { amount: 1, legal: true },
              freeOperation: false,
            },
          },
        },
      },
    };

    assert.equal(validate(serializedTrace), true, JSON.stringify(validate.errors, null, 2));
  });

});
