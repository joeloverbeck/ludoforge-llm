import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateActionSelectorContracts,
  getActionSelectorContract,
} from '../../../src/kernel/action-selector-contract-registry.js';
import { asPlayerId } from '../../../src/kernel/branded.js';

describe('action selector contract registry', () => {
  it('reports missing declared selector bindings in deterministic role order', () => {
    const violations = evaluateActionSelectorContracts({
      selectors: {
        actor: { chosen: '$actorOwner' },
        executor: { chosen: '$execOwner' },
      },
      declaredBindings: [],
      hasPipeline: false,
      enforcePipelineBindingCompatibility: false,
    });

    assert.deepEqual(violations, [
      { role: 'actor', kind: 'bindingNotDeclared', binding: '$actorOwner' },
      { role: 'executor', kind: 'bindingNotDeclared', binding: '$execOwner' },
    ]);
  });

  it('reports binding-derived pipelined executor incompatibility', () => {
    const violations = evaluateActionSelectorContracts({
      selectors: {
        actor: 'active',
        executor: { chosen: '$owner' },
      },
      declaredBindings: ['$owner'],
      hasPipeline: true,
      enforceBindingDeclaration: false,
    });

    assert.deepEqual(violations, [{ role: 'executor', kind: 'bindingWithPipelineUnsupported', binding: '$owner' }]);
    assert.equal(
      getActionSelectorContract('executor').bindingWithPipelineUnsupportedDiagnosticCode,
      'CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED',
    );
  });

  it('respects enforcement toggles', () => {
    const violations = evaluateActionSelectorContracts({
      selectors: {
        actor: { chosen: '$actorOwner' },
        executor: { id: asPlayerId(1) },
      },
      declaredBindings: [],
      hasPipeline: true,
      enforceBindingDeclaration: false,
      enforcePipelineBindingCompatibility: false,
    });
    assert.deepEqual(violations, []);
  });
});
