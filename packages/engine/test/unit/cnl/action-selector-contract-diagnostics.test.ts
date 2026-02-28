import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES } from '../../../src/cnl/action-selector-diagnostic-codes.js';
import { buildActionSelectorContractViolationDiagnostic } from '../../../src/cnl/action-selector-contract-diagnostics.js';

describe('action selector contract diagnostics', () => {
  it('builds compile-lowering diagnostics through the CNL renderer', () => {
    const malformed = buildActionSelectorContractViolationDiagnostic({
      violation: { role: 'actor', kind: 'bindingMalformed', binding: 'owner' },
      path: 'doc.actions.0.actor',
      actionId: 'assign',
      surface: 'compileLowering',
    });
    assert.notEqual(malformed, null);
    assert.equal(malformed?.code, ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.actor.bindingMalformed);
    assert.equal(malformed?.message, 'Action actor binding "owner" must be a canonical "$name" token.');

    const undeclared = buildActionSelectorContractViolationDiagnostic({
      violation: { role: 'executor', kind: 'bindingNotDeclared', binding: '$owner' },
      path: 'doc.actions.0.executor',
      actionId: 'assign',
      surface: 'compileLowering',
    });
    assert.notEqual(undeclared, null);
    assert.equal(undeclared?.code, ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.executor.bindingNotDeclared);
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
    assert.equal(malformed?.code, ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.actor.bindingMalformed);
    assert.equal(malformed?.message, 'Action "assign" uses malformed actor binding "owner".');

    const unsupported = buildActionSelectorContractViolationDiagnostic({
      violation: { role: 'executor', kind: 'bindingWithPipelineUnsupported', binding: '$owner' },
      path: 'doc.actions.0.executor',
      actionId: 'assign',
      surface: 'crossValidate',
    });
    assert.notEqual(unsupported, null);
    assert.equal(unsupported?.code, ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.executor.bindingWithPipelineUnsupported);
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
