import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { CNL_XREF_DIAGNOSTIC_CODES } from '../../../src/cnl/cross-validate-diagnostic-codes.js';
import { buildActionSelectorContractViolationDiagnostic } from '../../../src/cnl/action-selector-contract-diagnostics.js';

describe('action selector contract diagnostics', () => {
  it('uses canonical compiler/xref registries for all supported selector role/kind code mappings', () => {
    const cases = [
      {
        violation: { role: 'actor', kind: 'bindingMalformed', binding: 'owner' } as const,
        expectedCode: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_ACTOR_BINDING_INVALID,
      },
      {
        violation: { role: 'actor', kind: 'bindingNotDeclared', binding: '$owner' } as const,
        expectedCode: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING,
      },
      {
        violation: { role: 'executor', kind: 'bindingMalformed', binding: 'owner' } as const,
        expectedCode: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_EXECUTOR_BINDING_INVALID,
      },
      {
        violation: { role: 'executor', kind: 'bindingNotDeclared', binding: '$owner' } as const,
        expectedCode: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING,
      },
      {
        violation: { role: 'executor', kind: 'bindingWithPipelineUnsupported', binding: '$owner' } as const,
        expectedCode: CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED,
      },
    ];

    for (const testCase of cases) {
      const diagnostic = buildActionSelectorContractViolationDiagnostic({
        violation: testCase.violation,
        path: `doc.actions.0.${testCase.violation.role}`,
        actionId: 'assign',
        surface: 'crossValidate',
      });
      assert.equal(diagnostic.code, testCase.expectedCode);
    }
  });

  it('builds compile-lowering diagnostics through the CNL renderer', () => {
    const malformed = buildActionSelectorContractViolationDiagnostic({
      violation: { role: 'actor', kind: 'bindingMalformed', binding: 'owner' },
      path: 'doc.actions.0.actor',
      actionId: 'assign',
      surface: 'compileLowering',
    });
    assert.notEqual(malformed, null);
    assert.equal(malformed?.code, CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_ACTOR_BINDING_INVALID);
    assert.equal(malformed?.message, 'Action actor binding "owner" must be a canonical "$name" token.');

    const undeclared = buildActionSelectorContractViolationDiagnostic({
      violation: { role: 'executor', kind: 'bindingNotDeclared', binding: '$owner' },
      path: 'doc.actions.0.executor',
      actionId: 'assign',
      surface: 'compileLowering',
    });
    assert.notEqual(undeclared, null);
    assert.equal(undeclared?.code, CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING);
    assert.equal(undeclared?.message, 'Action executor binding "$owner" is not declared in action params.');
  });

  it('builds cross-validate diagnostics through the CNL renderer', () => {
    const malformed = buildActionSelectorContractViolationDiagnostic({
      violation: { role: 'actor', kind: 'bindingMalformed', binding: 'owner' },
      path: 'doc.actions.0.actor',
      actionId: 'assign',
      surface: 'crossValidate',
    });
    assert.notEqual(malformed, null);
    assert.equal(malformed?.code, CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_ACTOR_BINDING_INVALID);
    assert.equal(malformed?.message, 'Action "assign" uses malformed actor binding "owner".');

    const unsupported = buildActionSelectorContractViolationDiagnostic({
      violation: { role: 'executor', kind: 'bindingWithPipelineUnsupported', binding: '$owner' },
      path: 'doc.actions.0.executor',
      actionId: 'assign',
      surface: 'crossValidate',
    });
    assert.notEqual(unsupported, null);
    assert.equal(unsupported?.code, CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED);
    assert.equal(unsupported?.message, 'Action "assign" uses binding-derived executor "$owner" with action pipelines.');
  });

  it('fails fast when a role/kind combination is unsupported', () => {
    assert.throws(
      () =>
        buildActionSelectorContractViolationDiagnostic({
          violation: { role: 'actor', kind: 'bindingWithPipelineUnsupported', binding: '$owner' },
          path: 'doc.actions.0.actor',
          actionId: 'assign',
          surface: 'crossValidate',
        }),
      /Unsupported action selector contract violation/,
    );
  });
});
