import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  advancePhase,
  applyMove,
  asActionId,
  asPhaseId,
  initialState,
  legalMoves,
  serializeGameState,
  type GameDef,
  type Move,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';

interface FitlTurnFlowGolden {
  readonly seed: number;
  readonly initialLegalMoves: readonly Move[];
  readonly steps: readonly {
    readonly move: Move;
    readonly applyTrace: readonly TriggerLogEntry[];
    readonly afterApply: ReturnType<typeof serializeGameState>;
    readonly boundaryTrace: readonly TriggerLogEntry[];
    readonly afterBoundary: ReturnType<typeof serializeGameState>;
  }[];
}

const readJsonFixture = <T>(filePath: string): T => JSON.parse(readFileSync(join(process.cwd(), filePath), 'utf8')) as T;

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-turn-flow-golden-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'res0', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'res1', type: 'int', init: 0, min: 0, max: 99 },
    ],
    perPlayerVars: [],
    zones: [
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'played:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'lookahead:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'leader:none', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
    setup: [
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
    ],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            seats: ['0', '1', '2', '3'],
            overrideWindows: [{ id: 'remain-eligible', duration: 'nextTurn' }],
          },
          optionMatrix: [{ first: 'event', second: ['operation', 'operationPlusSpecialActivity'] }],
          passRewards: [
            { seatClass: '0', resource: 'res0', amount: 1 },
            { seatClass: '1', resource: 'res1', amount: 3 },
          ],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          monsoon: {
            restrictedActions: [
              { actionId: 'sweep' },
              { actionId: 'airLift', maxParam: { name: 'spaces', max: 2 } },
            ],
            blockPivotal: true,
            pivotalOverrideToken: 'monsoonPivotalAllowed',
          },
          pivotal: {
            actionIds: ['pivotalEvent'],
            requirePreActionWindow: true,
          },
        },
      },
    },
    actions: [
      { id: asActionId('pass'), actor: 'active', executor: 'actor', phase: [asPhaseId('main')], params: [], pre: null, cost: [], effects: [], limits: [] },
      {
        id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-overrides'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      { id: asActionId('operation'), actor: 'active', executor: 'actor', phase: [asPhaseId('main')], params: [], pre: null, cost: [], effects: [], limits: [] },
      { id: asActionId('operationPlusSpecialActivity'), actor: 'active', executor: 'actor', phase: [asPhaseId('main')], params: [], pre: null, cost: [], effects: [], limits: [] },
      { id: asActionId('sweep'), actor: 'active', executor: 'actor', phase: [asPhaseId('main')], params: [], pre: null, cost: [], effects: [], limits: [] },
      {
        id: asActionId('airLift'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [{ name: 'spaces', domain: { query: 'intsInRange', min: 1, max: 3 } }],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('pivotalEvent'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [{ name: 'override', domain: { query: 'enums', values: ['none', 'monsoonPivotalAllowed'] } }],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-overrides',
            title: 'Typed Override',
            sideMode: 'single',
            unshaded: {
              text: 'Keep acting faction eligible.',
              eligibilityOverrides: [{ target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' }],
            },
          },
        ],
      },
    ],
    triggers: [],
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
  }) as unknown as GameDef;

describe('FITL turn-flow golden trace', () => {
  it('matches golden artifact for pass chain, override window, monsoon gating, and coup handoff boundary logs', () => {
    // Fixture policy: this file is a contract artifact. Update it only when turn-flow semantics intentionally change.
    const fixture = readJsonFixture<FitlTurnFlowGolden>('test/fixtures/trace/fitl-turn-flow.golden.json');
    const def = createDef();
    const seed = 71;

    const start = initialState(def, seed, 4);
    const initialLegal = legalMoves(def, start);
    assert.equal(
      initialLegal.some((move) => move.actionId === asActionId('operationPlusSpecialActivity')),
      true,
    );

    const passMove: Move = { actionId: asActionId('pass'), params: {} };
    const first = applyMove(def, start, passMove);
    const firstBoundaryTrace: TriggerLogEntry[] = [];
    const firstBoundary = advancePhase(def, first.state, firstBoundaryTrace);

    const eventMove: Move = {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-overrides', side: 'unshaded' },
    };
    const second = applyMove(def, firstBoundary, eventMove);
    const secondBoundaryTrace: TriggerLogEntry[] = [];
    const secondBoundary = advancePhase(def, second.state, secondBoundaryTrace);

    const actual: FitlTurnFlowGolden = {
      seed,
      initialLegalMoves: initialLegal,
      steps: [
        {
          move: passMove,
          applyTrace: first.triggerFirings,
          afterApply: serializeGameState(first.state),
          boundaryTrace: firstBoundaryTrace,
          afterBoundary: serializeGameState(firstBoundary),
        },
        {
          move: eventMove,
          applyTrace: second.triggerFirings,
          afterApply: serializeGameState(second.state),
          boundaryTrace: secondBoundaryTrace,
          afterBoundary: serializeGameState(secondBoundary),
        },
      ],
    };

    assert.equal(
      actual.steps.some((step) => step.boundaryTrace.some((entry) => entry.kind === 'turnFlowLifecycle' && entry.step === 'coupHandoff')),
      true,
    );
    assert.deepEqual(actual, fixture);
  });
});
