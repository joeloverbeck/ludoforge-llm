// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  asActionId,
  asPhaseId,
  createGameDefRuntime,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGameSteps, type RunGameInput, type RunGameStep } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { firstLegalAgent } from '../helpers/test-agents.js';

const TERMINAL_STEP_KINDS = new Set<RunGameStep['kind']>(['terminal', 'maxTurns', 'noLegalMoves']);

const collectSteps = (input: RunGameInput): readonly RunGameStep[] => [...runGameSteps(input)];

const createSyntheticDef = (): ValidatedGameDef =>
  assertValidatedGameDef({
    metadata: { id: 'run-game-steps-protocol-synthetic', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('score'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [{ when: { op: '>=', left: { _t: 2 as const, ref: 'gvar', var: 'score' }, right: 2 }, result: { type: 'draw' } }],
    },
  });

const createFitlDef = (): ValidatedGameDef => {
  const compiled = compileProductionSpec();
  assertNoErrors(compiled.parsed);
  assertNoErrors(compiled.compiled);
  return assertValidatedGameDef(compiled.compiled.gameDef);
};

const assertSingleTrailingTerminalStep = (label: string, steps: readonly RunGameStep[]): void => {
  assert.notEqual(steps.length, 0, `${label}: runGameSteps must yield at least one step`);

  const terminalIndexes = steps
    .map((step, index) => (TERMINAL_STEP_KINDS.has(step.kind) ? index : -1))
    .filter((index) => index >= 0);

  assert.deepEqual(terminalIndexes, [steps.length - 1], `${label}: terminal step must be unique and last`);
};

describe('runGameSteps protocol', () => {
  it('emits exactly one trailing terminal step for a synthetic game', () => {
    const def = createSyntheticDef();
    const steps = collectSteps({
      def,
      seed: 152004,
      agents: [firstLegalAgent, firstLegalAgent],
      maxTurns: 5,
      runtime: createGameDefRuntime(def),
    });

    assertSingleTrailingTerminalStep('synthetic terminal run', steps);
    assert.equal(steps.at(-1)?.kind, 'terminal');
  });

  it('emits exactly one trailing terminal step for a FITL representative run', () => {
    const def = createFitlDef();
    const steps = collectSteps({
      def,
      seed: 1005,
      agents: [firstLegalAgent, firstLegalAgent, firstLegalAgent, firstLegalAgent],
      maxTurns: 0,
      playerCount: 4,
      options: { skipDeltas: true },
      runtime: createGameDefRuntime(def),
    });

    assertSingleTrailingTerminalStep('FITL representative run', steps);
    assert.equal(steps.at(-1)?.kind, 'maxTurns');
  });
});
