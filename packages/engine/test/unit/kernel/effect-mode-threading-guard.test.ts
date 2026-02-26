import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectCallExpressionsByIdentifier,
  collectTopLevelObjectLiteralInitializers,
  parseTypeScriptSource,
  resolveObjectLiteralFromExpression,
  resolveStringLiteralObjectPropertyWithSpreads,
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

const expectedModeByBoundaryModule = {
  'apply-move.ts': 'execution',
  'event-execution.ts': 'execution',
  'initial-state.ts': 'execution',
  'legal-choices.ts': 'discovery',
  'phase-lifecycle.ts': 'execution',
  'trigger-dispatch.ts': 'execution',
} as const satisfies Readonly<Record<(typeof expectedApplyEffectsBoundaryModules)[number], 'execution' | 'discovery'>>;

const fallbackPattern = /\bmode\s*\?\?\s*['"]execution['"]/u;
const fallbackCtxPattern = /\bctx\s*\.\s*mode\s*\?\?/u;

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

  it('requires explicit mode threading at each guarded applyEffects boundary', () => {
    for (const moduleName of expectedApplyEffectsBoundaryModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      const sourceFile = parseTypeScriptSource(source, moduleName);
      const objectInitializers = collectTopLevelObjectLiteralInitializers(sourceFile);
      const applyEffectsCalls = collectCallExpressionsByIdentifier(sourceFile, 'applyEffects');
      assert.ok(applyEffectsCalls.length > 0, `${moduleName} must contain applyEffects call(s) for this architecture guard`);

      for (const [callIndex, call] of applyEffectsCalls.entries()) {
        const contextArg = call.arguments[1];
        assert.ok(contextArg !== undefined, `${moduleName} applyEffects call #${callIndex + 1} must pass context argument`);
        if (contextArg === undefined) {
          continue;
        }
        const contextObject = resolveObjectLiteralFromExpression(contextArg, objectInitializers);
        assert.ok(
          contextObject !== undefined,
          `${moduleName} applyEffects call #${callIndex + 1} must pass an object-literal context or identifier bound to one`,
        );
        if (contextObject === undefined) {
          continue;
        }

        const resolvedMode = resolveStringLiteralObjectPropertyWithSpreads(contextObject, 'mode', objectInitializers);
        assert.ok(
          resolvedMode !== undefined,
          `${moduleName} applyEffects call #${callIndex + 1} must include an explicit mode literal or spread from a mode-bearing context object`,
        );
        if (resolvedMode === undefined) {
          continue;
        }

        assert.equal(
          resolvedMode,
          expectedModeByBoundaryModule[moduleName],
          `${moduleName} applyEffects call #${callIndex + 1} must preserve boundary mode ${expectedModeByBoundaryModule[moduleName]}`,
        );
      }
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
