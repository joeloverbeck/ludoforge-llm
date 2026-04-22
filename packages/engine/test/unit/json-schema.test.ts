// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { Ajv, type ErrorObject } from 'ajv';

import {
  type AgentDecisionTrace,
  asActionId,
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asSeatId,
  asTriggerId,
  asTurnId,
  asZoneId,
  serializeTrace,
} from '../../src/kernel/index.js';
import type { GameDef, GameTrace } from '../../src/kernel/index.js';
import { AST_SCOPED_VAR_SCOPES, TRACE_SCOPED_VAR_SCOPES } from '../../src/kernel/scoped-var-contract.js';
import { buildDiscriminatedEndpointMatrix } from '../helpers/transfer-endpoint-matrix.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { EFFECT_KIND_TAG } from '../../src/kernel/types-ast.js';

const readSchema = (filename: string): Record<string, unknown> => {
  const schemaPath = path.join(process.cwd(), 'schemas', filename);
  return JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
};

const readTraceFixture = <T>(filename: string): T => {
  const fixturePath = path.join(process.cwd(), 'test', 'fixtures', 'trace', filename);
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as T;
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
  setup: [eff({ shuffle: { zone: 'deck:none' } })],
  turnStructure: {
    phases: [{ id: asPhaseId('main'), onEnter: [eff({ addVar: { scope: 'global', var: 'round', delta: 1 } })] }],
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
        eff({ draw: { from: { zoneExpr: 'deck:none' }, to: { zoneExpr: { _t: 2 as const, ref: 'tokenZone', token: '$card' } }, count: 1 } }),
        eff({
          setVar: {
            scope: 'global',
            var: 'round',
            value: {
              _t: 4, if: {
                when: { op: '==', left: { _t: 2 as const, ref: 'zoneProp', zone: 'discard:none', prop: 'category' }, right: 'city' },
                then: { _t: 6 as const, op: 'floorDiv', left: 5, right: 2 },
                else: { _t: 6 as const, op: 'ceilDiv', left: 5, right: 2 },
              },
            },
          },
        }),
        eff({
          setTokenProp: {
            token: '$card',
            prop: 'name',
            value: { _t: 3, concat: ['zone=', { _t: 2 as const, ref: 'tokenZone', token: '$card' }] },
          },
        }),
        eff({ setMarker: { space: { zoneExpr: 'discard:none' }, marker: 'support', state: 'neutral' } }),
      ],
      limits: [{ id: 'playCard::turn::0', scope: 'turn', max: 1 }],
    },
  ],
  triggers: [
    {
      id: asTriggerId('onMainEnter'),
      event: { type: 'phaseEnter', phase: asPhaseId('main') },
      effects: [eff({ shuffle: { zone: 'deck:none' } })],
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
                sequence: { batch: 'play-card-grant', step: 0 },
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
                setupEffects: [eff({ addVar: { scope: 'global', var: 'round', delta: 1 } })],
                teardownEffects: [eff({ addVar: { scope: 'global', var: 'round', delta: -1 } })],
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
  decisions: [
    {
      stateHash: 43n,
      seatId: asSeatId('0'),
      playerId: asPlayerId(0),
      decisionContextKind: 'actionSelection',
      decisionKey: null,
      decision: {
        kind: 'actionSelection',
        actionId: asActionId('playCard'),
        move: { actionId: asActionId('playCard'), params: { amount: 1, target: 'deck:none', legal: true } },
      },
      turnId: asTurnId(1),
      turnRetired: true,
      legalActionCount: 3,
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
          kind: 'operationCompoundStagesReplaced',
          actionId: asActionId('playCard'),
          profileId: 'play-card-profile',
          insertAfterStage: 1,
          totalStages: 3,
          skippedStageCount: 1,
        },
        {
          kind: 'turnFlowDeferredEventLifecycle',
          stage: 'queued',
          deferredId: 'deferred:1:0:playCard',
          actionId: asActionId('playCard'),
          requiredGrantBatchIds: ['play-card-grant'],
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
  compoundTurns: [
    { turnId: asTurnId(1), seatId: asSeatId('0'), decisionIndexRange: { start: 0, end: 1 }, microturnCount: 1, turnStopReason: 'terminal' },
  ],
  finalState: {
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones: { 'deck:none': [] },
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 3n] },
    stateHash: 42n,
    _runningHash: 42n,
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
    reveals: undefined,
    globalMarkers: undefined,
    activeLastingEffects: undefined,
    interruptPhaseStack: undefined,
    decisionStack: [],
    nextFrameId: asDecisionFrameId(0),
    nextTurnId: asTurnId(0),
    activeDeciderSeatId: asSeatId('0'),
  },
  result: { type: 'draw' },
  turnsCount: 1,
  stopReason: 'terminal',
  traceProtocolVersion: 'spec-140',
};

interface PolicyDecisionGolden {
  readonly move: unknown;
  readonly agentDecision: Extract<AgentDecisionTrace, { readonly kind: 'policy' }>;
}

function toSerializedTraceMove(move: unknown): Record<string, unknown> {
  if (move === null || typeof move !== 'object' || Array.isArray(move)) {
    throw new TypeError('expected policy decision fixture move to be an object');
  }
  const serializedMove = { ...(move as Record<string, unknown>) };
  delete serializedMove.actionClass;
  return serializedMove;
}

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

  it('serialized trace with summary policy diagnostics validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const fixture = readTraceFixture<PolicyDecisionGolden>('fitl-policy-summary.golden.json');
    const serializedTrace = {
      ...baseSerializedTrace,
      decisions: [
        {
          ...baseSerializedTrace.decisions[0]!,
          decision: {
            ...baseSerializedTrace.decisions[0]!.decision,
            move: toSerializedTraceMove(fixture.move),
          },
          agentDecision: fixture.agentDecision,
        },
      ],
    };

    assert.equal(validate(serializedTrace), true, JSON.stringify(validate.errors, null, 2));
  });

  it('serialized trace with verbose policy diagnostics validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const fixture = readTraceFixture<PolicyDecisionGolden>('fitl-policy-summary.golden.json');
    const serializedTrace = {
      ...baseSerializedTrace,
      decisions: [
        {
          ...baseSerializedTrace.decisions[0]!,
          decision: {
            ...baseSerializedTrace.decisions[0]!.decision,
            move: toSerializedTraceMove(fixture.move),
          },
          agentDecision: {
            ...fixture.agentDecision,
            candidates: [
              {
                actionId: 'advance',
                stableMoveKey: 'advance|{}|false|event',
                score: 7,
                prunedBy: [],
                previewRefIds: ['victoryCurrentMargin.currentMargin.self'],
                unknownPreviewRefs: [],
                previewOutcome: 'ready',
              },
              {
                actionId: 'pass',
                stableMoveKey: 'pass|{}|false|event',
                score: 1,
                prunedBy: ['dropPassWhenOtherMovesExist'],
                previewRefIds: ['victoryCurrentMargin.currentMargin.self'],
                unknownPreviewRefs: [
                  { refId: 'victoryCurrentMargin.currentMargin.self', reason: 'hidden' },
                ],
                previewOutcome: 'hidden',
              },
              {
                actionId: 'event',
                stableMoveKey: 'event|{}|false|event',
                score: -2,
                prunedBy: [],
                previewRefIds: ['victoryCurrentMargin.currentMargin.self'],
                unknownPreviewRefs: [
                  { refId: 'victoryCurrentMargin.currentMargin.self', reason: 'unresolved' },
                ],
                previewOutcome: 'unresolved',
                previewFailureReason: 'structurallyUnsatisfiable',
              },
            ],
          },
        },
      ],
    };

    assert.equal(validate(serializedTrace), true, JSON.stringify(validate.errors, null, 2));
  });

  it('serialized trace without optional policy diagnostics still validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const fixture = readTraceFixture<PolicyDecisionGolden>('fitl-policy-summary.golden.json');
    const previewUsageWithoutBreakdown = {
      mode: fixture.agentDecision.previewUsage.mode,
      evaluatedCandidateCount: fixture.agentDecision.previewUsage.evaluatedCandidateCount,
      refIds: fixture.agentDecision.previewUsage.refIds,
      unknownRefs: fixture.agentDecision.previewUsage.unknownRefs,
    };
    const serializedTrace = {
      ...baseSerializedTrace,
      decisions: [
        {
          ...baseSerializedTrace.decisions[0]!,
          decision: {
            ...baseSerializedTrace.decisions[0]!.decision,
            move: toSerializedTraceMove(fixture.move),
          },
          agentDecision: {
            ...fixture.agentDecision,
            previewUsage: previewUsageWithoutBreakdown,
          },
        },
      ],
    };

    assert.equal(validate(serializedTrace), true, JSON.stringify(validate.errors, null, 2));
  });

  it('serialized trace with pending required free-operation grant validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const cardDrivenTurnOrderState = baseSerializedTrace.finalState.turnOrderState as Extract<
      typeof baseSerializedTrace.finalState.turnOrderState,
      { type: 'cardDriven' }
    >;
    const serializedTrace = {
      ...baseSerializedTrace,
      finalState: {
        ...baseSerializedTrace.finalState,
        turnOrderState: {
          ...cardDrivenTurnOrderState,
          runtime: {
            ...cardDrivenTurnOrderState.runtime,
            pendingFreeOperationGrants: [
              {
                grantId: 'grant-1',
                phase: 'ready',
                seat: '0',
                operationClass: 'operation',
                completionPolicy: 'required',
                postResolutionTurnFlow: 'resumeCardFlow',
                remainingUses: 1,
              },
            ],
          },
        },
      },
    };

    assert.equal(validate(serializedTrace), true, JSON.stringify(validate.errors, null, 2));
  });

  it('serialized trace with pending free-operation grant executionContext validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const cardDrivenTurnOrderState = baseSerializedTrace.finalState.turnOrderState as Extract<
      typeof baseSerializedTrace.finalState.turnOrderState,
      { type: 'cardDriven' }
    >;
    const serializedTrace = {
      ...baseSerializedTrace,
      finalState: {
        ...baseSerializedTrace.finalState,
        turnOrderState: {
          ...cardDrivenTurnOrderState,
          runtime: {
            ...cardDrivenTurnOrderState.runtime,
            pendingFreeOperationGrants: [
              {
                grantId: 'grant-ctx',
                phase: 'ready',
                seat: '0',
                operationClass: 'operation',
                executionContext: {
                  allowedTargets: [1, 2],
                  effectCode: 7,
                },
                remainingUses: 1,
              },
            ],
          },
        },
      },
    };

    assert.equal(validate(serializedTrace), true, JSON.stringify(validate.errors, null, 2));
  });

  it('Trace.schema.json rejects pending required free-operation grants without postResolutionTurnFlow', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const cardDrivenTurnOrderState = baseSerializedTrace.finalState.turnOrderState as Extract<
      typeof baseSerializedTrace.finalState.turnOrderState,
      { type: 'cardDriven' }
    >;
    const serializedTrace = {
      ...baseSerializedTrace,
      finalState: {
        ...baseSerializedTrace.finalState,
        turnOrderState: {
          ...cardDrivenTurnOrderState,
          runtime: {
            ...cardDrivenTurnOrderState.runtime,
            pendingFreeOperationGrants: [
              {
                grantId: 'grant-1',
                phase: 'ready',
                seat: '0',
                operationClass: 'operation',
                completionPolicy: 'required',
                remainingUses: 1,
              },
            ],
          },
        },
      },
    };

    assert.equal(validate(serializedTrace), false);
  });

  it('Trace.schema.json rejects pending free-operation grants that set postResolutionTurnFlow without required completionPolicy', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const cardDrivenTurnOrderState = baseSerializedTrace.finalState.turnOrderState as Extract<
      typeof baseSerializedTrace.finalState.turnOrderState,
      { type: 'cardDriven' }
    >;
    const serializedTrace = {
      ...baseSerializedTrace,
      finalState: {
        ...baseSerializedTrace.finalState,
        turnOrderState: {
          ...cardDrivenTurnOrderState,
          runtime: {
            ...cardDrivenTurnOrderState.runtime,
            pendingFreeOperationGrants: [
              {
                grantId: 'grant-1',
                phase: 'ready',
                seat: '0',
                operationClass: 'operation',
                postResolutionTurnFlow: 'resumeCardFlow',
                remainingUses: 1,
              },
            ],
          },
        },
      },
    };

    assert.equal(validate(serializedTrace), false);
  });

  it('serialized trace with reveal/conceal effect entries validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const serializedTrace = {
      ...baseSerializedTrace,
      decisions: [
        {
          ...baseSerializedTrace.decisions[0],
          effectTrace: [
            {
              kind: 'reveal',
              zone: 'deck:none',
              observers: [0],
              filter: { prop: 'cost', op: 'eq', value: 2 },
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
              filter: { prop: 'cost', op: 'eq', value: 2 },
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

  it('serialized trace with zone-scoped resourceTransfer validates against Trace.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const serializedTrace = {
      ...baseSerializedTrace,
      decisions: [
        {
          ...baseSerializedTrace.decisions[0],
          effectTrace: [
            {
              kind: 'resourceTransfer',
              from: { scope: 'zone', zone: 'board:none', varName: 'supply' },
              to: { scope: 'zone', zone: 'discard:none', varName: 'supply' },
              requestedAmount: 3,
              actualAmount: 2,
              sourceAvailable: 2,
              destinationHeadroom: 5,
              provenance: {
                phase: 'main',
                eventContext: 'actionEffect',
                effectPath: 'effects[0]',
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(serializedTrace), true, JSON.stringify(validate.errors, null, 2));
  });

  it('serialized trace rejects invalid resourceTransfer endpoint shape drift', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const makeSerializedTrace = (from: unknown, to: unknown) => ({
      ...baseSerializedTrace,
      decisions: [
        {
          ...baseSerializedTrace.decisions[0],
          effectTrace: [
            {
              kind: 'resourceTransfer',
              from,
              to,
              requestedAmount: 3,
              actualAmount: 2,
              sourceAvailable: 2,
              destinationHeadroom: 5,
              provenance: {
                phase: 'main',
                eventContext: 'actionEffect',
                effectPath: 'effects[0]',
              },
            },
          ],
        },
      ],
    });
    const cases = buildDiscriminatedEndpointMatrix({
      scopeField: 'scope',
      varField: 'varName',
      playerField: 'player',
      zoneField: 'zone',
      scopes: {
        global: TRACE_SCOPED_VAR_SCOPES.global,
        player: TRACE_SCOPED_VAR_SCOPES.player,
        zone: TRACE_SCOPED_VAR_SCOPES.zone,
      },
      values: {
        globalVar: 'bank',
        playerVar: 'coins',
        zoneVar: 'supply',
        player: 0,
        zone: 'board:none',
      },
    });

    for (const testCase of cases) {
      if (testCase.violation === undefined) {
        continue;
      }
      const serializedTrace = makeSerializedTrace(testCase.from, testCase.to);
      assert.equal(validate(serializedTrace), false, testCase.name);
      assert.ok((validate.errors?.length ?? 0) > 0, testCase.name);
    }

    const control = makeSerializedTrace(
      { scope: 'perPlayer', player: 0, varName: 'coins' },
      { scope: 'zone', zone: 'board:none', varName: 'supply' },
    );
    assert.equal(validate(control), true, JSON.stringify(validate.errors, null, 2));
  });

  it('serialized trace rejects invalid varChange endpoint shape drift', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(traceSchema);
    const baseSerializedTrace = serializeTrace(validRuntimeTrace);
    const provenance = { phase: 'main', eventContext: 'actionEffect', effectPath: 'effects[0]' } as const;
    const makeSerializedTrace = (entry: unknown) => ({
      ...baseSerializedTrace,
      decisions: [
        {
          ...baseSerializedTrace.decisions[0],
          effectTrace: [entry],
        },
      ],
    });

    const validEntries = [
      {
        kind: 'varChange',
        scope: TRACE_SCOPED_VAR_SCOPES.global,
        varName: 'pool',
        oldValue: 1,
        newValue: 2,
        provenance,
      },
      {
        kind: 'varChange',
        scope: TRACE_SCOPED_VAR_SCOPES.player,
        player: 0,
        varName: 'coins',
        oldValue: 1,
        newValue: 2,
        provenance,
      },
      {
        kind: 'varChange',
        scope: TRACE_SCOPED_VAR_SCOPES.zone,
        zone: 'board:none',
        varName: 'supply',
        oldValue: 1,
        newValue: 2,
        provenance,
      },
    ] as const;

    for (const entry of validEntries) {
      assert.equal(validate(makeSerializedTrace(entry)), true, JSON.stringify(validate.errors, null, 2));
    }

    const varChangeCases = buildDiscriminatedEndpointMatrix({
      scopeField: 'scope',
      varField: 'varName',
      playerField: 'player',
      zoneField: 'zone',
      scopes: {
        global: TRACE_SCOPED_VAR_SCOPES.global,
        player: TRACE_SCOPED_VAR_SCOPES.player,
        zone: TRACE_SCOPED_VAR_SCOPES.zone,
      },
      values: {
        globalVar: 'pool',
        playerVar: 'coins',
        zoneVar: 'supply',
        player: 0,
        zone: 'board:none',
      },
    });

    for (const testCase of varChangeCases) {
      if (testCase.violation === undefined) {
        continue;
      }
      const endpoint = testCase.violation.endpoint === 'to' ? testCase.to : testCase.from;
      const entry = {
        kind: 'varChange',
        ...endpoint,
        oldValue: 1,
        newValue: 2,
        provenance,
      };
      assert.equal(validate(makeSerializedTrace(entry)), false, testCase.name);
      assert.ok((validate.errors?.length ?? 0) > 0, testCase.name);
    }
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
      perSeed: [
        {
          seed: 1234,
          turnCount: 1,
          stopReason: 'terminal',
          metrics: {
            gameLength: 1,
            avgBranchingFactor: 3,
            actionDiversity: 0,
            resourceTension: 0,
            interactionProxy: 0,
            dominantActionFreq: 1,
            dramaMeasure: 0,
          },
          degeneracyFlags: ['STALL'],
        },
      ],
    };

    assert.equal(validate(report), true, JSON.stringify(validate.errors, null, 2));
  });

  it('eval report with legacy traces field fails EvalReport.schema.json validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addSchema(traceSchema, 'Trace.schema.json');
    const validate = ajv.compile(evalReportSchema);

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
      traces: [serializeTrace(validRuntimeTrace)],
    };

    assert.equal(validate(report), false);
    assert.ok(
      validate.errors?.some(
        (error: ErrorObject<string, Record<string, unknown>, unknown>) =>
          error.instancePath === '' && error.keyword === 'required',
      ),
    );
  });

  it('known-good game def validates against GameDef.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);

    assert.equal(validate(fullGameDef), true, JSON.stringify(validate.errors, null, 2));
  });

  it('game def rejects transferVar endpoint shape drift across both endpoint sides', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);

    const makeInvalidGameDef = (from: unknown, to: unknown) => ({
      ...fullGameDef,
      actions: [
        {
          ...fullGameDef.actions[0],
          effects: [{ _k: EFFECT_KIND_TAG.transferVar, transferVar: { from, to, amount: 1 } }],
        },
      ],
    });
    const cases = buildDiscriminatedEndpointMatrix({
      scopeField: 'scope',
      varField: 'var',
      playerField: 'player',
      zoneField: 'zone',
      scopes: {
        global: AST_SCOPED_VAR_SCOPES.global,
        player: AST_SCOPED_VAR_SCOPES.player,
        zone: AST_SCOPED_VAR_SCOPES.zone,
      },
      values: {
        globalVar: 'round',
        playerVar: 'vp',
        zoneVar: 'supply',
        player: 'actor',
        zone: 'deck:none',
      },
    });

    for (const testCase of cases) {
      if (testCase.violation === undefined) {
        continue;
      }
      const invalid = makeInvalidGameDef(testCase.from, testCase.to);
      assert.equal(validate(invalid), false, testCase.name);
      assert.ok((validate.errors?.length ?? 0) > 0, testCase.name);
    }

    const control = makeInvalidGameDef(
      { scope: 'pvar', player: 'actor', var: 'vp' },
      { scope: 'zoneVar', zone: 'deck:none', var: 'supply' },
    );
    assert.equal(validate(control), true, JSON.stringify(validate.errors, null, 2));
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

  it('eventDeck freeOperationGrants accept the explicit required completion contract shape', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const valid = {
      ...gameDefWithModernEventDeck,
      eventDecks: [
        {
          ...gameDefWithModernEventDeck.eventDecks![0],
          cards: [
            {
              ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0],
              unshaded: {
                ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!,
                freeOperationGrants: [
                  {
                    ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!.freeOperationGrants![0],
                    completionPolicy: 'required',
                    postResolutionTurnFlow: 'resumeCardFlow',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(valid), true, JSON.stringify(validate.errors, null, 2));
  });

  it('eventDeck freeOperationGrants accept sequence progressionPolicy', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const valid = {
      ...gameDefWithModernEventDeck,
      eventDecks: [
        {
          ...gameDefWithModernEventDeck.eventDecks![0],
          cards: [
            {
              ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0],
              unshaded: {
                ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!,
                freeOperationGrants: [
                  {
                    ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!.freeOperationGrants![0],
                    sequence: { batch: 'play-card-grant', step: 0, progressionPolicy: 'implementWhatCanInOrder' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(valid), true, JSON.stringify(validate.errors, null, 2));
  });

  it('grantFreeOperation effects accept the explicit required completion contract shape', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const valid = {
      ...fullGameDef,
      actions: [
        {
          ...fullGameDef.actions[0],
          effects: [
            {
              _k: EFFECT_KIND_TAG.grantFreeOperation,
              grantFreeOperation: {
                seat: '0',
                operationClass: 'operation',
                completionPolicy: 'required',
                postResolutionTurnFlow: 'resumeCardFlow',
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(valid), true, JSON.stringify(validate.errors, null, 2));
  });

  it('grantFreeOperation effects accept sequence progressionPolicy', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const valid = {
      ...fullGameDef,
      actions: [
        {
          ...fullGameDef.actions[0],
          effects: [
            {
              _k: EFFECT_KIND_TAG.grantFreeOperation,
              grantFreeOperation: {
                seat: '0',
                operationClass: 'operation',
                sequence: { batch: 'effect-chain', step: 0, progressionPolicy: 'implementWhatCanInOrder' },
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(valid), true, JSON.stringify(validate.errors, null, 2));
  });

  it('GameDef.schema.json accepts grantFreeOperation executionContext payloads', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const valid = {
      ...fullGameDef,
      actions: [
        {
          ...fullGameDef.actions[0],
          effects: [
            {
              _k: EFFECT_KIND_TAG.grantFreeOperation,
              grantFreeOperation: {
                seat: '0',
                operationClass: 'operation',
                executionContext: {
                  allowedTargets: { _t: 1, scalarArray: [1, 2] },
                  effectCode: { _t: 6 as const, op: '+', left: 3, right: 4 },
                },
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(valid), true, JSON.stringify(validate.errors, null, 2));
  });

  it('GameDef.schema.json rejects eventDeck freeOperationGrants that require completion without postResolutionTurnFlow', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const invalid = {
      ...gameDefWithModernEventDeck,
      eventDecks: [
        {
          ...gameDefWithModernEventDeck.eventDecks![0],
          cards: [
            {
              ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0],
              unshaded: {
                ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!,
                freeOperationGrants: [
                  {
                    ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!.freeOperationGrants![0],
                    completionPolicy: 'required',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(invalid), false);
  });

  it('GameDef.schema.json rejects eventDeck freeOperationGrants that set postResolutionTurnFlow without required completionPolicy', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const invalid = {
      ...gameDefWithModernEventDeck,
      eventDecks: [
        {
          ...gameDefWithModernEventDeck.eventDecks![0],
          cards: [
            {
              ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0],
              unshaded: {
                ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!,
                freeOperationGrants: [
                  {
                    ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!.freeOperationGrants![0],
                    postResolutionTurnFlow: 'resumeCardFlow',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(invalid), false);
  });

  it('GameDef.schema.json rejects grantFreeOperation effects that require completion without postResolutionTurnFlow', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const invalid = {
      ...fullGameDef,
      actions: [
        {
          ...fullGameDef.actions[0],
          effects: [
            {
              grantFreeOperation: {
                seat: '0',
                operationClass: 'operation',
                completionPolicy: 'required',
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(invalid), false);
  });

  it('GameDef.schema.json rejects grantFreeOperation effects that set postResolutionTurnFlow without required completionPolicy', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const invalid = {
      ...fullGameDef,
      actions: [
        {
          ...fullGameDef.actions[0],
          effects: [
            {
              grantFreeOperation: {
                seat: '0',
                operationClass: 'operation',
                postResolutionTurnFlow: 'resumeCardFlow',
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(invalid), false);
  });

  it('eventDeck target with application each and missing effects fails GameDef.schema.json validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(gameDefSchema);
    const invalid = {
      ...gameDefWithModernEventDeck,
      eventDecks: [
        {
          ...gameDefWithModernEventDeck.eventDecks![0],
          cards: [
            {
              ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0],
              unshaded: {
                ...gameDefWithModernEventDeck.eventDecks![0]!.cards[0]!.unshaded!,
                targets: [
                  {
                    id: 'target-1',
                    selector: { query: 'players' },
                    cardinality: { max: 1 },
                    application: 'each',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    assert.equal(validate(invalid), false);
    assert.ok(
      validate.errors?.some((error) => error.instancePath.includes('/eventDecks/0/cards/0/unshaded/targets/0')),
      JSON.stringify(validate.errors, null, 2),
    );
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
      decisions: [
        {
          ...baseSerializedTrace.decisions[0],
          triggerFirings: [
            ...baseSerializedTrace.decisions[0]!.triggerFirings,
            { kind: 'unexpectedEntry', value: 1 },
          ],
        },
      ],
    };

    assert.equal(validate(serializedTrace), false);
    assert.ok(
      validate.errors?.some(
        (error: ErrorObject<string, Record<string, unknown>, unknown>) =>
          error.instancePath === '/decisions/0/triggerFirings/8'
          || error.instancePath === '/decisions/0/triggerFirings/9',
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
