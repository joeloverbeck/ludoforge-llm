import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  initialState,
  asPlayerId,
  asTokenId,
  asTriggerId,
  asZoneId,
  computeFullHash,
  createZobristTable,
  type GameDef,
  type GameState,
  type Move,
  type OperationFreeTraceEntry,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

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
    endConditions: [],
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

describe('applyMove', () => {
  it('applies cost then effects, increments action usage, dispatches actionResolved trigger, and updates hash', () => {
    const def = createDef();
    const state = createState();
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
    const state = createState();
    const badMove: Move = {
      actionId: asActionId('play'),
      params: { boost: 99 },
    };

    assert.throws(() => applyMove(def, state, badMove), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { actionId?: unknown; params?: unknown; reason?: unknown };
      assert.equal(details.actionId, asActionId('play'));
      assert.deepEqual(details.params, { boost: 99 });
      assert.equal(typeof details.reason, 'string');
      assert.match(details.message, /Illegal move/);
      return true;
    });
  });

  it('keeps input state unchanged when applyMove fails during effect execution', () => {
    const def = createDef();
    const state = createState();
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
          phase: asPhaseId('p2'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
            durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
          },
        },
      },
      actions: [
        {
          id: asActionId('pass'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
            durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
          },
        },
      },
      actions: [
        {
          id: asActionId('operation'),
          actor: 'active',
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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

  it('applies nextCard eligibility override directives and traces override creation', () => {
    const selfOverride = 'eligibilityOverride:self:eligible:remain-eligible';
    const targetOverride = 'eligibilityOverride:2:ineligible:force-ineligible';
    const noOverride = 'none';

    const def: GameDef = {
      metadata: { id: 'turn-flow-override-directives', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
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
                { id: 'remain-eligible', duration: 'nextCard' },
                { id: 'force-ineligible', duration: 'nextCard' },
              ],
            },
            optionMatrix: [{ first: 'event', second: ['operation'] }],
            passRewards: [],
            durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
          },
        },
      },
      actions: [
        {
          id: asActionId('event'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [
            { name: 'selfOverride', domain: { query: 'enums', values: [noOverride, selfOverride] } },
            { name: 'targetOverride', domain: { query: 'enums', values: [noOverride, targetOverride] } },
          ],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('operation'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;

    const start = initialState(def, 17, 4);
    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { selfOverride, targetOverride },
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
          legality: { op: '>=', left: { ref: 'gvar', var: 'energy' , right: 2 } },
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 9 } }],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { energy: 1, score: 0, triggered: 0 },
      actionUsage: {},
    };
    const snapshot = structuredClone(state);

    assert.throws(() => applyMove(def, state, { actionId: asActionId('operate'), params: {} }), (error: unknown) => {
      const details = error as Error & { reason?: unknown };
      assert.equal(details.reason, 'action is not legal in current state');
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 9 } }],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;
    const state: GameState = {
      ...createState(),
      globalVars: { energy: 1, score: 0, triggered: 0 },
      actionUsage: {},
    };
    const snapshot = structuredClone(state);

    assert.throws(() => applyMove(def, state, { actionId: asActionId('operate'), params: {} }), (error: unknown) => {
      const details = error as Error & { reason?: unknown };
      assert.equal(details.reason, 'action is not legal in current state');
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 9 } }],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [{ setVar: { scope: 'global', var: 'orderValue', value: 99 } }],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [{ addVar: { scope: 'global', var: 'energy', delta: -3 } }],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 99 } }],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
            durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;

    const start = initialState(def, 7, 4);
    const beforeEligibility = requireCardDrivenRuntime(start).eligibility;
    const beforeCard = requireCardDrivenRuntime(start).currentCard;

    const result = applyMove(def, start, { actionId: asActionId('operate'), params: {}, freeOperation: true });

    assert.deepEqual(requireCardDrivenRuntime(result.state).eligibility, beforeEligibility, 'eligibility should be unchanged');
    assert.equal(requireCardDrivenRuntime(result.state).currentCard.firstEligible, beforeCard.firstEligible);
    assert.equal(requireCardDrivenRuntime(result.state).currentCard.secondEligible, beforeCard.secondEligible);
    assert.deepEqual(requireCardDrivenRuntime(result.state).currentCard.actedFactions, beforeCard.actedFactions);
    const eligibilityEntries = result.triggerFirings.filter(
      (entry) => entry.kind === 'turnFlowEligibility',
    );
    assert.equal(eligibilityEntries.length, 0, 'no eligibility trace entries for free operations');
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [{ addVar: { scope: 'global', var: 'energy', delta: -3 } }],
          effects: [{ setVar: { scope: 'global', var: 'score', value: 99 } }],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
    const state = createState();

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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
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
          actor: 'active',
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
      endConditions: [],
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
        { id: asActionId('operate'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: asActionId('sa'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [{ setVar: { scope: 'global', var: 'order', value: 1 } }], limits: [] },
      ],
      triggers: [],
      endConditions: [],
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
        { id: asActionId('operate'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: asActionId('sa'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [{ addVar: { scope: 'global', var: 'order', delta: 5 } }], limits: [] },
      ],
      triggers: [],
      endConditions: [],
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
        { id: asActionId('operate'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: asActionId('sa'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [{ addVar: { scope: 'global', var: 'order', delta: 5 } }], limits: [] },
      ],
      triggers: [],
      endConditions: [],
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
        { id: asActionId('operate'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;

    const state: GameState = { ...createState(), globalVars: { ...createState().globalVars, v: 0 } };
    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.state.globalVars.v, 42);
  });
});
