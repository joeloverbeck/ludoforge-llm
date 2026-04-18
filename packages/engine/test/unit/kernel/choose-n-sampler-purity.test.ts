// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { completeTemplateMove } from '../../../src/kernel/move-completion.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createRng,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

const createAction = (id: string): ActionDef => ({
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
            options: { query: 'enums', values: [...values] },
            min,
            max,
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

const createDef = (
  actionId: string,
  profile: ActionPipelineDef,
): GameDef => assertValidatedGameDef({
  metadata: { id: `choose-n-sampler-purity-${actionId}`, players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [createAction(actionId)],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [profile],
});

const sampleCounts = (
  def: GameDef,
  actionId: string,
  seedCount: bigint,
): number[] => {
  const state = initialState(def, 1, 2).state;
  const templateMove: Move = { actionId: asActionId(actionId), params: {} };
  const counts: number[] = [];

  for (let seed = 0n; seed < seedCount; seed += 1n) {
    const result = completeTemplateMove(def, state, templateMove, createRng(seed));
    assert.equal(result.kind, 'completed');
    if (result.kind !== 'completed') {
      assert.fail(`expected completed result for seed ${seed}`);
    }
    assert.ok(Array.isArray(result.move.params.$targets));
    counts.push(result.move.params.$targets.length);
  }

  return counts;
};

describe('chooseN sampler purity', () => {
  it('samples the full declared [0, max] range for optional chooseN bindings', () => {
    const actionId = 'optional-choose-n-purity';
    const def = createDef(
      actionId,
      createChooseNProfile(actionId, 0, 4, ['a', 'b', 'c', 'd', 'e']),
    );

    const counts = sampleCounts(def, actionId, 128n);
    const uniqueCounts = new Set(counts);

    assert.equal(uniqueCounts.has(0), true, 'expected at least one zero-count sample');
    assert.equal(uniqueCounts.has(4), true, 'expected at least one max-count sample');
    assert.deepEqual([...uniqueCounts].sort((left, right) => left - right), [0, 1, 2, 3, 4]);
  });

  it('respects declared minimum 1 without sampling zero', () => {
    const actionId = 'min-one-choose-n-purity';
    const def = createDef(
      actionId,
      createChooseNProfile(actionId, 1, 3, ['a', 'b', 'c', 'd']),
    );

    const counts = sampleCounts(def, actionId, 64n);

    assert.equal(counts.every((count) => count >= 1 && count <= 3), true);
    assert.equal(counts.includes(0), false);
  });

  it('respects declared minimums above one', () => {
    const actionId = 'min-two-choose-n-purity';
    const def = createDef(
      actionId,
      createChooseNProfile(actionId, 2, 4, ['a', 'b', 'c', 'd', 'e']),
    );

    const counts = sampleCounts(def, actionId, 64n);

    assert.equal(counts.every((count) => count >= 2 && count <= 4), true);
    assert.equal(counts.includes(0), false);
    assert.equal(counts.includes(1), false);
  });
});
