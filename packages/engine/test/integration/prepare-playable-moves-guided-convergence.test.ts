// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { preparePlayableMoves } from '../../src/agents/prepare-playable-moves.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createRng,
  enumerateLegalMoves,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
} from '../../src/kernel/index.js';
import { eff } from '../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

const createAction = (): ActionDef => ({
  id: asActionId('guided-op'),
  actor: 'active',
  executor: 'actor',
  phase: [phaseId],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const createProfile = (): ActionPipelineDef => ({
  id: 'profile-guided-op',
  actionId: asActionId('guided-op'),
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
            options: { query: 'enums', values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
            min: 2,
            max: 2,
          },
        }),
        eff({
          if: {
            when: {
              op: 'and',
              args: [
                { op: 'in', item: 'a', set: { _t: 2, ref: 'binding', name: '$targets' } },
                { op: 'in', item: 'b', set: { _t: 2, ref: 'binding', name: '$targets' } },
              ],
            },
            then: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$done',
                  bind: '$done',
                  options: { query: 'enums', values: ['done'] },
                },
              }) as ActionDef['effects'][number],
            ],
            else: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$dead',
                  bind: '$dead',
                  options: { query: 'enums', values: [] },
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

const createDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'guided-convergence-multi-pick', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [createAction()],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [createProfile()],
});

describe('preparePlayableMoves guided convergence', () => {
  it('finds a bounded witness where guided multi-pick completion succeeds after unguided completion misses', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const legalMoves = enumerateLegalMoves(def, state).moves;
    assert.equal(legalMoves.length, 1);

    let witness:
      | {
          readonly seed: number;
          readonly legacyAttempts: number;
          readonly guidedAttempts: number;
          readonly guidedTargets: readonly string[];
        }
      | undefined;

    for (let seed = 0; seed < 200; seed += 1) {
      const legacy = preparePlayableMoves(
        { def, state, legalMoves, rng: createRng(BigInt(seed)) },
        { pendingTemplateCompletions: 1, disableGuidedChooser: true },
      );
      const guided = preparePlayableMoves(
        { def, state, legalMoves, rng: createRng(BigInt(seed)) },
        { pendingTemplateCompletions: 1 },
      );
      const legacyPlayable = legacy.completedMoves.length + legacy.stochasticMoves.length;
      const guidedPlayable = guided.completedMoves.length + guided.stochasticMoves.length;
      if (legacyPlayable === 0 && guidedPlayable > 0) {
        const guidedTargets = guided.completedMoves[0]?.move.params.$targets as readonly string[] | undefined;
        if (guidedTargets === undefined) {
          throw new Error(`expected guided witness to produce bound targets for seed ${seed}`);
        }
        witness = {
          seed,
          legacyAttempts: legacy.statistics.templateCompletionAttempts,
          guidedAttempts: guided.statistics.templateCompletionAttempts,
          guidedTargets,
        };
        break;
      }
    }

    assert.ok(witness, 'expected at least one deterministic seed where guidance rescues a multi-pick completion');
    assert.deepEqual(witness?.guidedTargets, ['a', 'b']);
    assert.equal(witness?.legacyAttempts, 1 + 7);
    assert.equal(witness?.guidedAttempts, 2);
  });
});
