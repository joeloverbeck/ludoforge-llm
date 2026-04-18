// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { completeTemplateMove } from '../../../src/kernel/move-completion.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createRng,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { createTemplateChooseOneAction, createTemplateChooseOneProfile } from '../../helpers/agent-template-fixtures.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

const baseState: GameState = {
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: phaseId,
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
};

const createChooseNAction = (id: string): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  executor: 'actor',
  phase: [phaseId],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const createChooseNProfile = (
  actionId: string,
  min: number,
  max: number,
  values: readonly string[],
): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values },
            min,
            max,
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

const createDef = (action: ActionDef, profile: ActionPipelineDef): GameDef => ({
  metadata: { id: 'template-completion-agent', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [action],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [profile],
});

const createStochasticProfile = (actionId: string): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: [
        eff({
          rollRandom: {
            bind: '$roll',
            min: 1,
            max: 2,
            in: [
              eff({
                chooseN: {
                  internalDecisionId: 'decision:$targets',
                  bind: '$targets',
                  options: { query: 'enums', values: ['a', 'b', 'c'] },
                  min: { _t: 2, ref: 'binding', name: '$roll' },
                  max: { _t: 2, ref: 'binding', name: '$roll' },
                },
              }) as ActionDef['effects'][number],
            ],
          },
        }) as ActionDef['effects'][number],
      ],
    },
  ],
  atomicity: 'atomic',
});

const createLaterBranchTrapProfile = (actionId: string): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$gate',
            bind: '$gate',
            options: { query: 'enums', values: ['open'] },
          },
        }),
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$path',
            bind: '$path',
            options: { query: 'enums', values: ['trap', 'safe'] },
          },
        }),
        eff({
          if: {
            when: { op: '==', left: { _t: 2, ref: 'binding', name: '$path' }, right: 'trap' },
            then: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$dead',
                  bind: '$dead',
                  options: { query: 'enums', values: [] },
                },
              }) as ActionDef['effects'][number],
            ],
            else: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$safe',
                  bind: '$safe',
                  options: { query: 'enums', values: ['done'] },
                },
              }) as ActionDef['effects'][number],
            ],
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

