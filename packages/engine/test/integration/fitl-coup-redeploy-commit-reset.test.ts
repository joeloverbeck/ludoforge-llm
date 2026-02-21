import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  asPhaseId,
  initialState,
  type EffectAST,
  type GameDef,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

interface CoupFixtureOptions {
  readonly isFinalCoup: boolean;
  readonly trail: number;
}

const createRedeployCommitResetDef = (options: CoupFixtureOptions): GameDef => {
  const recomputeControlValue = {
    op: '+',
    left: { ref: 'zoneCount', zone: 'arvn_redeploy:none' },
    right: { ref: 'zoneCount', zone: 'nva_base:none' },
  } as const;

  const redeployEffects: EffectAST[] = [
    { moveAll: { from: 'laos_coin:none', to: 'coin_available:none' } },
    { moveAll: { from: 'cambodia_coin:none', to: 'coin_available:none' } },
    { moveAll: { from: 'arvn_force_pool:none', to: 'arvn_redeploy:none' } },
    { moveAll: { from: 'nva_force_pool:none', to: 'nva_base:none' } },
    { setVar: { scope: 'global', var: 'redeployControlCheckpoint', value: recomputeControlValue } },
    { setVar: { scope: 'global', var: 'redeployExecuted', value: 1 } },
  ];

  const commitmentEffects: EffectAST[] = [
    {
      if: {
        when: { op: '==', left: { ref: 'gvar', var: 'isFinalCoup' }, right: 0 },
        then: [
          { moveAll: { from: 'us_out_of_play:none', to: 'us_available:none' } },
          { setVar: { scope: 'global', var: 'commitmentControlCheckpoint', value: recomputeControlValue } },
          { setVar: { scope: 'global', var: 'commitmentExecuted', value: 1 } },
        ],
      },
    },
  ];

  const resetEffects: EffectAST[] = [
    {
      if: {
        when: { op: '==', left: { ref: 'gvar', var: 'isFinalCoup' }, right: 0 },
        then: [
          {
            if: {
              when: { op: '==', left: { ref: 'gvar', var: 'trail' }, right: 0 },
              then: [{ addVar: { scope: 'global', var: 'trail', delta: 1 } }],
              else: [
                {
                  if: {
                    when: { op: '==', left: { ref: 'gvar', var: 'trail' }, right: 4 },
                    then: [{ addVar: { scope: 'global', var: 'trail', delta: -1 } }],
                  },
                },
              ],
            },
          },
          { moveAll: { from: 'terror_map:none', to: 'terror_available:none' } },
          { moveAll: { from: 'sabotage_map:none', to: 'sabotage_available:none' } },
          { moveAll: { from: 'guerrilla_active:none', to: 'guerrilla_underground:none' } },
          { moveAll: { from: 'sf_active:none', to: 'sf_underground:none' } },
          { moveAll: { from: 'momentum_in_play:none', to: 'momentum_discard:none' } },
          { setVar: { scope: 'global', var: 'eligibilityBaselineAudit', value: 1 } },
          { setVar: { scope: 'global', var: 'resetExecuted', value: 1 } },
        ],
      },
    },
  ];

  return {
    metadata: { id: 'fitl-coup-redeploy-commit-reset-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'isFinalCoup', type: 'int', init: options.isFinalCoup ? 1 : 0, min: 0, max: 1 },
      { name: 'trail', type: 'int', init: options.trail, min: 0, max: 4 },
      { name: 'redeployControlCheckpoint', type: 'int', init: 0, min: 0, max: 75 },
      { name: 'commitmentControlCheckpoint', type: 'int', init: 0, min: 0, max: 75 },
      { name: 'redeployExecuted', type: 'int', init: 0, min: 0, max: 1 },
      { name: 'commitmentExecuted', type: 'int', init: 0, min: 0, max: 1 },
      { name: 'resetExecuted', type: 'int', init: 0, min: 0, max: 1 },
      { name: 'eligibilityBaselineAudit', type: 'int', init: 0, min: 0, max: 1 },
    ],
    perPlayerVars: [],
    zones: [
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'played:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'lookahead:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'leader:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'laos_coin:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'cambodia_coin:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'coin_available:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'arvn_force_pool:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'arvn_redeploy:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'nva_force_pool:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'nva_base:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'us_out_of_play:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'us_available:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'terror_map:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'sabotage_map:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'terror_available:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'sabotage_available:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'guerrilla_active:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'guerrilla_underground:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'sf_active:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'sf_underground:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'momentum_in_play:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'momentum_discard:none', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [
      { id: 'card', props: { isCoup: 'boolean' } },
      { id: 'piece', props: {} },
      { id: 'marker', props: {} },
    ],
    setup: [
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'piece', zone: 'laos_coin:none' } },
      { createToken: { type: 'piece', zone: 'cambodia_coin:none' } },
      { createToken: { type: 'piece', zone: 'arvn_force_pool:none' } },
      { createToken: { type: 'piece', zone: 'arvn_force_pool:none' } },
      { createToken: { type: 'piece', zone: 'nva_force_pool:none' } },
      { createToken: { type: 'piece', zone: 'us_out_of_play:none' } },
      { createToken: { type: 'piece', zone: 'us_out_of_play:none' } },
      { createToken: { type: 'marker', zone: 'terror_map:none' } },
      { createToken: { type: 'marker', zone: 'sabotage_map:none' } },
      { createToken: { type: 'piece', zone: 'guerrilla_active:none' } },
      { createToken: { type: 'piece', zone: 'sf_active:none' } },
      { createToken: { type: 'marker', zone: 'momentum_in_play:none' } },
    ],
    turnStructure: {
      phases: [
        { id: asPhaseId('main') },
        { id: asPhaseId('redeploy') },
        { id: asPhaseId('commitment') },
        { id: asPhaseId('reset') },
      ],
    },
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
    actions: [
      {
        id: 'pass',
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [
      { id: 'on_redeploy_enter', event: { type: 'phaseEnter', phase: asPhaseId('redeploy') }, effects: redeployEffects },
      { id: 'on_commitment_enter', event: { type: 'phaseEnter', phase: asPhaseId('commitment') }, effects: commitmentEffects },
      { id: 'on_reset_enter', event: { type: 'phaseEnter', phase: asPhaseId('reset') }, effects: resetEffects },
    ],
    terminal: { conditions: [] },
  } as unknown as GameDef;
};

