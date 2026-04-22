// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  asActionId,
  asPhaseId,
  initialState,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { firstLegalAgent } from '../helpers/test-agents.js';

const createLoopingLifecycleDef = (): ValidatedGameDef =>
  assertValidatedGameDef({
    metadata: { id: 'compiled-effects-verification', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [
        {
          id: asPhaseId('main'),
          onEnter: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        },
      ],
    },
    actions: [
      {
        id: asActionId('step'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        limits: [{ id: 'step::turn::0', scope: 'turn', max: 1 }],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  } as const);

describe('compiled effect verification integration', () => {
  it('covers initialState and move progression with verification enabled', () => {
    const def = createLoopingLifecycleDef();

    const initial = initialState(def, 17, 2, { verifyCompiledEffects: true }).state;
    assert.equal(initial.globalVars.score, 1);

    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 3, 2, {
      kernel: { verifyCompiledEffects: true },
    });
    assert.equal(trace.decisions.length, 3);
    const finalScore = trace.finalState.globalVars.score;
    assert.ok(typeof finalScore === 'number');
    assert.ok(finalScore >= 4);
  });

  it('runs a short Texas Holdem simulation with verification enabled', () => {
    const texasDef = compileTexasProductionSpec().compiled.gameDef as ValidatedGameDef;

    const trace = runGame(texasDef, 41, [
      new PolicyAgent({ traceLevel: 'summary' }),
      new PolicyAgent({ traceLevel: 'summary' }),
    ], 6, 2, {
      kernel: { verifyCompiledEffects: true },
    });

    assert.ok(trace.decisions.length > 0);
  });
});
