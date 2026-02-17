import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPhaseId, initialState, legalMoves, type GameDef, type TriggerLogEntry } from '../../src/kernel/index.js';

const createLifecycleDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-card-lifecycle-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
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
          eligibility: { factions: [], overrideWindows: [] },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [{ scope: 'turn', max: 1 }],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const lifecycleSteps = (entries: readonly TriggerLogEntry[]): readonly string[] =>
  entries
    .filter((entry): entry is Extract<TriggerLogEntry, { kind: 'turnFlowLifecycle' }> => entry.kind === 'turnFlowLifecycle')
    .map((entry) => entry.step);

describe('FITL card lifecycle integration', () => {
  it('promotes lookahead and records coup handoff lifecycle trace entries in applyMove logs', () => {
    const def = createLifecycleDef();
    const start = initialState(def, 9, 2);

    assert.equal(start.zones['played:none']?.[0]?.id, 'tok_card_3');
    assert.equal(start.zones['lookahead:none']?.[0]?.id, 'tok_card_2');

    const first = applyMove(def, start, legalMoves(def, start)[0]!);
    assert.deepEqual(lifecycleSteps(first.triggerFirings), ['promoteLookaheadToPlayed', 'revealLookahead']);
    assert.equal(first.state.zones['played:none']?.[0]?.id, 'tok_card_2');
    assert.equal(first.state.zones['lookahead:none']?.[0]?.id, 'tok_card_1');

    const second = applyMove(def, first.state, legalMoves(def, first.state)[0]!);
    assert.deepEqual(lifecycleSteps(second.triggerFirings), [
      'coupToLeader',
      'coupHandoff',
      'promoteLookaheadToPlayed',
      'revealLookahead',
    ]);
    assert.equal(second.state.zones['leader:none']?.[0]?.id, 'tok_card_2');
    assert.equal(second.state.zones['played:none']?.[0]?.id, 'tok_card_1');
    assert.equal(second.state.zones['lookahead:none']?.[0]?.id, 'tok_card_0');
  });

  it('enforces coupPlan.maxConsecutiveRounds by suppressing repeated coup handoffs', () => {
    const baseDef = createLifecycleDef();
    assert.equal(baseDef.turnOrder?.type, 'cardDriven');
    const baseTurnOrderConfig =
      baseDef.turnOrder?.type === 'cardDriven'
        ? baseDef.turnOrder.config
        : (() => {
            throw new Error('Expected cardDriven turnOrder in lifecycle fixture');
          })();
    const def: GameDef = {
      ...baseDef,
      setup: [
        { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
        { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } },
        { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } },
        { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          ...baseTurnOrderConfig,
          coupPlan: {
            phases: [{ id: 'victory', steps: ['check-thresholds'] }],
            maxConsecutiveRounds: 1,
          },
        },
      },
    };

    const start = initialState(def, 9, 2);
    const first = applyMove(def, start, legalMoves(def, start)[0]!);
    const second = applyMove(def, first.state, legalMoves(def, first.state)[0]!);
    const third = applyMove(def, second.state, legalMoves(def, second.state)[0]!);

    assert.deepEqual(lifecycleSteps(first.triggerFirings), ['promoteLookaheadToPlayed', 'revealLookahead']);
    assert.deepEqual(lifecycleSteps(second.triggerFirings), ['coupToLeader', 'coupHandoff', 'promoteLookaheadToPlayed', 'revealLookahead']);
    assert.deepEqual(lifecycleSteps(third.triggerFirings), ['promoteLookaheadToPlayed']);
    assert.equal(third.state.zones['leader:none']?.length, 1);
    assert.equal(third.state.zones['leader:none']?.[0]?.id, 'tok_card_2');
  });
});
