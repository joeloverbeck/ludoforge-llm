// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef } from '../../../src/cnl/index.js';
import {
  createAgentPlanCompoundWitnessDoc,
  defaultCompoundWitnessSelectors,
  validCompoundPlanTemplate,
} from '../../architecture/fixtures/agent-plan-compound-witness-fixture.js';
import type { CnlCompilerDiagnosticCode } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(
  planTemplates: Record<string, unknown>,
  selectors = defaultCompoundWitnessSelectors(),
  options: { readonly includeRouteGraph?: boolean } = {},
): GameSpecDoc {
  const doc = createAgentPlanCompoundWitnessDoc(planTemplates, selectors);
  if (options.includeRouteGraph === true) {
    return {
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
    };
  }
  return doc;
}

function templateWithRoles(roles: Record<string, unknown>): any {
  return validCompoundPlanTemplate({ roles });
}

function assertNoCompileErrors(doc: GameSpecDoc): ReturnType<typeof compileGameSpecToGameDef> {
  const result = compileGameSpecToGameDef(doc);
  assert.deepEqual(
    result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    [],
    result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join('\n'),
  );
  return result;
}

function assertCode(doc: GameSpecDoc, code: CnlCompilerDiagnosticCode, messageMatch?: RegExp): void {
  const result = compileGameSpecToGameDef(doc);
  const diagnostic = result.diagnostics.find((entry) => entry.code === code);
  assert.ok(
    diagnostic,
    `expected ${code}; got ${result.diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('\n')}`,
  );
  if (messageMatch !== undefined) {
    assert.match(diagnostic.message, messageMatch);
  }
}

describe('plan role constraint validation', () => {
  it('accepts every registered role-constraint kind with valid payload shapes', () => {
    assertNoCompileErrors(createDoc({
      trainGovern: templateWithRoles({
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
      }),
    }, defaultCompoundWitnessSelectors(), { includeRouteGraph: true }));
  });

  it('rejects unsupported constraint kinds through the registry diagnostic', () => {
    assertCode(
      createDoc({
        trainGovern: templateWithRoles({
          trainSpace: { selector: 'trainSpace', required: true },
          governSpace: {
            selector: 'governSpace',
            required: true,
            constraints: [{ unknownKind: 'role.trainSpace' }],
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_UNSUPPORTED,
      /unknownKind/u,
    );
  });

  it('rejects reachable constraints with non-positive maxHops', () => {
    assertCode(
      createDoc({
        trainGovern: templateWithRoles({
          trainSpace: { selector: 'trainSpace', required: true },
          governSpace: {
            selector: 'governSpace',
            required: true,
            constraints: [{ reachable: { from: 'role.trainSpace', to: 'role.trainSpace', maxHops: 0 } }],
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_INVALID,
      /maxHops must be a positive integer/u,
    );
  });

  it('rejects locatedIn constraints without a container reference', () => {
    assertCode(
      createDoc({
        trainGovern: templateWithRoles({
          trainSpace: { selector: 'trainSpace', required: true },
          governSpace: {
            selector: 'governSpace',
            required: true,
            constraints: [{ locatedIn: { role: 'role.trainSpace' } }],
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_INVALID,
      /locatedIn requires a container reference/u,
    );
  });

  it('rejects malformed and unresolved postState metadata', () => {
    assertCode(
      createDoc({
        trainGovern: templateWithRoles({
          trainSpace: { selector: 'trainSpace', required: true },
          governSpace: {
            selector: 'governSpace',
            required: true,
            constraints: [{
              postState: {
                step: 'missing-step',
                role: 'role.governSpace',
                maxSteps: 0,
                predicate: { roleLocatedIn: { role: 'role.governSpace', container: 'zone.zone-b' } },
              },
            }],
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_INVALID,
      /maxSteps must be a positive integer/u,
    );
    assertCode(
      createDoc({
        trainGovern: templateWithRoles({
          trainSpace: { selector: 'trainSpace', required: true },
          governSpace: {
            selector: 'governSpace',
            required: true,
            constraints: [{
              postState: {
                step: 'missing-step',
                role: 'role.governSpace',
                maxSteps: 2,
                predicate: { roleLocatedIn: { role: 'role.governSpace', container: 'zone.zone-b' } },
              },
            }],
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_REF_UNKNOWN,
      /unknown step "missing-step"/u,
    );
  });

  it('accepts constraints that reference the current role candidate', () => {
    assertNoCompileErrors(createDoc({
      trainGovern: templateWithRoles({
        trainSpace: { selector: 'trainSpace', required: true },
        governSpace: {
          selector: 'governSpace',
          required: true,
          constraints: [
            { reachable: { from: 'role.trainSpace', to: 'role.governSpace', via: 'routeClass.land' } },
            { distinctOriginDestination: { origin: 'role.trainSpace', destination: 'role.governSpace' } },
            { locatedIn: { role: 'role.governSpace', container: 'zone.zone-b' } },
            { adjacent: { a: 'role.trainSpace', b: 'role.governSpace' } },
          ],
        },
      }),
    }, defaultCompoundWitnessSelectors(), { includeRouteGraph: true }));
  });

  it('rejects role-precedence violations for every multi-role constraint kind', () => {
    for (const constraint of [
      { distinctOriginDestination: { origin: 'role.futureSpace', destination: 'role.trainSpace' } },
      { reachable: { from: 'role.trainSpace', to: 'role.futureSpace' } },
      { adjacent: { a: 'role.trainSpace', b: 'role.futureSpace' } },
      {
        postState: {
          step: 'select-govern-space',
          role: 'role.governSpace',
          maxSteps: 2,
          predicate: { roleLocatedIn: { role: 'role.futureSpace', container: 'zone.zone-b' } },
        },
      },
    ]) {
      assertCode(
        createDoc({
          trainGovern: templateWithRoles({
            trainSpace: { selector: 'trainSpace', required: true },
            governSpace: {
              selector: 'governSpace',
              required: true,
              constraints: [constraint],
            },
            futureSpace: { selector: 'governSpace', required: true },
          }),
        }),
        CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND,
        /futureSpace.*not bound/u,
      );
    }
  });

  it('rejects constraints that reference undeclared roles', () => {
    assertCode(
      createDoc({
        trainGovern: templateWithRoles({
          trainSpace: { selector: 'trainSpace', required: true },
          governSpace: {
            selector: 'governSpace',
            required: true,
            constraints: [{ reachable: { from: 'role.trainSpace', to: 'role.missingSpace' } }],
          },
        }),
      }, defaultCompoundWitnessSelectors(), { includeRouteGraph: true }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND,
      /missingSpace.*not bound/u,
    );
  });
});
