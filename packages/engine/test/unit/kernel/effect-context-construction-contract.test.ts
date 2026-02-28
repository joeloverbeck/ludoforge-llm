import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectCallExpressionsByIdentifier,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const boundaryModuleExpectations = {
  'apply-move.ts': 'createExecutionEffectContext',
  'event-execution.ts': 'createExecutionEffectContext',
  'initial-state.ts': 'createExecutionEffectContext',
  'legal-choices.ts': 'createDiscoveryEffectContext',
  'phase-lifecycle.ts': 'createExecutionEffectContext',
  'trigger-dispatch.ts': 'createExecutionEffectContext',
} as const;

describe('effect-context construction contract', () => {
  it('keeps runtime authority defaults centralized in effect-context constructors', () => {
    const source = readKernelSource('src/kernel/effect-context.ts');

    assert.match(source, /export const createExecutionEffectContext\s*=\s*\(/u);
    assert.match(source, /export const createDiscoveryStrictEffectContext\s*=\s*\(/u);
    assert.match(source, /export const createDiscoveryProbeEffectContext\s*=\s*\(/u);
    assert.match(source, /export const createDiscoveryEffectContext\s*=\s*\(/u);
    assert.match(source, /decisionAuthorityPlayer\s*=\s*activePlayer/u);
    assert.match(source, /ownershipEnforcement:\s*'strict'/u);
    assert.match(source, /ownershipEnforcement:\s*'probe'/u);

    const engineRuntimeSourceMatches = source.match(/source:\s*'engineRuntime'/gu) ?? [];
    assert.equal(
      engineRuntimeSourceMatches.length,
      3,
      'Execution and strict/probe discovery constructors must encode engine-owned authority source',
    );
    assert.match(source, /mode:\s*'execution'/u);
    assert.match(source, /mode:\s*'discovery'/u);
  });

  it('routes applyEffects boundaries through canonical context constructors', () => {
    for (const [moduleName, constructorName] of Object.entries(boundaryModuleExpectations)) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      const sourceFile = parseTypeScriptSource(source, moduleName);
      const applyEffectsCalls = collectCallExpressionsByIdentifier(sourceFile, 'applyEffects');
      const constructorCalls = collectCallExpressionsByIdentifier(sourceFile, constructorName);

      assert.ok(applyEffectsCalls.length > 0, `${moduleName} must contain applyEffects call(s)`);
      assert.equal(
        constructorCalls.length,
        applyEffectsCalls.length,
        `${moduleName} must construct every applyEffects context via ${constructorName}`,
      );
    }
  });
});
