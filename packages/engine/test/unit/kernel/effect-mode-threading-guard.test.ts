import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectCallExpressionsByIdentifier,
  expressionToText,
  parseTypeScriptSource,
  resolveCallIdentifierFromExpression,
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

type CanonicalEffectContextConstructorId =
  | 'createExecutionEffectContext'
  | 'createDiscoveryStrictEffectContext'
  | 'createDiscoveryProbeEffectContext';

const expectedConstructorsByBoundaryModule: Readonly<Record<
  (typeof expectedApplyEffectsBoundaryModules)[number],
  readonly CanonicalEffectContextConstructorId[]
>> = {
  'apply-move.ts': ['createExecutionEffectContext'],
  'event-execution.ts': ['createExecutionEffectContext'],
  'initial-state.ts': ['createExecutionEffectContext'],
  'legal-choices.ts': ['createDiscoveryStrictEffectContext', 'createDiscoveryProbeEffectContext'],
  'phase-lifecycle.ts': ['createExecutionEffectContext'],
  'trigger-dispatch.ts': ['createExecutionEffectContext'],
};

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

  it('requires canonical effect-context constructors at each guarded applyEffects boundary', () => {
    for (const moduleName of expectedApplyEffectsBoundaryModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      const sourceFile = parseTypeScriptSource(source, moduleName);
      const applyEffectsCalls = collectCallExpressionsByIdentifier(sourceFile, 'applyEffects');
      assert.ok(applyEffectsCalls.length > 0, `${moduleName} must contain applyEffects call(s) for this architecture guard`);
      const expectedConstructors = expectedConstructorsByBoundaryModule[moduleName];

      for (const applyEffectsCall of applyEffectsCalls) {
        const contextArgument = applyEffectsCall.arguments[1];
        assert.notEqual(
          contextArgument,
          undefined,
          `${moduleName} must pass an explicit effect context as the second applyEffects argument`,
        );
        if (contextArgument === undefined) {
          continue;
        }

        const resolvedConstructor = resolveCallIdentifierFromExpression(contextArgument, sourceFile, applyEffectsCall);
        assert.ok(
          resolvedConstructor !== undefined
            && expectedConstructors.includes(resolvedConstructor as CanonicalEffectContextConstructorId),
          `${moduleName} applyEffects context must resolve to one of ${expectedConstructors.join(', ')}; got ${
            resolvedConstructor ?? 'non-constructor expression'
          } from ${expressionToText(sourceFile, contextArgument)}`,
        );
      }
    }
  });

  it('does not over-fail on unrelated literals when applyEffects context wiring is canonical', () => {
    const source = `
      const unrelated = { mode: 'execution', decisionAuthority: { source: 'fixture' } };
      const ctx = createExecutionEffectContext({ state, rng });
      applyEffects(effects, ctx);
    `;
    const sourceFile = parseTypeScriptSource(source, 'guard-fixture.ts');
    const applyEffectsCalls = collectCallExpressionsByIdentifier(sourceFile, 'applyEffects');
    assert.equal(applyEffectsCalls.length, 1, 'fixture must include exactly one applyEffects call');
    const applyEffectsCall = applyEffectsCalls[0];
    assert.notEqual(applyEffectsCall, undefined, 'fixture must provide applyEffects call');
    if (applyEffectsCall === undefined) {
      return;
    }

    const contextArgument = applyEffectsCall.arguments[1];
    assert.notEqual(contextArgument, undefined, 'fixture applyEffects call must provide context argument');
    if (contextArgument === undefined) {
      return;
    }

    const resolvedConstructor = resolveCallIdentifierFromExpression(contextArgument, sourceFile, applyEffectsCall);
    assert.equal(
      resolvedConstructor,
      'createExecutionEffectContext',
      'constructor resolution should ignore unrelated object literals elsewhere in the module',
    );
  });

  it('resolves constructor source by nearest lexical scope when context identifiers are shadowed', () => {
    const source = `
      const ctx = createDiscoveryStrictEffectContext({ state, rng });
      {
        const ctx = createExecutionEffectContext({ state, rng });
        applyEffects(effects, ctx);
      }
      applyEffects(effects, ctx);
    `;
    const sourceFile = parseTypeScriptSource(source, 'shadow-fixture.ts');
    const applyEffectsCalls = collectCallExpressionsByIdentifier(sourceFile, 'applyEffects');
    assert.equal(applyEffectsCalls.length, 2, 'fixture must include two applyEffects calls');

    const resolved: string[] = applyEffectsCalls.map((call) => {
      const contextArgument = call.arguments[1];
      assert.notEqual(contextArgument, undefined, 'fixture applyEffects call must provide context argument');
      if (contextArgument === undefined) {
        throw new Error('fixture applyEffects call must provide context argument');
      }
      const constructor = resolveCallIdentifierFromExpression(contextArgument, sourceFile, call);
      assert.notEqual(constructor, undefined, 'fixture applyEffects call should resolve to a constructor');
      if (constructor === undefined) {
        throw new Error('fixture applyEffects call should resolve to a constructor');
      }
      return constructor;
    });

    assert.deepEqual(
      resolved.sort(),
      ['createDiscoveryStrictEffectContext', 'createExecutionEffectContext'].sort(),
      'scope-aware resolution must follow the nearest visible binding for each applyEffects usage',
    );
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
