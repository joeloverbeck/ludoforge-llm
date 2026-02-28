import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateActionSelectorContracts, getActionSelectorContract } from '../../../src/kernel/action-selector-contract-registry.js';
import { asPlayerId } from '../../../src/kernel/branded.js';
import { ACTION_EXECUTOR_SELECTOR_SUGGESTION, PLAYER_SELECTOR_SUGGESTION } from '../../../src/kernel/player-selector-vocabulary.js';

describe('action selector contract registry', () => {
  it('covers deterministic selector contract matrix across role bindings and pipeline presence', () => {
    const declaredBindingSets: ReadonlyArray<readonly string[]> = [[], ['$actorOwner'], ['$execOwner'], ['$actorOwner', '$execOwner']];

    for (const actorUsesBinding of [false, true] as const) {
      for (const executorUsesBinding of [false, true] as const) {
        for (const declaredBindings of declaredBindingSets) {
          for (const hasPipeline of [false, true] as const) {
            const violations = evaluateActionSelectorContracts({
              selectors: {
                actor: actorUsesBinding ? { chosen: '$actorOwner' } : 'active',
                executor: executorUsesBinding ? { chosen: '$execOwner' } : 'actor',
              },
              declaredBindings,
              hasPipeline,
            });

            const expected: Array<{ role: 'actor' | 'executor'; kind: 'bindingNotDeclared' | 'bindingWithPipelineUnsupported'; binding: string }> = [];
            if (actorUsesBinding && !declaredBindings.includes('$actorOwner')) {
              expected.push({ role: 'actor', kind: 'bindingNotDeclared', binding: '$actorOwner' });
            }
            if (executorUsesBinding && !declaredBindings.includes('$execOwner')) {
              expected.push({ role: 'executor', kind: 'bindingNotDeclared', binding: '$execOwner' });
            }
            if (executorUsesBinding && hasPipeline) {
              expected.push({ role: 'executor', kind: 'bindingWithPipelineUnsupported', binding: '$execOwner' });
            }

            assert.deepEqual(
              violations,
              expected,
              `actorUsesBinding=${actorUsesBinding} executorUsesBinding=${executorUsesBinding} declaredBindings=${declaredBindings.join(',')} hasPipeline=${hasPipeline}`,
            );
          }
        }
      }
    }
  });

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

  it('reports malformed selector binding identifiers in deterministic role order', () => {
    const violations = evaluateActionSelectorContracts({
      selectors: {
        actor: { chosen: 'actorOwner' },
        executor: { chosen: 'execOwner' },
      },
      declaredBindings: ['actorOwner', 'execOwner'],
      hasPipeline: false,
      enforcePipelineBindingCompatibility: false,
    });

    assert.deepEqual(violations, [
      { role: 'actor', kind: 'bindingMalformed', binding: 'actorOwner' },
      { role: 'executor', kind: 'bindingMalformed', binding: 'execOwner' },
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

  it('uses canonical shared selector suggestion vocabulary per role', () => {
    assert.equal(getActionSelectorContract('actor').invalidSelectorSuggestion, PLAYER_SELECTOR_SUGGESTION);
    assert.equal(getActionSelectorContract('executor').invalidSelectorSuggestion, ACTION_EXECUTOR_SELECTOR_SUGGESTION);
  });

  it('keeps contract ownership typed and surface-agnostic in kernel', () => {
    assert.deepEqual(Object.keys(getActionSelectorContract('actor')).sort(), ['cardinality', 'invalidSelectorSuggestion', 'role']);
    assert.deepEqual(Object.keys(getActionSelectorContract('executor')).sort(), ['cardinality', 'invalidSelectorSuggestion', 'role']);
  });
});
