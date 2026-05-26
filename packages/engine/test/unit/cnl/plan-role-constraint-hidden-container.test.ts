// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef } from '../../../src/cnl/index.js';
import {
  compoundWitnessZoneSelector,
  createAgentPlanCompoundWitnessDoc,
  validCompoundPlanTemplate,
} from '../../architecture/fixtures/agent-plan-compound-witness-fixture.js';

describe('plan role constraint hidden container validation', () => {
  it('rejects locatedIn constraints that use an observer-restricted container role', () => {
    const doc = createAgentPlanCompoundWitnessDoc({
      trainGovern: validCompoundPlanTemplate({
        roles: {
          containerSpace: { selector: 'containerSpace', required: true },
          trainSpace: {
            selector: 'trainSpace',
            required: true,
            constraints: [{ locatedIn: { role: 'role.trainSpace', container: 'role.containerSpace' } }],
          },
        },
      }),
    }, {
      containerSpace: compoundWitnessZoneSelector(),
      trainSpace: compoundWitnessZoneSelector(),
    });
    const docWithHiddenZone = {
      ...doc,
      zones: [
        { id: 'public-zone', owner: 'none', visibility: 'public', ordering: 'set' },
        { id: 'hidden-zone', owner: 'none', visibility: 'hidden', ordering: 'set' },
      ],
    };

    const result = compileGameSpecToGameDef(docWithHiddenZone);
    const diagnostic = result.diagnostics.find(
      (entry) => entry.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_LOCATED_IN_HIDDEN_CONTAINER,
    );

    assert.ok(
      diagnostic,
      result.diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('\n'),
    );
    assert.match(diagnostic.message, /observer-restricted container role "containerSpace"/u);
  });
});
