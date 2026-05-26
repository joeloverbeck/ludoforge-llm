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

function createDoc(planTemplates: Record<string, unknown>, selectors = defaultCompoundWitnessSelectors()): GameSpecDoc {
  return createAgentPlanCompoundWitnessDoc(planTemplates, selectors);
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
          ],
        },
      }),
    }));
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

  it('rejects role-precedence violations for every multi-role constraint kind', () => {
    for (const constraint of [
      { distinctOriginDestination: { origin: 'role.futureSpace', destination: 'role.trainSpace' } },
      { reachable: { from: 'role.trainSpace', to: 'role.futureSpace' } },
      { adjacent: { a: 'role.trainSpace', b: 'role.futureSpace' } },
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
});
