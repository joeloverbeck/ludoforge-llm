// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef } from '../../../src/cnl/index.js';
import {
  createAgentPlanCompoundWitnessDoc,
  defaultCompoundWitnessSelectors,
  validCompoundPlanTemplate,
} from '../../architecture/fixtures/agent-plan-compound-witness-fixture.js';

function compileTemplate() {
  const doc = createAgentPlanCompoundWitnessDoc({
    trainGovern: validCompoundPlanTemplate({
      roles: {
        trainSpace: { selector: 'trainSpace', required: true },
        governSpace: {
          selector: 'governSpace',
          required: true,
          constraints: [
            { notEqual: 'role.trainSpace' },
            { locatedIn: { role: 'role.trainSpace', container: 'zone.zone-a' } },
            { distinctOriginDestination: { origin: 'role.trainSpace', destination: 'role.trainSpace' } },
            { reachable: { from: 'role.trainSpace', to: 'role.trainSpace', via: 'routeClass.land', maxHops: 2 } },
            { adjacent: { a: 'role.trainSpace', b: 'role.trainSpace' } },
            {
              postState: {
                step: 'select-govern-space',
                role: 'role.governSpace',
                maxSteps: 2,
                predicate: { roleLocatedIn: { role: 'role.governSpace', container: 'zone.zone-b' } },
              },
            },
          ],
        },
      },
    }),
  }, defaultCompoundWitnessSelectors());
  return compileGameSpecToGameDef({
    ...doc,
    dataAssets: [
      ...(doc.dataAssets ?? []),
      {
        id: 'test-route-graph',
        kind: 'routeGraph',
        payload: {
          routeClasses: [{ id: 'land' }],
          edges: [{ from: 'zone-a', to: 'zone-b', classes: ['land'] }],
          defaultMaxHops: 2,
        },
      },
    ],
  });
}

describe('plan role constraint lowering', () => {
  it('lowers every registered constraint kind to the compiled payload shape', () => {
    const result = compileTemplate();

    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
      [],
      result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join('\n'),
    );
    assert.deepEqual(result.gameDef?.agents?.library.planTemplates?.trainGovern?.roles.governSpace?.constraints, [
      { kind: 'notEqual', role: 'trainSpace' },
      { kind: 'locatedIn', role: 'trainSpace', container: 'zone-a' },
      { kind: 'distinctOriginDestination', origin: 'trainSpace', destination: 'trainSpace' },
      { kind: 'reachable', from: 'trainSpace', to: 'trainSpace', via: 'land', maxHops: 2 },
      { kind: 'adjacent', a: 'trainSpace', b: 'trainSpace' },
      {
        kind: 'postState',
        step: 'select-govern-space',
        role: 'governSpace',
        maxSteps: 2,
        predicate: { kind: 'roleLocatedIn', role: 'governSpace', container: 'zone-b' },
      },
    ]);
  });

  it('compiles the same authored constraints byte-identically across runs', () => {
    const first = compileTemplate();
    const second = compileTemplate();

    assert.equal(JSON.stringify(first.gameDef), JSON.stringify(second.gameDef));
  });
});