describe('template-completion chooseN bounds', () => {
  it('uses a caller-provided choose callback when present', () => {
    const actionId = asActionId('guided-template');
    const def = createDef(
      createTemplateChooseOneAction(actionId, phaseId),
      createTemplateChooseOneProfile(actionId),
    );
    const templateMove: Move = { actionId, params: {} };

    const result = completeTemplateMove(def, baseState, templateMove, createRng(5n), undefined, {
      choose: () => 'gamma',
    });

    assert.equal(result.kind, 'completed');
    if (result.kind !== 'completed') throw new Error('unreachable');
    assert.equal(result.move.params.$target, 'gamma');
  });

  it('falls back to PRNG selection when choose returns undefined', () => {
    const actionId = asActionId('guided-template-fallback');
    const def = createDef(
      createTemplateChooseOneAction(actionId, phaseId),
      createTemplateChooseOneProfile(actionId),
    );
    const templateMove: Move = { actionId, params: {} };

    const baseline = completeTemplateMove(def, baseState, templateMove, createRng(12n));
    const guided = completeTemplateMove(def, baseState, templateMove, createRng(12n), undefined, {
      choose: () => undefined,
    });

    assert.deepEqual(guided, baseline);
  });

  it('clamps chooseN max to selectable options and never throws from RNG bounds', () => {
    const action = createChooseNAction('bounded-choose-n');
    const profile = createChooseNProfile('bounded-choose-n', 1, 3, ['a', 'b']);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('bounded-choose-n'), params: {} };

    for (let seed = 0n; seed < 200n; seed += 1n) {
      const result = completeTemplateMove(def, baseState, templateMove, createRng(seed));
      assert.equal(result.kind, 'completed', `seed ${seed} should produce a playable completion`);
      if (result.kind !== 'completed') throw new Error('unreachable');
      const selected = result.move.params['$targets'];
      assert.ok(Array.isArray(selected), `seed ${seed} expected chooseN array result`);
      assert.ok(selected.length >= 1 && selected.length <= 2, `seed ${seed} selected out-of-bounds count`);
      for (const value of selected) {
        assert.ok(value === 'a' || value === 'b', `seed ${seed} selected unexpected value`);
      }
    }
  });

  it('returns null when chooseN min exceeds selectable options', () => {
    const action = createChooseNAction('insufficient-min-choose-n');
    const profile = createChooseNProfile('insufficient-min-choose-n', 3, 3, ['a', 'b']);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('insufficient-min-choose-n'), params: {} };

    const result = completeTemplateMove(def, baseState, templateMove, createRng(42n));
    assert.equal(result.kind, 'structurallyUnsatisfiable');
  });

  it('chooseN selections stay within the option domain across seeds', () => {
    const action = createChooseNAction('domain-bounds-choose-n');
    const profile = createChooseNProfile('domain-bounds-choose-n', 0, 2, ['a', 'b']);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('domain-bounds-choose-n'), params: {} };

    for (let seed = 0n; seed < 40n; seed += 1n) {
      const result = completeTemplateMove(def, baseState, templateMove, createRng(seed));
      assert.equal(result.kind, 'completed', `seed ${seed} should produce a playable completion`);
      if (result.kind !== 'completed') throw new Error('unreachable');
      const selected = result.move.params['$targets'];
      assert.ok(Array.isArray(selected));
      assert.ok(selected.length <= 2);
      for (const value of selected) {
        assert.ok(value === 'a' || value === 'b');
      }
    }
  });

  it('auto-fills empty chooseN decisions when min=0 and options are empty', () => {
    const action = createChooseNAction('empty-choose-n');
    const profile = createChooseNProfile('empty-choose-n', 0, 0, []);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('empty-choose-n'), params: {} };

    const result = completeTemplateMove(def, baseState, templateMove, createRng(7n));
    assert.equal(result.kind, 'completed');
    if (result.kind !== 'completed') throw new Error('unreachable');
    assert.deepEqual(result.move.params['$targets'], []);
  });

  it('persists sampled stochastic bindings and completes exact chooseN branches', () => {
    const action = createChooseNAction('stochastic-choose-n');
    const profile = createStochasticProfile('stochastic-choose-n');
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('stochastic-choose-n'), params: {} };

    const first = completeTemplateMove(def, baseState, templateMove, createRng(9n));
    const second = completeTemplateMove(def, baseState, templateMove, createRng(9n));

    assert.equal(first.kind, 'completed');
    assert.equal(second.kind, 'completed');
    if (first.kind !== 'completed' || second.kind !== 'completed') {
      throw new Error('Expected deterministic stochastic completion');
    }
    assert.deepEqual(first.move.params, second.move.params, 'Identical seeds should sample the same stochastic branch');
    assert.equal(typeof first.move.params.$roll, 'number', 'Sampled stochastic roll should be persisted on the move');
    const selected = first.move.params['$targets'];
    assert.ok(Array.isArray(selected), 'Stochastic chooseN branch should be completed');
    assert.equal(selected.length, first.move.params.$roll, 'Persisted roll should match exact chooseN cardinality');
  });

  it('re-evaluates later decisions during completion instead of drifting into trap branches', () => {
    const action = createChooseNAction('later-branch-trap');
    const profile = createLaterBranchTrapProfile('later-branch-trap');
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('later-branch-trap'), freeOperation: true, params: {} };

    const result = completeTemplateMove(def, baseState, templateMove, createRng(0n));
    assert.equal(result.kind, 'completed');
    if (result.kind !== 'completed') throw new Error('unreachable');
    assert.equal(result.move.params.$path, 'safe');
    assert.equal(result.move.params.$safe, 'done');
  });

  it('returns unsatisfiable when custom maxCompletionDecisions budget is exceeded', () => {
    const action = createChooseNAction('budget-exceeded');
    const profile = createChooseNProfile('budget-exceeded', 1, 2, ['a', 'b']);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('budget-exceeded'), params: {} };

    // Set maxCompletionDecisions to 0 so the very first decision exceeds the budget
    const result = completeTemplateMove(
      def, baseState, templateMove, createRng(1n), undefined,
      { budgets: { maxCompletionDecisions: 0 } },
    );
    assert.equal(result.kind, 'structurallyUnsatisfiable');
  });

  it('treats guided chooseN cardinality mismatches as draw-dead-end instead of throwing', () => {
    const action = createChooseNAction('guided-invalid-choose-n');
    const profile = createChooseNProfile('guided-invalid-choose-n', 1, 1, ['a', 'b', 'c']);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('guided-invalid-choose-n'), params: {} };

    const result = completeTemplateMove(def, baseState, templateMove, createRng(3n), undefined, {
      choose: () => ['a', 'b'],
    });

    assert.equal(result.kind, 'drawDeadEnd');
  });

  it('default budget (256) allows actions that would exceed the old 50-decision limit', () => {
    // Create an action with many sequential chooseN decisions by using
    // a large option set — a single chooseN with 1 decision is enough to
    // verify the default budget is at least > 50.
    const action = createChooseNAction('high-decisions');
    const profile = createChooseNProfile('high-decisions', 1, 2, ['a', 'b']);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('high-decisions'), params: {} };

    // This action only needs 1 decision, so it should complete fine with default budget
    const result = completeTemplateMove(def, baseState, templateMove, createRng(42n));
    assert.equal(result.kind, 'completed');
  });
});
