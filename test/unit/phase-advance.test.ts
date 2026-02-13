import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  advanceToDecisionPoint,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asTriggerId,
  asZoneId,
  terminalResult,
  type TriggerLogEntry,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createBaseDef = (): GameDef =>
  ({
    metadata: { id: 'phase-advance-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'step', type: 'int', init: 0, min: 0, max: 100 },
      { name: 'order', type: 'int', init: 0, min: 0, max: 10000 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('p1') }, { id: asPhaseId('p2') }],
    },
    actions: [],
    triggers: [],
    endConditions: [],
  }) as unknown as GameDef;

const createState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { step: 0, order: 0 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('p1'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {
    pass: { turnCount: 3, phaseCount: 2, gameCount: 9 },
  },
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

describe('phase advancement', () => {
  it('advances phases in declared order', () => {
    const def = createBaseDef();
    const state = createState({ currentPhase: asPhaseId('p1') });

    const next = advancePhase(def, state);

    assert.equal(next.currentPhase, asPhaseId('p2'));
    assert.equal(next.turnCount, 0);
    assert.equal(next.activePlayer, asPlayerId(0));
  });

  it('advances from last phase to next turn and next player for roundRobin', () => {
    const def = createBaseDef();
    const state = createState({
      currentPhase: asPhaseId('p2'),
      turnCount: 4,
      activePlayer: asPlayerId(0),
    });

    const next = advancePhase(def, state);

    assert.equal(next.currentPhase, asPhaseId('p1'));
    assert.equal(next.turnCount, 5);
    assert.equal(next.activePlayer, asPlayerId(1));
  });

  it('advances active player at turn boundary according to fixed order', () => {
    const baseDef = createBaseDef();
    const def: GameDef = {
      ...baseDef,
      turnOrder: { type: 'fixedOrder', order: ['1', '0'] },
    };
    const state = createState({
      currentPhase: asPhaseId('p2'),
      turnCount: 4,
      activePlayer: asPlayerId(1),
      turnOrderState: { type: 'fixedOrder', currentIndex: 0 },
    });

    const next = advancePhase(def, state);

    assert.equal(next.currentPhase, asPhaseId('p1'));
    assert.equal(next.turnCount, 5);
    assert.equal(next.activePlayer, asPlayerId(0));
    assert.deepEqual(next.turnOrderState, { type: 'fixedOrder', currentIndex: 1 });
  });

  it('resets phase counters on phase boundary and preserves gameCount', () => {
    const def = createBaseDef();
    const state = createState({ currentPhase: asPhaseId('p1') });

    const next = advancePhase(def, state);

    assert.deepEqual(next.actionUsage.pass, { turnCount: 3, phaseCount: 0, gameCount: 9 });
  });

  it('resets turn and phase counters on turn boundary and preserves gameCount', () => {
    const def = createBaseDef();
    const state = createState({ currentPhase: asPhaseId('p2') });

    const next = advancePhase(def, state);

    assert.deepEqual(next.actionUsage.pass, { turnCount: 0, phaseCount: 0, gameCount: 9 });
  });

  it('dispatches intra-turn lifecycle events in order: phaseExit then phaseEnter', () => {
    const def = createBaseDef();
    const orderedDef: GameDef = {
      ...def,
      triggers: [
        {
          id: asTriggerId('onP1Exit'),
          event: { type: 'phaseExit', phase: asPhaseId('p1') },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 100 } } },
          ],
        },
        {
          id: asTriggerId('onP2Enter'),
          event: { type: 'phaseEnter', phase: asPhaseId('p2') },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 10 } } },
          ],
        },
      ],
    };

    const next = advancePhase(orderedDef, createState({ currentPhase: asPhaseId('p1') }));

    assert.equal(next.globalVars.step, 2);
    assert.equal(next.globalVars.order, 120);
  });

  it('dispatches turn-boundary lifecycle order: phaseExit(last), turnEnd, turnStart, phaseEnter(first)', () => {
    const def = createBaseDef();
    const orderedDef: GameDef = {
      ...def,
      triggers: [
        {
          id: asTriggerId('onP2Exit'),
          event: { type: 'phaseExit', phase: asPhaseId('p2') },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 1000 } } },
          ],
        },
        {
          id: asTriggerId('onTurnEnd'),
          event: { type: 'turnEnd' },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 100 } } },
          ],
        },
        {
          id: asTriggerId('onTurnStart'),
          event: { type: 'turnStart' },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 10 } } },
          ],
        },
        {
          id: asTriggerId('onP1Enter'),
          event: { type: 'phaseEnter', phase: asPhaseId('p1') },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { ref: 'gvar', var: 'step' } } },
          ],
        },
      ],
    };

    const next = advancePhase(orderedDef, createState({ currentPhase: asPhaseId('p2') }));

    assert.equal(next.globalVars.step, 4);
    assert.equal(next.globalVars.order, 1234);
  });

  it('auto-advances empty decision points to next legal decision point', () => {
    const def = createBaseDef();
    const withAction: GameDef = {
      ...def,
      actions: [
        {
          id: asActionId('onlyInP2'),
          actor: 'active',
          phase: asPhaseId('p2'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    };

    const next = advanceToDecisionPoint(withAction, createState({ currentPhase: asPhaseId('p1') }));

    assert.equal(next.currentPhase, asPhaseId('p2'));
    assert.equal(next.turnCount, 0);
  });

  it('throws STALL_LOOP_DETECTED when bounded auto-advancement is exceeded', () => {
    const def = createBaseDef();
    const state = createState({ currentPhase: asPhaseId('p1') });

    assert.throws(() => advanceToDecisionPoint(def, state), /STALL_LOOP_DETECTED/);
  });

  it('does not auto-advance when current state is terminal with zero legal moves', () => {
    const def: GameDef = {
      ...createBaseDef(),
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
    };
    const state = createState({ currentPhase: asPhaseId('p1') });

    const next = advanceToDecisionPoint(def, state);

    assert.equal(terminalResult(def, next)?.type, 'draw');
    assert.equal(next.currentPhase, state.currentPhase);
    assert.equal(next.turnCount, state.turnCount);
    assert.equal(next.activePlayer, state.activePlayer);
  });

  it('runs card boundary lifecycle promotion and coup handoff at turn boundary when turnFlow is configured', () => {
    const def: GameDef = {
      metadata: { id: 'phase-lifecycle', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
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
            durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
          },
        },
      },
      actions: [],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;

    const state: GameState = {
      ...createState({
        currentPhase: asPhaseId('main'),
        zones: {
          'deck:none': [{ id: asTokenId('tok_card_2'), type: 'card', props: { isCoup: false } }],
          'played:none': [{ id: asTokenId('tok_card_0'), type: 'card', props: { isCoup: true } }],
          'lookahead:none': [{ id: asTokenId('tok_card_1'), type: 'card', props: { isCoup: false } }],
          'leader:none': [],
        },
      }),
      globalVars: {},
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
      markers: {},
    };
    const logs: TriggerLogEntry[] = [];

    const next = advancePhase(def, state, logs);

    assert.equal(next.turnCount, 1);
    assert.equal(next.activePlayer, asPlayerId(0));
    assert.equal(next.zones['leader:none']?.[0]?.id, 'tok_card_0');
    assert.equal(next.zones['played:none']?.[0]?.id, 'tok_card_1');
    assert.equal(next.zones['lookahead:none']?.[0]?.id, 'tok_card_2');

    const lifecycleSteps = logs
      .filter((entry): entry is Extract<TriggerLogEntry, { kind: 'turnFlowLifecycle' }> => entry.kind === 'turnFlowLifecycle')
      .map((entry) => entry.step);
    assert.deepEqual(lifecycleSteps, ['coupToLeader', 'coupHandoff', 'promoteLookaheadToPlayed', 'revealLookahead']);
  });

  it('suppresses a second consecutive coup handoff when coupPlan.maxConsecutiveRounds is 1', () => {
    const def: GameDef = {
      metadata: { id: 'phase-lifecycle-consecutive', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
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
            durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
          },
          coupPlan: {
            phases: [{ id: 'victory', steps: ['check-thresholds'] }],
            maxConsecutiveRounds: 1,
          },
        },
      },
      actions: [],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;

    const state: GameState = {
      ...createState({
        currentPhase: asPhaseId('main'),
        zones: {
          'deck:none': [{ id: asTokenId('tok_card_2'), type: 'card', props: { isCoup: false } }],
          'played:none': [{ id: asTokenId('tok_card_0'), type: 'card', props: { isCoup: true } }],
          'lookahead:none': [{ id: asTokenId('tok_card_1'), type: 'card', props: { isCoup: true } }],
          'leader:none': [],
        },
      }),
      globalVars: {},
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
          consecutiveCoupRounds: 0,
        },
      },
      markers: {},
    };

    const firstLogs: TriggerLogEntry[] = [];
    const afterFirst = advancePhase(def, state, firstLogs);

    const secondLogs: TriggerLogEntry[] = [];
    const afterSecond = advancePhase(def, afterFirst, secondLogs);

    const firstLifecycleSteps = firstLogs
      .filter((entry): entry is Extract<TriggerLogEntry, { kind: 'turnFlowLifecycle' }> => entry.kind === 'turnFlowLifecycle')
      .map((entry) => entry.step);
    const secondLifecycleSteps = secondLogs
      .filter((entry): entry is Extract<TriggerLogEntry, { kind: 'turnFlowLifecycle' }> => entry.kind === 'turnFlowLifecycle')
      .map((entry) => entry.step);

    assert.deepEqual(firstLifecycleSteps, ['coupToLeader', 'coupHandoff', 'promoteLookaheadToPlayed', 'revealLookahead']);
    assert.deepEqual(secondLifecycleSteps, ['promoteLookaheadToPlayed']);
    assert.equal(afterSecond.zones['leader:none']?.length, 1);
    assert.equal(afterSecond.zones['leader:none']?.[0]?.id, 'tok_card_0');
    assert.equal(requireCardDrivenRuntime(afterSecond).consecutiveCoupRounds, 1);
  });
});