describe('FITL coup redeploy/commitment/reset integration', () => {
  it('executes non-final redeploy, commitment, and reset effects with deterministic checkpoints', () => {
    const def = createRedeployCommitResetDef({ isFinalCoup: false, trail: 4 });
    const start = initialState(def, 73, 2).state;
    const phaseLog: TriggerLogEntry[] = [];

    const afterRedeploy = advancePhase(def, start, phaseLog);
    assert.equal(afterRedeploy.currentPhase, asPhaseId('redeploy'));
    assert.equal(afterRedeploy.globalVars.redeployExecuted, 1);
    assert.equal(afterRedeploy.globalVars.redeployControlCheckpoint, 3);
    assert.equal(afterRedeploy.zones['coin_available:none']?.length, 2);
    assert.equal(afterRedeploy.zones['arvn_redeploy:none']?.length, 2);
    assert.equal(afterRedeploy.zones['nva_base:none']?.length, 1);

    const afterCommitment = advancePhase(def, afterRedeploy, phaseLog);
    assert.equal(afterCommitment.currentPhase, asPhaseId('commitment'));
    assert.equal(afterCommitment.globalVars.commitmentExecuted, 1);
    assert.equal(afterCommitment.globalVars.commitmentControlCheckpoint, 3);
    assert.equal(afterCommitment.zones['us_available:none']?.length, 2);
    assert.equal(afterCommitment.zones['us_out_of_play:none']?.length, 0);

    const afterReset = advancePhase(def, afterCommitment, phaseLog);
    assert.equal(afterReset.currentPhase, asPhaseId('reset'));
    assert.equal(afterReset.globalVars.resetExecuted, 1);
    assert.equal(afterReset.globalVars.eligibilityBaselineAudit, 1);
    assert.equal(afterReset.globalVars.trail, 3);
    assert.equal(afterReset.zones['terror_available:none']?.length, 1);
    assert.equal(afterReset.zones['sabotage_available:none']?.length, 1);
    assert.equal(afterReset.zones['guerrilla_underground:none']?.length, 1);
    assert.equal(afterReset.zones['sf_underground:none']?.length, 1);
    assert.equal(afterReset.zones['momentum_discard:none']?.length, 1);
    const phaseTriggerOrder = phaseLog
      .filter((entry) => entry.kind === 'fired')
      .map((entry) => entry.triggerId);
    assert.deepEqual(phaseTriggerOrder, ['on_redeploy_enter', 'on_commitment_enter', 'on_reset_enter']);

    const lifecycleLog: TriggerLogEntry[] = [];
    const nextTurn = advancePhase(def, afterReset, lifecycleLog);

    assert.equal(nextTurn.currentPhase, asPhaseId('main'));
    assert.equal(nextTurn.turnCount, 1);
    assert.equal(requireCardDrivenRuntime(nextTurn).currentCard.nonPassCount, 0);
    assert.equal(requireCardDrivenRuntime(nextTurn).currentCard.firstActionClass, null);
    assert.deepEqual(requireCardDrivenRuntime(nextTurn).eligibility, { '0': true, '1': true });

    const lifecycleSteps = lifecycleLog
      .filter((entry) => entry.kind === 'turnFlowLifecycle')
      .map((entry) => entry.step);
    assert.deepEqual(lifecycleSteps, ['promoteLookaheadToPlayed', 'revealLookahead']);
  });

  it('skips commitment/reset effects on final coup when fixture policy marks final round', () => {
    const def = createRedeployCommitResetDef({ isFinalCoup: true, trail: 0 });
    const start = initialState(def, 79, 2).state;

    const afterRedeploy = advancePhase(def, start);
    const afterCommitment = advancePhase(def, afterRedeploy);
    const afterReset = advancePhase(def, afterCommitment);

    assert.equal(afterCommitment.globalVars.commitmentExecuted, 0);
    assert.equal(afterReset.globalVars.resetExecuted, 0);
    assert.equal(afterReset.globalVars.eligibilityBaselineAudit, 0);
    assert.equal(afterReset.globalVars.trail, 0);
    assert.equal(afterReset.zones['us_out_of_play:none']?.length, 2);
    assert.equal(afterReset.zones['us_available:none']?.length, 0);
    assert.equal(afterReset.zones['terror_map:none']?.length, 1);
    assert.equal(afterReset.zones['sabotage_map:none']?.length, 1);
    assert.equal(afterReset.zones['guerrilla_active:none']?.length, 1);
    assert.equal(afterReset.zones['sf_active:none']?.length, 1);
    assert.equal(afterReset.zones['momentum_in_play:none']?.length, 1);
  });

  it('is deterministic for identical seed and fixture inputs', () => {
    const def = createRedeployCommitResetDef({ isFinalCoup: false, trail: 0 });

    const runOnce = () => {
      const start = initialState(def, 83, 2).state;
      const redeploy = advancePhase(def, start);
      const commitment = advancePhase(def, redeploy);
      const reset = advancePhase(def, commitment);
      const lifecycleLog: TriggerLogEntry[] = [];
      const nextTurn = advancePhase(def, reset, lifecycleLog);
      return { nextTurn, lifecycleLog };
    };

    assert.deepEqual(runOnce(), runOnce());
  });
});
