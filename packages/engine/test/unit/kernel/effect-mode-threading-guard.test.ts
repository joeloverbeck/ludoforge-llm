import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectCallExpressionsByIdentifier,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { listKernelModulesByPrefix, readKernelSource } from '../../helpers/kernel-source-guard.js';

const expectedApplyEffectsBoundaryModules = [
  'apply-move.ts',
  'event-execution.ts',
  'initial-state.ts',
  'legal-choices.ts',
  'phase-lifecycle.ts',
  'trigger-dispatch.ts',
] as const;

const expectedConstructorByBoundaryModule = {
  'apply-move.ts': 'createExecutionEffectContext',
  'event-execution.ts': 'createExecutionEffectContext',
  'initial-state.ts': 'createExecutionEffectContext',
  'legal-choices.ts': 'createDiscoveryEffectContext',
  'phase-lifecycle.ts': 'createExecutionEffectContext',
  'trigger-dispatch.ts': 'createExecutionEffectContext',
} as const satisfies Readonly<Record<
  (typeof expectedApplyEffectsBoundaryModules)[number],
  'createExecutionEffectContext' | 'createDiscoveryEffectContext'
>>;

const fallbackPattern = /\bmode\s*\?\?\s*['"]execution['"]/u;
const fallbackCtxPattern = /\bctx\s*\.\s*mode\s*\?\?/u;
const inlineModeLiteralPattern = /\bmode\s*:\s*['"](execution|discovery)['"]/u;
const inlineDecisionAuthorityPattern = /\bdecisionAuthority\s*:/u;

describe('effect mode threading architecture guard', () => {
  it('keeps kernel applyEffects entry boundary allowlist explicit', () => {
    const kernelModules = listKernelModulesByPrefix('');
    const actualBoundaryModules = kernelModules
      .filter((moduleName) => {
        const source = readKernelSource(`src/kernel/${moduleName}`);
        const sourceFile = parseTypeScriptSource(source, moduleName);
        return collectCallExpressionsByIdentifier(sourceFile, 'applyEffects').length > 0;
      })
      .sort();

    assert.deepEqual(
      actualBoundaryModules,
      [...expectedApplyEffectsBoundaryModules].sort(),
      'Kernel applyEffects boundary module set changed; update guard allowlist intentionally.',
    );
  });

  it('requires canonical effect-context constructors at each guarded applyEffects boundary', () => {
    for (const moduleName of expectedApplyEffectsBoundaryModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      const sourceFile = parseTypeScriptSource(source, moduleName);
      const applyEffectsCalls = collectCallExpressionsByIdentifier(sourceFile, 'applyEffects');
      assert.ok(applyEffectsCalls.length > 0, `${moduleName} must contain applyEffects call(s) for this architecture guard`);
      const expectedConstructor = expectedConstructorByBoundaryModule[moduleName];
      const executionCalls = collectCallExpressionsByIdentifier(sourceFile, 'createExecutionEffectContext');
      const discoveryCalls = collectCallExpressionsByIdentifier(sourceFile, 'createDiscoveryEffectContext');
      const expectedCalls = collectCallExpressionsByIdentifier(sourceFile, expectedConstructor);

      assert.equal(
        expectedCalls.length,
        applyEffectsCalls.length,
        `${moduleName} must construct every applyEffects context via ${expectedConstructor}`,
      );
      assert.equal(
        expectedConstructor === 'createExecutionEffectContext' ? discoveryCalls.length : executionCalls.length,
        0,
        `${moduleName} must not mix execution/discovery constructors across a single boundary module`,
      );
      assert.doesNotMatch(
        source,
        inlineModeLiteralPattern,
        `${moduleName} must not inline mode literals at applyEffects boundaries`,
      );
      assert.doesNotMatch(
        source,
        inlineDecisionAuthorityPattern,
        `${moduleName} must not inline decisionAuthority wiring at applyEffects boundaries`,
      );
    }
  });

  it('forbids implicit execution fallback in kernel mode plumbing', () => {
    const kernelModules = listKernelModulesByPrefix('');
    for (const moduleName of kernelModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      assert.doesNotMatch(
        source,
        fallbackPattern,
        `${moduleName} must not reintroduce mode ?? 'execution' fallback semantics`,
      );
      assert.doesNotMatch(
        source,
        fallbackCtxPattern,
        `${moduleName} must not use ctx.mode ?? fallback semantics`,
      );
    }
  });
});
