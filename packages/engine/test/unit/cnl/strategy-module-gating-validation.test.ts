// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef } from '../../../src/cnl/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';
import {
  createAgentPlanCompoundWitnessDoc,
  validCompoundPlanTemplate,
} from '../../architecture/fixtures/agent-plan-compound-witness-fixture.js';

function createDoc(strategyModule: Record<string, unknown>): GameSpecDoc {
  const base = createAgentPlanCompoundWitnessDoc({
    alphaPlan: validCompoundPlanTemplate({ traceLabel: 'alpha-plan' }),
    betaPlan: validCompoundPlanTemplate({ traceLabel: 'beta-plan' }),
  });
  const baseline = base.agents!.profiles!.baseline!;
  return {
    ...base,
    agents: {
      ...base.agents!,
      library: {
        ...base.agents!.library,
        strategyModules: {
          doctrine: validModule(strategyModule),
        },
      },
      profiles: {
        baseline: {
          ...baseline,
          use: {
            ...baseline.use,
            planTemplates: ['alphaPlan', 'betaPlan'],
            strategyModules: ['doctrine'],
          },
        },
      },
    },
  };
}

function validModule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    traceLabel: 'doctrine',
    when: true,
    applies: { scopes: ['move'] },
    priority: { tier: 10 },
    selectors: [{ role: 'primaryTarget', selectorId: 'trainSpace' }],
    scoreGroups: [{ id: 'targetQuality', summary: 'sum', terms: [{ id: 'constant', value: 1, weight: 1 }] }],
    guardrailIds: [],
    fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'noContribution' },
    ...overrides,
  };
}

function compileErrors(doc: GameSpecDoc) {
  return compileGameSpecToGameDef(doc).diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
}

describe('strategy module plan-template gating validation', () => {
  it('rejects unknown enabled and suppressed plan-template ids with module-named diagnostics', () => {
    const enabledErrors = compileErrors(createDoc({ enablesPlanTemplates: ['missingPlan'] }));
    assert.equal(
      enabledErrors.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN
        && diagnostic.path === 'doc.agents.library.strategyModules.doctrine.enablesPlanTemplates.0'
        && diagnostic.message.includes('Strategy module "doctrine" enablesPlanTemplates references unknown plan template "missingPlan"')
      ),
      true,
      `expected unknown enablesPlanTemplates diagnostic; got ${enabledErrors.map((diagnostic) => diagnostic.message).join('\n')}`,
    );

    const suppressedErrors = compileErrors(createDoc({ suppressesPlanTemplates: ['missingPlan'] }));
    assert.equal(
      suppressedErrors.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN
        && diagnostic.path === 'doc.agents.library.strategyModules.doctrine.suppressesPlanTemplates.0'
        && diagnostic.message.includes('Strategy module "doctrine" suppressesPlanTemplates references unknown plan template "missingPlan"')
      ),
      true,
      `expected unknown suppressesPlanTemplates diagnostic; got ${suppressedErrors.map((diagnostic) => diagnostic.message).join('\n')}`,
    );
  });

  it('rejects contradictory and degenerate module-local gating declarations', () => {
    const contradictoryErrors = compileErrors(createDoc({
      enablesPlanTemplates: ['alphaPlan', 'betaPlan'],
      suppressesPlanTemplates: ['betaPlan'],
    }));
    assert.equal(
      contradictoryErrors.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN
        && diagnostic.message.includes('Strategy module "doctrine" declares plan template "betaPlan" in both')
      ),
      true,
      `expected contradictory gating diagnostic; got ${contradictoryErrors.map((diagnostic) => diagnostic.message).join('\n')}`,
    );

    const degenerateErrors = compileErrors(createDoc({
      enablesPlanTemplates: ['alphaPlan'],
      suppressesPlanTemplates: ['alphaPlan'],
    }));
    assert.equal(
      degenerateErrors.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN
        && diagnostic.message.includes('Strategy module "doctrine" plan-template gating has a degenerate empty effect')
      ),
      true,
      `expected degenerate gating diagnostic; got ${degenerateErrors.map((diagnostic) => diagnostic.message).join('\n')}`,
    );
  });

  it('normalizes populated and absent gating fields into compiled strategy-module IR arrays', () => {
    const populated = compileGameSpecToGameDef(createDoc({
      enablesPlanTemplates: ['alphaPlan'],
      suppressesPlanTemplates: ['betaPlan'],
    }));
    assert.deepEqual(populated.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.deepEqual(
      populated.gameDef?.agents?.library.strategyModules?.doctrine?.enablesPlanTemplates,
      ['alphaPlan'],
    );
    assert.deepEqual(
      populated.gameDef?.agents?.library.strategyModules?.doctrine?.suppressesPlanTemplates,
      ['betaPlan'],
    );
    const defaults = compileGameSpecToGameDef(createDoc({}));
    assert.deepEqual(defaults.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.deepEqual(defaults.gameDef?.agents?.library.strategyModules?.doctrine?.enablesPlanTemplates, []);
    assert.deepEqual(defaults.gameDef?.agents?.library.strategyModules?.doctrine?.suppressesPlanTemplates, []);
  });
});
