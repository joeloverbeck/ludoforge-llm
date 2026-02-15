import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  legalMoves,
  initialState,
  ILLEGAL_MOVE_REASONS,
  asPlayerId,
  asTokenId,
  asTriggerId,
  asZoneId,
  computeFullHash,
  createZobristTable,
  legalChoices,
  type GameDef,
  type GameState,
  type Move,
  type OperationFreeTraceEntry,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime, withPendingFreeOperationGrant } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'apply-move-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'energy', type: 'int', init: 0, min: 0, max: 20 },
      { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
      { name: 'triggered', type: 'int', init: 0, min: 0, max: 10 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('play'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [{ name: 'boost', domain: { query: 'intsInRange', min: 1, max: 2 } }],
        pre: { op: '>=', left: { ref: 'gvar', var: 'energy' }, right: 2 },
        cost: [{ addVar: { scope: 'global', var: 'energy', delta: -2 } }],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: 'boost' } } }],
        limits: [{ scope: 'turn', max: 2 }],
      },
      {
        id: asActionId('broken'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [{ setVar: { scope: 'global', var: 'energy', value: 1 } }],
        effects: [{ setVar: { scope: 'global', var: 'missingVar', value: 1 } }],
        limits: [],
      },
    ],
    triggers: [
      {
        id: asTriggerId('onPlay'),
        event: { type: 'actionResolved', action: asActionId('play') },
        effects: [{ addVar: { scope: 'global', var: 'triggered', delta: 1 } }],
      },
    ],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const createState = (): GameState => ({
  globalVars: { energy: 5, score: 0, triggered: 0 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [7n, 11n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const playMove = (boost: number): Move => ({
  actionId: asActionId('play'),
  params: { boost },
});

const createEventDynamicDecisionDef = (withDeclaredParam = false): GameDef =>
  ({
    metadata: { id: withDeclaredParam ? 'event-dynamic-decision-with-declared' : 'event-dynamic-decision', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'resolved', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: withDeclaredParam ? [{ name: 'ticket', domain: { query: 'enums', values: ['ok'] } }] : [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: asZoneId('deck:none'),
        discardZone: asZoneId('played:none'),
        cards: [
          {
            id: 'event-card',
            title: 'Event Card',
            sideMode: 'single',
            unshaded: {
              effects: [
                {
                  chooseOne: {
                    internalDecisionId: 'decision:$delta',
                    bind: '$delta',
                    options: { query: 'enums', values: [1, 2] },
                  },
                },
                { addVar: { scope: 'global', var: 'resolved', delta: { ref: 'binding', name: '$delta' } } },
              ],
            },
          },
        ],
      },
    ],
  }) as unknown as GameDef;

const createEventDynamicDecisionState = (): GameState => ({
  ...createState(),
  globalVars: { resolved: 0 },
  zones: {
    'deck:none': [],
    'played:none': [{ id: asTokenId('event-card'), type: 'card', props: {} }],
  },
  actionUsage: {},
});

describe('applyMove', () => {
  it('applies cost then effects, increments action usage, dispatches actionResolved trigger, and updates hash', () => {
    const def = createDef();
    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, v: 0 } };
    const result = applyMove(def, state, playMove(2));

    assert.equal(result.state.globalVars.energy, 3);
    assert.equal(result.state.globalVars.score, 2);
    assert.equal(result.state.globalVars.triggered, 1);
    assert.deepEqual(result.state.actionUsage.play, { turnCount: 1, phaseCount: 1, gameCount: 1 });
    assert.deepEqual(result.triggerFirings, [
      {
        kind: 'fired',
        triggerId: asTriggerId('onPlay'),
        event: { type: 'actionResolved', action: asActionId('play') },
        depth: 0,
      },
    ]);

    const table = createZobristTable(def);
    assert.notEqual(result.state.stateHash, state.stateHash);
    assert.equal(result.state.stateHash, computeFullHash(table, result.state));
  });

  it('throws descriptive illegal-move error with actionId, params, and reason', () => {
    const def = createDef();
    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, v: 0 } };
    const badMove: Move = {
      actionId: asActionId('play'),
      params: { boost: 99 },
    };

    let thrown: unknown;
    try {
      applyMove(def, state, badMove);
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof Error, 'Expected applyMove to throw an Error');
    const details = thrown as Error & {
      code?: unknown;
      actionId?: unknown;
      params?: unknown;
      reason?: unknown;
      context?: Record<string, unknown>;
    };
    assert.equal(details.code, 'ILLEGAL_MOVE');
    assert.equal(details.actionId, asActionId('play'));
    assert.deepEqual(details.params, { boost: 99 });
    assert.equal(typeof details.reason, 'string');
    assert.equal(details.context?.reason, details.reason);
    assert.match(details.message, /Illegal move/);
  });

  it('applies non-pipeline effect decisions when provided via emitted decision ids', () => {
    const def: GameDef = {
      metadata: { id: 'non-pipeline-decision-validation', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [
        {
          id: asActionId('decide'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$pick',
                bind: '$pick',
                options: { query: 'enums', values: [1, 2] },
              },
            },
            { setVar: { scope: 'global', var: 'score', value: { ref: 'binding', name: '$pick' } } },
          ],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { score: 0 },
      actionUsage: {},
    };

    const pending = legalChoices(def, state, { actionId: asActionId('decide'), params: {} });
    assert.equal(pending.kind, 'pending');
    assert.equal(pending.type, 'chooseOne');

    const applied = applyMove(def, state, {
      actionId: asActionId('decide'),
      params: { [pending.decisionId]: 2 },
    }).state;
    assert.equal(applied.globalVars.score, 2);
  });

  it('keeps input state unchanged when applyMove fails during effect execution', () => {
    const def = createDef();
    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, v: 0 } };
    const originalSnapshot = structuredClone(state);

    assert.throws(
      () =>
        applyMove(def, state, {
          actionId: asActionId('broken'),
          params: {},
        }),
      /missingVar/,
    );

    assert.deepEqual(state, originalSnapshot);
  });

  it('advances to the next decision point after actionResolved processing', () => {
    const def: GameDef = {
      ...createDef(),
      globalVars: [],
      turnStructure: {
        phases: [{ id: asPhaseId('p1') }, { id: asPhaseId('p2') }],
      },
      actions: [
        {
          id: asActionId('advance'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('p1'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [{ scope: 'turn', max: 1 }],
        },
        {
          id: asActionId('decide'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('p2'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: {},
      currentPhase: asPhaseId('p1'),
      actionUsage: {},
    };

    const result = applyMove(def, state, {
      actionId: asActionId('advance'),
      params: {},
    });

    assert.equal(result.state.currentPhase, asPhaseId('p2'));
    assert.equal(result.state.turnCount, 0);
    assert.equal(result.state.activePlayer, asPlayerId(0));
  });

  it('queues simultaneous submissions and rotates to next unsubmitted player before commit', () => {
    const def: GameDef = {
      metadata: { id: 'simultaneous-submit', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      turnOrder: { type: 'simultaneous' },
      actions: [
        {
          id: asActionId('play'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'boost', domain: { query: 'intsInRange', min: 1, max: 2 } }],
          pre: null,
          cost: [],
          effects: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: 'boost' } } }],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { score: 0 },
      actionUsage: {},
      turnOrderState: {
        type: 'simultaneous',
        submitted: { '0': false, '1': false },
        pending: {},
      },
    };

    const first = applyMove(def, state, { actionId: asActionId('play'), params: { boost: 2 } });

    assert.equal(first.state.globalVars.score, 0);
    assert.equal(first.state.activePlayer, asPlayerId(1));
    assert.deepEqual(first.state.turnOrderState, {
      type: 'simultaneous',
      submitted: { '0': true, '1': false },
      pending: {
        '0': { actionId: 'play', params: { boost: 2 } },
      },
    });
    assert.deepEqual(first.triggerFirings, [
      {
        kind: 'simultaneousSubmission',
        player: '0',
        move: { actionId: 'play', params: { boost: 2 } },
        submittedBefore: { '0': false, '1': false },
        submittedAfter: { '0': true, '1': false },
      },
    ]);
  });

  it('commits simultaneous submissions in deterministic player order once all players submit', () => {
    const def: GameDef = {
      metadata: { id: 'simultaneous-commit', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      turnOrder: { type: 'simultaneous' },
      actions: [
        {
          id: asActionId('play'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'boost', domain: { query: 'intsInRange', min: 1, max: 2 } }],
          pre: null,
          cost: [],
          effects: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: 'boost' } } }],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { score: 0 },
      actionUsage: {},
      turnOrderState: {
        type: 'simultaneous',
        submitted: { '0': false, '1': false },
        pending: {},
      },
    };

    const first = applyMove(def, state, { actionId: asActionId('play'), params: { boost: 2 } });
    const second = applyMove(def, first.state, { actionId: asActionId('play'), params: { boost: 1 } });

    assert.equal(second.state.globalVars.score, 3);
    assert.equal(second.state.activePlayer, asPlayerId(0));
    assert.deepEqual(second.state.actionUsage.play, { turnCount: 2, phaseCount: 2, gameCount: 2 });
    assert.deepEqual(second.state.turnOrderState, {
      type: 'simultaneous',
      submitted: { '0': false, '1': false },
      pending: {},
    });
    assert.equal(second.triggerFirings[0]?.kind, 'simultaneousSubmission');
    assert.deepEqual(second.triggerFirings[1], {
      kind: 'simultaneousCommit',
      playersInOrder: ['0', '1'],
      pendingCount: 2,
    });
  });

  it('applies pass rewards and resets candidates when rightmost eligible faction passes', () => {
    const def: GameDef = {
      metadata: { id: 'turn-flow-pass-chain', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [
        { name: 'res0', type: 'int', init: 0, min: 0, max: 99 },
        { name: 'res1', type: 'int', init: 0, min: 0, max: 99 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { factions: ['0', '1', '2', '3'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [
              { factionClass: '0', resource: 'res0', amount: 1 },
              { factionClass: '1', resource: 'res1', amount: 3 },
            ],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const passMove: Move = { actionId: asActionId('pass'), params: {} };
    const start = initialState(def, 5, 4);
    const first = applyMove(def, start, passMove);
    const second = applyMove(def, first.state, passMove);
    const third = applyMove(def, second.state, passMove);
    const fourth = applyMove(def, third.state, passMove);

    assert.equal(first.state.globalVars.res0, 1);
    assert.equal(second.state.globalVars.res1, 3);
    assert.equal(fourth.state.activePlayer, asPlayerId(0));
    assert.equal(requireCardDrivenRuntime(fourth.state).currentCard.firstEligible, '0');
    assert.equal(requireCardDrivenRuntime(fourth.state).currentCard.secondEligible, '1');

    const eligibilityEntries = fourth.triggerFirings.filter(
      (entry): entry is Extract<TriggerLogEntry, { kind: 'turnFlowEligibility' }> => entry.kind === 'turnFlowEligibility',
    );
    const eligibilitySteps = eligibilityEntries
      .map((entry) => entry.step);
    assert.deepEqual(eligibilitySteps, ['passChain', 'cardEnd']);

    const cardEnd = eligibilityEntries.find((entry) => entry.step === 'cardEnd');
    assert.equal(cardEnd?.reason, 'rightmostPass');
  });

  it('marks non-pass executors ineligible for the next card at card end', () => {
    const def: GameDef = {
      metadata: { id: 'turn-flow-default-eligibility', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { factions: ['0', '1', '2', '3'], overrideWindows: [] },
            optionMatrix: [{ first: 'operation', second: ['limitedOperation', 'operation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      actions: [
        {
          id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('limitedOperation'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const start = initialState(def, 13, 4);
    const first = applyMove(def, start, { actionId: asActionId('operation'), params: {} }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} });

    assert.deepEqual(requireCardDrivenRuntime(second.state).eligibility, { '0': false, '1': false, '2': true, '3': true });
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.firstEligible, '2');
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.secondEligible, '3');
    assert.equal(second.state.activePlayer, asPlayerId(2));

    const cardEndEntry = second.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'cardEnd',
    );
    assert.deepEqual(
      (cardEndEntry as Extract<TriggerLogEntry, { kind: 'turnFlowEligibility' }> | undefined)?.eligibilityAfter,
      { '0': false, '1': false, '2': true, '3': true },
    );
  });

  it('applies typed nextTurn eligibility overrides and traces override creation', () => {
    const def: GameDef = {
      metadata: { id: 'turn-flow-override-typed', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: {
              factions: ['0', '1', '2', '3'],
              overrideWindows: [
                { id: 'remain-eligible', duration: 'nextTurn' },
                { id: 'force-ineligible', duration: 'nextTurn' },
              ],
            },
            optionMatrix: [{ first: 'event', second: ['operation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      actions: [
        {
          id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [
            { name: 'eventCardId', domain: { query: 'enums', values: ['card-overrides'] } },
            { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          ],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
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
              title: 'Typed Overrides',
              sideMode: 'single',
              unshaded: {
                text: 'Declare next-turn eligibility updates.',
                eligibilityOverrides: [
                  { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
                  { target: { kind: 'faction', faction: '2' }, eligible: false, windowId: 'force-ineligible' },
                ],
              },
            },
          ],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const start = initialState(def, 17, 4);
    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-overrides', side: 'unshaded' },
    });
    const second = applyMove(def, first.state, { actionId: asActionId('operation'), params: {} });

    assert.deepEqual(requireCardDrivenRuntime(second.state).eligibility, { '0': true, '1': false, '2': false, '3': true });
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.firstEligible, '0');
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.secondEligible, '3');
    assert.equal(second.state.activePlayer, asPlayerId(0));

    const overrideCreateEntry = first.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'overrideCreate',
    );
    assert.equal((overrideCreateEntry as Extract<TriggerLogEntry, { kind: 'turnFlowEligibility' }> | undefined)?.overrides?.length, 2);

    const cardEndEntry = second.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'cardEnd',
    );
    assert.equal((cardEndEntry as Extract<TriggerLogEntry, { kind: 'turnFlowEligibility' }> | undefined)?.overrides?.length, 2);
    assert.deepEqual(
      (cardEndEntry as Extract<TriggerLogEntry, { kind: 'turnFlowEligibility' }> | undefined)?.eligibilityAfter,
      { '0': true, '1': false, '2': false, '3': true },
    );
  });

  it('enforces operation-profile legality predicates before side effects', () => {
    const def: GameDef = {
      metadata: { id: 'operation-profile-legality', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [
        { name: 'energy', type: 'int', init: 0, min: 0, max: 20 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: { op: '>=', left: { ref: 'gvar', var: 'energy' }, right: 2 },
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 9 } }],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { energy: 1, score: 0, triggered: 0 },
      actionUsage: {},
    };
    const snapshot = structuredClone(state);

    assert.throws(() => applyMove(def, state, { actionId: asActionId('operate'), params: {} }), (error: unknown) => {
      const details = error as Error & { reason?: unknown };
      assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED);
      return true;
    });
    assert.deepEqual(state, snapshot);
  });

  it('blocks operation execution when partial mode is forbid and cost validation fails', () => {
    const def: GameDef = {
      metadata: { id: 'operation-profile-cost-forbid', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [
        { name: 'energy', type: 'int', init: 0, min: 0, max: 20 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: { op: '>=', left: { ref: 'gvar', var: 'energy' }, right: 2 },
          costEffects: [{ addVar: { scope: 'global', var: 'energy', delta: -2 } }],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 9 } }],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { energy: 1, score: 0, triggered: 0 },
      actionUsage: {},
    };
    const snapshot = structuredClone(state);

    assert.throws(() => applyMove(def, state, { actionId: asActionId('operate'), params: {} }), (error: unknown) => {
      const details = error as Error & { reason?: unknown };
      assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED);
      return true;
    });
    assert.deepEqual(state, snapshot);
  });

  it('allows partial operation execution when cost validation fails in allow mode', () => {
    const def: GameDef = {
      metadata: { id: 'operation-profile-cost-allow', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [
        { name: 'energy', type: 'int', init: 0, min: 0, max: 20 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: { op: '>=', left: { ref: 'gvar', var: 'energy' }, right: 2 },
          costEffects: [{ addVar: { scope: 'global', var: 'energy', delta: -2 } }],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }] }],
          atomicity: 'partial',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 9 } }],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { energy: 1, score: 0, triggered: 0 },
      actionUsage: {},
    };

    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.state.globalVars.energy, 1);
    assert.equal(result.state.globalVars.score, 1);
    assert.deepEqual(result.state.actionUsage.operate, { turnCount: 1, phaseCount: 1, gameCount: 1 });
    assert.deepEqual(result.triggerFirings[0], {
      kind: 'operationPartial',
      actionId: asActionId('operate'),
      profileId: 'operate-profile',
      step: 'costSpendSkipped',
      reason: 'costValidationFailed',
    });
  });

  it('skips RNG-consuming cost spend in allow mode when cost validation fails', () => {
    const def: GameDef = {
      metadata: { id: 'operation-profile-cost-allow-rng-skip', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [
        { name: 'energy', type: 'int', init: 0, min: 0, max: 20 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
      ],
      perPlayerVars: [],
      zones: [{ id: asZoneId('bag:none'), owner: 'none', visibility: 'public', ordering: 'stack' }],
      tokenTypes: [{ id: 'piece', props: {} }],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: { op: '>=', left: { ref: 'gvar', var: 'energy' }, right: 2 },
          costEffects: [{ shuffle: { zone: 'bag:none' } }],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }] }],
          atomicity: 'partial',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { energy: 1, score: 0, triggered: 0 },
      zones: {
        'bag:none': [
          { id: asTokenId('t-1'), type: 'piece', props: {} },
          { id: asTokenId('t-2'), type: 'piece', props: {} },
          { id: asTokenId('t-3'), type: 'piece', props: {} },
        ],
      },
      actionUsage: {},
    };

    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.state.globalVars.score, 1);
    assert.deepEqual(result.state.rng, state.rng);
    assert.deepEqual(
      result.state.zones['bag:none']?.map((token) => token.id),
      [asTokenId('t-1'), asTokenId('t-2'), asTokenId('t-3')],
    );
    assert.equal(result.triggerFirings.some((entry) => entry.kind === 'operationPartial'), true);

    const payableState: GameState = {
      ...state,
      globalVars: { energy: 2, score: 0, triggered: 0 },
      actionUsage: {},
    };
    const payableResult = applyMove(def, payableState, { actionId: asActionId('operate'), params: {} });
    assert.notDeepEqual(payableResult.state.rng, payableState.rng);
    assert.equal(payableResult.triggerFirings.some((entry) => entry.kind === 'operationPartial'), false);
  });

  it('executes operation-profile stages stages in declared order', () => {
    const def: GameDef = {
      metadata: { id: 'operation-profile-stage-order', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'orderValue', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [
            { effects: [{ setVar: { scope: 'global', var: 'orderValue', value: 1 } }] },
            { effects: [{ addVar: { scope: 'global', var: 'orderValue', delta: 4 } }] },
          ],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ setVar: { scope: 'global', var: 'orderValue', value: 99 } }],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { orderValue: 0 },
      actionUsage: {},
    };

    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.state.globalVars.orderValue, 5);
  });

  it('skips costSpend effects and preserves resources when freeOperation is true with operation profile', () => {
    const def: GameDef = {
      metadata: { id: 'free-op-cost-skip', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [
        { name: 'energy', type: 'int', init: 0, min: 0, max: 20 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null,
          costEffects: [{ addVar: { scope: 'global', var: 'energy', delta: -3 } }],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 5 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [{ addVar: { scope: 'global', var: 'energy', delta: -3 } }],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 99 } }],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { energy: 10, score: 0 },
      actionUsage: {},
    };

    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {}, freeOperation: true });
    assert.equal(result.state.globalVars.energy, 10, 'energy should be unchanged (costSpend skipped)');
    assert.equal(result.state.globalVars.score, 5, 'stages stage effects should still execute');
  });

  it('preserves eligibility state when freeOperation is true with operation profile', () => {
    const def: GameDef = {
      metadata: { id: 'free-op-eligibility', players: { min: 4, max: 4 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { factions: ['0', '1', '2', '3'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const start = initialState(def, 7, 4);
    const beforeEligibility = requireCardDrivenRuntime(start).eligibility;
    const beforeCard = requireCardDrivenRuntime(start).currentCard;

    const grantedStart = withPendingFreeOperationGrant(start, { actionIds: ['operate'] });
    const result = applyMove(def, grantedStart, { actionId: asActionId('operate'), params: {}, freeOperation: true });

    assert.deepEqual(requireCardDrivenRuntime(result.state).eligibility, beforeEligibility, 'eligibility should be unchanged');
    assert.equal(requireCardDrivenRuntime(result.state).currentCard.firstEligible, beforeCard.firstEligible);
    assert.equal(requireCardDrivenRuntime(result.state).currentCard.secondEligible, beforeCard.secondEligible);
    assert.deepEqual(requireCardDrivenRuntime(result.state).currentCard.actedFactions, beforeCard.actedFactions);
    const eligibilityEntries = result.triggerFirings.filter(
      (entry) => entry.kind === 'turnFlowEligibility',
    );
    assert.equal(eligibilityEntries.length, 0, 'no eligibility trace entries for free operations');
  });

  it('consumes exactly one matching grant instance per free operation use', () => {
    const def: GameDef = {
      metadata: { id: 'free-op-consume-single-grant', players: { min: 4, max: 4 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { factions: ['0', '1', '2', '3'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [{ effects: [] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const start = initialState(def, 71, 4);
    const withOneGrant = withPendingFreeOperationGrant(start, { actionIds: ['operate'] });
    const withTwoGrants = withPendingFreeOperationGrant(withOneGrant, { actionIds: ['operate'] });
    assert.equal(requireCardDrivenRuntime(withTwoGrants).pendingFreeOperationGrants?.length, 2);

    const firstFree = applyMove(def, withTwoGrants, {
      actionId: asActionId('operate'),
      params: {},
      freeOperation: true,
    }).state;
    const firstPending = requireCardDrivenRuntime(firstFree).pendingFreeOperationGrants ?? [];
    assert.equal(firstPending.length, 1);
    assert.equal(firstPending[0]?.faction, '0');
    assert.deepEqual(firstPending[0]?.actionIds, ['operate']);
    assert.equal(firstPending[0]?.remainingUses, 1);
    assert.equal(typeof firstPending[0]?.grantId, 'string');

    const secondFree = applyMove(def, firstFree, {
      actionId: asActionId('operate'),
      params: {},
      freeOperation: true,
    }).state;
    assert.equal(requireCardDrivenRuntime(secondFree).pendingFreeOperationGrants, undefined);
  });

  it('executes stages stage effects normally for free operations', () => {
    const def: GameDef = {
      metadata: { id: 'free-op-stages', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [
        { name: 'stageA', type: 'int', init: 0, min: 0, max: 20 },
        { name: 'stageB', type: 'int', init: 0, min: 0, max: 20 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null,
          costEffects: [{ setVar: { scope: 'global', var: 'stageA', value: 99 } }],
          targeting: {},
          stages: [
            { effects: [{ addVar: { scope: 'global', var: 'stageA', delta: 3 } }] },
            { effects: [{ addVar: { scope: 'global', var: 'stageB', delta: 7 } }] },
          ],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { stageA: 0, stageB: 0 },
      actionUsage: {},
    };

    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {}, freeOperation: true });
    assert.equal(result.state.globalVars.stageA, 3, 'stages stage A should execute');
    assert.equal(result.state.globalVars.stageB, 7, 'stages stage B should execute');
  });

  it('includes operationFree trace entry for free operations with operation profile', () => {
    const def: GameDef = {
      metadata: { id: 'free-op-trace', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: {},
      actionUsage: {},
    };

    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {}, freeOperation: true });
    const freeEntry = result.triggerFirings.find(
      (entry): entry is OperationFreeTraceEntry => entry.kind === 'operationFree',
    );
    assert.ok(freeEntry, 'should have operationFree trace entry');
    assert.equal(freeEntry.actionId, asActionId('operate'));
    assert.equal(freeEntry.step, 'costSpendSkipped');
  });

  it('applies costSpend and eligibility normally when freeOperation is not set (default)', () => {
    const def: GameDef = {
      metadata: { id: 'non-free-op-default', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [
        { name: 'energy', type: 'int', init: 0, min: 0, max: 20 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null,
          costEffects: [{ addVar: { scope: 'global', var: 'energy', delta: -3 } }],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 5 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [{ addVar: { scope: 'global', var: 'energy', delta: -3 } }],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 99 } }],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { energy: 10, score: 0 },
      actionUsage: {},
    };

    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.state.globalVars.energy, 7, 'costSpend should deduct energy');
    assert.equal(result.state.globalVars.score, 5, 'stages stage effects should execute');
    const freeEntries = result.triggerFirings.filter((entry) => entry.kind === 'operationFree');
    assert.equal(freeEntries.length, 0, 'no operationFree trace entry for non-free operations');
  });

  it('executes all effects normally when freeOperation is true but no operation profile exists (plain action)', () => {
    const def = createDef();
    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, v: 0 } };

    const result = applyMove(def, state, { ...playMove(2), freeOperation: true });
    assert.equal(result.state.globalVars.energy, 3, 'cost effects should still execute for plain actions');
    assert.equal(result.state.globalVars.score, 2, 'effects should still execute for plain actions');
    const freeEntries = result.triggerFirings.filter((entry) => entry.kind === 'operationFree');
    assert.equal(freeEntries.length, 0, 'no operationFree trace entry for plain actions');
  });

  it('bypasses cost validation for free operations even when cost validation would fail', () => {
    const def: GameDef = {
      metadata: { id: 'free-op-bypass-cost-validation', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [
        { name: 'energy', type: 'int', init: 0, min: 0, max: 20 },
        { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
      ],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: { op: '>=', left: { ref: 'gvar', var: 'energy' }, right: 5 },
          costEffects: [{ addVar: { scope: 'global', var: 'energy', delta: -5 } }],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 10 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { energy: 1, score: 0 },
      actionUsage: {},
    };

    // Without freeOperation, this would be rejected (energy=1 < required 5, mode=forbid → no template in legalMoves)
    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {}, freeOperation: true });
    assert.equal(result.state.globalVars.energy, 1, 'energy unchanged — cost bypassed');
    assert.equal(result.state.globalVars.score, 10, 'stages effects still execute');
  });

  it('resolves event side and branch effects from selected move params', () => {
    const def: GameDef = {
      metadata: { id: 'event-side-branch-stages', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'resolved', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [
        {
          id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [
            { name: 'side', domain: { query: 'enums', values: ['unshaded', 'shaded'] } },
            { name: 'branch', domain: { query: 'enums', values: ['a', 'b'] } },
          ],
          pre: null,
          cost: [],
          effects: [
            {
              if: {
                when: { op: '==', left: { ref: 'binding', name: 'side' }, right: 'unshaded' },
                then: [{ addVar: { scope: 'global', var: 'resolved', delta: 10 } }],
                else: [{ addVar: { scope: 'global', var: 'resolved', delta: 20 } }],
              },
            },
            {
              if: {
                when: { op: '==', left: { ref: 'binding', name: 'branch' }, right: 'a' },
                then: [{ addVar: { scope: 'global', var: 'resolved', delta: 1 } }],
                else: [{ addVar: { scope: 'global', var: 'resolved', delta: 2 } }],
              },
            },
          ],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      globalVars: { resolved: 0 },
      actionUsage: {},
    };

    const unshadedA = applyMove(def, state, {
      actionId: asActionId('event'),
      params: { side: 'unshaded', branch: 'a' },
    });
    const shadedB = applyMove(def, state, {
      actionId: asActionId('event'),
      params: { side: 'shaded', branch: 'b' },
    });

    assert.equal(unshadedA.state.globalVars.resolved, 11);
    assert.equal(shadedB.state.globalVars.resolved, 22);
  });

  it('applies event deck side and branch effects for event actions', () => {
    const def: GameDef = {
      metadata: { id: 'event-deck-side-branch-effects', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'resolved', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [
        {
          id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
      eventDecks: [
        {
          id: 'deck-1',
          drawZone: asZoneId('deck:none'),
          discardZone: asZoneId('played:none'),
          cards: [
            {
              id: 'card-1',
              title: 'Card 1',
              sideMode: 'dual',
              unshaded: {
                effects: [{ addVar: { scope: 'global', var: 'resolved', delta: 10 } }],
                branches: [
                  { id: 'a', effects: [{ addVar: { scope: 'global', var: 'resolved', delta: 1 } }] },
                  { id: 'b', effects: [{ addVar: { scope: 'global', var: 'resolved', delta: 2 } }] },
                ],
              },
              shaded: {
                effects: [{ addVar: { scope: 'global', var: 'resolved', delta: 20 } }],
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      globalVars: { resolved: 0 },
      zones: {
        'deck:none': [],
        'played:none': [{ id: asTokenId('card-1'), type: 'card', props: {} }],
      },
      actionUsage: {},
    };

    const unshadedMove = legalMoves(def, state).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'unshaded' && move.params.branch === 'a',
    );
    const shadedMove = legalMoves(def, state).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'shaded',
    );
    assert.notEqual(unshadedMove, undefined);
    assert.notEqual(shadedMove, undefined);

    const unshadedA = applyMove(def, state, unshadedMove!);
    const shaded = applyMove(def, state, shadedMove!);

    assert.equal(unshadedA.state.globalVars.resolved, 11);
    assert.equal(shaded.state.globalVars.resolved, 20);
  });

  it('does not execute event-card effects for misleading action id without cardEvent capability', () => {
    const def: GameDef = {
      metadata: { id: 'event-capability-required-for-event-effects', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'resolved', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [
        {
          id: asActionId('event'),
          actor: 'active',
          executor: 'actor',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
      eventDecks: [
        {
          id: 'deck-1',
          drawZone: asZoneId('deck:none'),
          discardZone: asZoneId('played:none'),
          cards: [
            {
              id: 'card-1',
              title: 'Card 1',
              sideMode: 'single',
              unshaded: {
                effects: [{ addVar: { scope: 'global', var: 'resolved', delta: 10 } }],
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      globalVars: { resolved: 0 },
      zones: {
        'deck:none': [],
        'played:none': [{ id: asTokenId('card-1'), type: 'card', props: {} }],
      },
      actionUsage: {},
    };

    const result = applyMove(def, state, { actionId: asActionId('event'), params: {} });
    assert.equal(result.state.globalVars.resolved, 0);
  });

  it('rejects incomplete dynamic event-side decision params before effect runtime', () => {
    const def = createEventDynamicDecisionDef();
    const state = createEventDynamicDecisionState();

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('event'), params: {} }),
      (error: unknown) => {
        const details = error as { readonly code?: string; readonly reason?: string; readonly metadata?: { readonly nextDecisionId?: string } };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS);
        assert.equal(details.metadata?.nextDecisionId, 'decision:$delta');
        return true;
      },
    );
  });

  it('rejects invalid dynamic event-side decision params with canonical invalid-params code', () => {
    const def = createEventDynamicDecisionDef();
    const state = createEventDynamicDecisionState();

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('event'), params: { 'decision:$delta': 99 } }),
      (error: unknown) => {
        const details = error as { readonly code?: string; readonly reason?: string };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID);
        return true;
      },
    );
  });

  it('keeps declared event action param mismatches distinct from dynamic decision validation', () => {
    const def = createEventDynamicDecisionDef(true);
    const state = createEventDynamicDecisionState();

    assert.throws(
      () =>
        applyMove(def, state, {
          actionId: asActionId('event'),
          params: { ticket: 'not-ok', 'decision:$delta': 1 },
        }),
      (error: unknown) => {
        const details = error as { readonly code?: string; readonly reason?: string; readonly metadata?: { readonly code?: string } };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION);
        assert.equal(details.metadata, undefined);
        return true;
      },
    );
  });

  it('activates selected lasting effects and applies setup effects for event moves', () => {
    const def: GameDef = {
      metadata: { id: 'event-lasting-effect-activation', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'aid', type: 'int', init: 0, min: -99, max: 99 }],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('draw:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      tokenTypes: [{ id: 'card', props: {} }],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      eventDecks: [
        {
          id: 'deck-a',
          drawZone: 'draw:none',
          discardZone: 'played:none',
          cards: [
            {
              id: 'card-1',
              title: 'Card 1',
              sideMode: 'single',
              unshaded: {
                lastingEffects: [
                  {
                    id: 'aid-shift',
                    duration: 'nextTurn',
                    setupEffects: [{ addVar: { scope: 'global', var: 'aid', delta: 3 } }],
                    teardownEffects: [{ addVar: { scope: 'global', var: 'aid', delta: -3 } }],
                  },
                ],
              },
            },
          ],
        },
      ],
      actions: [
        {
          id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'side', domain: { query: 'enums', values: ['unshaded'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      globalVars: { aid: 0 },
      zones: {
        'draw:none': [],
        'played:none': [{ id: asTokenId('card-1'), type: 'card', props: {} }],
        'lookahead:none': [],
        'leader:none': [],
      },
      actionUsage: {},
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
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
          pendingEligibilityOverrides: [],
        },
      },
    };

    const move = legalMoves(def, state).find((candidate) => String(candidate.actionId) === 'event');
    assert.notEqual(move, undefined);
    const result = applyMove(def, state, move!);

    assert.equal(result.state.globalVars.aid, 3);
    assert.equal(result.state.activeLastingEffects?.length, 1);
    assert.equal(result.state.activeLastingEffects?.[0]?.id, 'aid-shift');
    assert.equal(result.state.activeLastingEffects?.[0]?.remainingTurnBoundaries, 2);
  });

  it('activates lasting effects for event moves without cardDriven turnOrder by resolving from deck discard zones', () => {
    const def: GameDef = {
      metadata: { id: 'event-lasting-non-card-driven', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'aid', type: 'int', init: 0, min: -99, max: 99 }],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      tokenTypes: [{ id: 'card', props: {} }],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      eventDecks: [
        {
          id: 'deck-a',
          drawZone: 'deck:none',
          discardZone: 'discard:none',
          cards: [
            {
              id: 'card-1',
              title: 'Card 1',
              sideMode: 'single',
              unshaded: {
                lastingEffects: [
                  {
                    id: 'aid-shift',
                    duration: 'turn',
                    setupEffects: [{ addVar: { scope: 'global', var: 'aid', delta: 2 } }],
                    teardownEffects: [{ addVar: { scope: 'global', var: 'aid', delta: -2 } }],
                  },
                ],
              },
            },
          ],
        },
      ],
      actions: [
        {
          id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'side', domain: { query: 'enums', values: ['unshaded'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      globalVars: { aid: 0 },
      zones: {
        'deck:none': [],
        'discard:none': [{ id: asTokenId('card-1'), type: 'card', props: {} }],
      },
      actionUsage: {},
    };

    const move = legalMoves(def, state).find((candidate) => String(candidate.actionId) === 'event');
    assert.notEqual(move, undefined);
    const result = applyMove(def, state, move!);

    assert.equal(result.state.globalVars.aid, 2);
    assert.equal(result.state.activeLastingEffects?.length, 1);
    assert.equal(result.state.activeLastingEffects?.[0]?.id, 'aid-shift');
    assert.equal(result.state.activeLastingEffects?.[0]?.sourceCardId, 'card-1');
  });

  it('executes compound SA before operation stages when timing is "before"', () => {
    const def: GameDef = {
      metadata: { id: 'compound-before', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'order', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'order', delta: 10 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        { id: asActionId('operate'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: asActionId('sa'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [{ setVar: { scope: 'global', var: 'order', value: 1 } }], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, order: 0 } };
    const result = applyMove(def, state, {
      actionId: asActionId('operate'),
      params: {},
      compound: {
        specialActivity: { actionId: asActionId('sa'), params: {} },
        timing: 'before',
      },
    });

    // SA sets order=1 first, then operation adds 10 → 11
    assert.equal(result.state.globalVars.order, 11);
  });

  it('executes compound SA after operation stages when timing is "after"', () => {
    const def: GameDef = {
      metadata: { id: 'compound-after', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'order', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ setVar: { scope: 'global', var: 'order', value: 10 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        { id: asActionId('operate'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: asActionId('sa'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [{ addVar: { scope: 'global', var: 'order', delta: 5 } }], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, order: 0 } };
    const result = applyMove(def, state, {
      actionId: asActionId('operate'),
      params: {},
      compound: {
        specialActivity: { actionId: asActionId('sa'), params: {} },
        timing: 'after',
      },
    });

    // Operation sets order=10 first, then SA adds 5 → 15
    assert.equal(result.state.globalVars.order, 15);
  });

  it('executes compound SA during operation stages after specified stage index', () => {
    const def: GameDef = {
      metadata: { id: 'compound-during', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'order', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [
            { effects: [{ setVar: { scope: 'global', var: 'order', value: 1 } }] },
            { effects: [{ addVar: { scope: 'global', var: 'order', delta: 20 } }] },
          ],
          atomicity: 'atomic',
        },
      ],
      actions: [
        { id: asActionId('operate'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: asActionId('sa'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [{ addVar: { scope: 'global', var: 'order', delta: 5 } }], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, order: 0 } };
    const result = applyMove(def, state, {
      actionId: asActionId('operate'),
      params: {},
      compound: {
        specialActivity: { actionId: asActionId('sa'), params: {} },
        timing: 'during',
        insertAfterStage: 0,
      },
    });

    // Stage 0: order=1, then SA: order=1+5=6, then stage 1: order=6+20=26
    assert.equal(result.state.globalVars.order, 26);
  });

  it('executes non-compound moves identically to before (no compound field)', () => {
    const def: GameDef = {
      metadata: { id: 'no-compound', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'v', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ setVar: { scope: 'global', var: 'v', value: 42 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        { id: asActionId('operate'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, v: 0 } };
    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.state.globalVars.v, 42);
  });

  it('rejects compound SA when accompanyingOps excludes the operation action id', () => {
    const def: GameDef = {
      metadata: { id: 'compound-accompanying-op-reject', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'v', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'operate-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [] }],
          atomicity: 'atomic',
        },
        {
          id: 'sa-profile',
          actionId: asActionId('sa'),
          accompanyingOps: ['train'],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'v', delta: 1 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        { id: asActionId('operate'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: asActionId('train'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: asActionId('sa'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state = createState();
    assert.throws(
      () => applyMove(def, state, {
        actionId: asActionId('operate'),
        params: {},
        compound: { specialActivity: { actionId: asActionId('sa'), params: {} }, timing: 'after' },
      }),
      (error: unknown) => {
        const details = error as { readonly reason?: string };
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED);
        return true;
      },
    );
  });

  it('allows compound SA when accompanyingOps includes the operation action id', () => {
    const def: GameDef = {
      metadata: { id: 'compound-accompanying-op-allow', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'v', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'train-profile',
          actionId: asActionId('train'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'v', delta: 10 } }] }],
          atomicity: 'atomic',
        },
        {
          id: 'sa-profile',
          actionId: asActionId('sa'),
          accompanyingOps: ['train'],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'v', delta: 1 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        { id: asActionId('train'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: asActionId('sa'), actor: 'active', executor: 'actor', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, v: 0 } };
    const result = applyMove(def, state, {
      actionId: asActionId('train'),
      params: {},
      compound: { specialActivity: { actionId: asActionId('sa'), params: {} }, timing: 'after' },
    });
    assert.equal(result.state.globalVars.v, 11);
  });

  it('rejects compound SA when compoundParamConstraints disallow overlapping operation/SA params', () => {
    const def: GameDef = {
      metadata: { id: 'compound-param-constraint-reject', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'v', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'train-profile',
          actionId: asActionId('train'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'v', delta: 10 } }] }],
          atomicity: 'atomic',
        },
        {
          id: 'sa-profile',
          actionId: asActionId('sa'),
          accompanyingOps: ['train'],
          compoundParamConstraints: [{ relation: 'disjoint', operationParam: 'targetSpaces', specialActivityParam: 'targetSpaces' }],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'v', delta: 1 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('train'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'targetSpaces', domain: { query: 'enums', values: ['a', 'b'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('sa'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'targetSpaces', domain: { query: 'enums', values: ['a', 'b'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state = createState();
    assert.throws(
      () => applyMove(def, state, {
        actionId: asActionId('train'),
        params: { targetSpaces: ['a'] },
        compound: { specialActivity: { actionId: asActionId('sa'), params: { targetSpaces: ['a'] } }, timing: 'after' },
      }),
      (error: unknown) => {
        const details = error as { readonly reason?: string };
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED);
        return true;
      },
    );
  });

  it('rejects compound SA when subset constraint is violated', () => {
    const def: GameDef = {
      metadata: { id: 'compound-param-subset-reject', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'v', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'train-profile',
          actionId: asActionId('train'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'v', delta: 10 } }] }],
          atomicity: 'atomic',
        },
        {
          id: 'sa-profile',
          actionId: asActionId('sa'),
          accompanyingOps: ['train'],
          compoundParamConstraints: [{ relation: 'subset', operationParam: 'targetSpaces', specialActivityParam: 'targetSpaces' }],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'v', delta: 1 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('train'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'targetSpaces', domain: { query: 'enums', values: ['a', 'b', 'c'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('sa'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'targetSpaces', domain: { query: 'enums', values: ['a', 'b', 'c'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state = createState();
    assert.throws(
      () => applyMove(def, state, {
        actionId: asActionId('train'),
        params: { targetSpaces: ['a'] },
        compound: { specialActivity: { actionId: asActionId('sa'), params: { targetSpaces: ['b'] } }, timing: 'after' },
      }),
      (error: unknown) => {
        const details = error as { readonly reason?: string; readonly metadata?: { readonly relation?: string } };
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED);
        assert.equal(details.metadata?.relation, 'subset');
        return true;
      },
    );
  });

  it('allows compound SA when subset constraint is satisfied', () => {
    const def: GameDef = {
      metadata: { id: 'compound-param-subset-allow', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [{ name: 'v', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'train-profile',
          actionId: asActionId('train'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'v', delta: 10 } }] }],
          atomicity: 'atomic',
        },
        {
          id: 'sa-profile',
          actionId: asActionId('sa'),
          accompanyingOps: ['train'],
          compoundParamConstraints: [{ relation: 'subset', operationParam: 'targetSpaces', specialActivityParam: 'targetSpaces' }],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'v', delta: 1 } }] }],
          atomicity: 'atomic',
        },
      ],
      actions: [
        {
          id: asActionId('train'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'targetSpaces', domain: { query: 'enums', values: ['a', 'b', 'c'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('sa'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
          params: [{ name: 'targetSpaces', domain: { query: 'enums', values: ['a', 'b', 'c'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, v: 0 } };
    const result = applyMove(def, state, {
      actionId: asActionId('train'),
      params: { targetSpaces: ['a', 'b'] },
      compound: { specialActivity: { actionId: asActionId('sa'), params: { targetSpaces: ['b'] } }, timing: 'after' },
    });
    assert.equal(result.state.globalVars.v, 11);
  });
});
