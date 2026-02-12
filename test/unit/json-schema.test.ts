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
  globalVars: [{ name: 'round', type: 'int', init: 1, min: 0, max: 99 }],
  perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 100 }],
  zones: [
    {
      id: asZoneId('deck:none'),
      owner: 'none',
      visibility: 'hidden',
      ordering: 'stack',
      adjacentTo: [asZoneId('discard:none')],
    },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: { cost: 'int', name: 'string', rare: 'boolean' } }],
  setup: [{ shuffle: { zone: 'deck:none' } }],
  turnStructure: {
    phases: [{ id: asPhaseId('main'), onEnter: [{ addVar: { scope: 'global', var: 'round', delta: 1 } }] }],
    activePlayerOrder: 'roundRobin',
  },
  operationProfiles: [
    {
      id: 'play-card-profile',
      actionId: asActionId('playCard'),
      legality: {},
      cost: {},
      targeting: {},
      resolution: [{ effects: [] }],
      partialExecution: { mode: 'forbid' },
      linkedSpecialActivityWindows: ['window-a'],
    },
  ],
  actions: [
    {
      id: asActionId('playCard'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [{ name: '$card', domain: { query: 'tokensInZone', zone: 'deck:none' } }],
      pre: { op: '==', left: 1, right: 1 },
      cost: [],
      effects: [{ draw: { from: 'deck:none', to: 'discard:none', count: 1 } }],
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
  endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
  scoring: { method: 'highest', value: 1 },
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
          faction: '0',
          before: {
            firstEligible: '0',
            secondEligible: '1',
            actedFactions: ['0'],
            passedFactions: [],
            nonPassCount: 1,
            firstActionClass: 'event',
          },
          after: {
            firstEligible: '0',
            secondEligible: '1',
            actedFactions: ['0'],
            passedFactions: [],
            nonPassCount: 1,
            firstActionClass: 'event',
          },
          overrides: [{ faction: '0', eligible: true, windowId: 'remain-eligible', duration: 'nextCard' }],
        },
        {
          kind: 'operationPartial',
          actionId: asActionId('playCard'),
          profileId: 'play-card-profile',
          step: 'costSpendSkipped',
          reason: 'costValidationFailed',
        },
        { kind: 'fired', triggerId: asTriggerId('onMainEnter'), event: { type: 'turnStart' }, depth: 0 },
      ],
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
    markers: {},
    turnFlow: {
      factionOrder: ['0', '1'],
      eligibility: { '0': true, '1': true },
      currentCard: {
        firstEligible: '0',
        secondEligible: '1',
        actedFactions: [],
        passedFactions: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
      pendingEligibilityOverrides: [{ faction: '0', eligible: true, windowId: 'remain-eligible', duration: 'nextCard' }],
      consecutiveCoupRounds: 0,
    },
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

});
