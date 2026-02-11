import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  initialState,
  asPlayerId,
  asTriggerId,
  computeFullHash,
  createZobristTable,
  type GameDef,
  type GameState,
  type Move,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';

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
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
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
        activePlayerOrder: 'roundRobin',
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
      turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
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
    assert.equal(fourth.state.turnFlow?.currentCard.firstEligible, '0');
    assert.equal(fourth.state.turnFlow?.currentCard.secondEligible, '1');

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
      turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: { factions: ['0', '1', '2', '3'], overrideWindows: [] },
        optionMatrix: [{ first: 'operation', second: ['limitedOperation', 'operation'] }],
        passRewards: [],
        durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
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

    assert.deepEqual(second.state.turnFlow?.eligibility, { '0': false, '1': false, '2': true, '3': true });
    assert.equal(second.state.turnFlow?.currentCard.firstEligible, '2');
    assert.equal(second.state.turnFlow?.currentCard.secondEligible, '3');
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
      turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
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

    assert.deepEqual(second.state.turnFlow?.eligibility, { '0': true, '1': false, '2': false, '3': true });
    assert.equal(second.state.turnFlow?.currentCard.firstEligible, '0');
    assert.equal(second.state.turnFlow?.currentCard.secondEligible, '3');
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
});
