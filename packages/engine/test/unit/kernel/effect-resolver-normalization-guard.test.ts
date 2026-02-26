import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';
import {
  collectCallExpressionsByIdentifier,
  collectVariableIdentifiersByInitializer,
  expressionToText,
  getObjectPropertyExpression,
  hasImportWithModuleSubstring,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { listKernelModulesByPrefix, readKernelSource } from '../../helpers/kernel-source-guard.js';

const selectorNormalizedModules = {
  'effects-choice.ts': ['resolveZoneWithNormalization'],
  'effects-reveal.ts': ['resolveZoneWithNormalization', 'resolvePlayersWithNormalization'],
  'effects-token.ts': ['resolveZoneWithNormalization'],
  'effects-var.ts': ['resolveSinglePlayerWithNormalization'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

const selectorFreeModules = [
  'effects-binding.ts',
  'effects-control.ts',
  'effects-resource.ts',
  'effects-subset.ts',
  'effects-turn-flow.ts',
] as const;

const prohibitedDirectResolvers = ['resolveZoneRef', 'resolvePlayerSel'] as const;
const resolverHelpers = [
  'resolveZoneWithNormalization',
  'resolvePlayersWithNormalization',
  'resolveSinglePlayerWithNormalization',
] as const;
const helperModulesRequiringCanonicalPolicyDerivation = [
  ...Object.keys(selectorNormalizedModules),
  'scoped-var-runtime-access.ts',
] as const;

const isCanonicalPolicyDerivationCall = (expression: ts.Expression): boolean => {
  if (!ts.isCallExpression(expression)) {
    return false;
  }
  if (!ts.isIdentifier(expression.expression) || expression.expression.text !== 'selectorResolutionFailurePolicyForMode') {
    return false;
  }
  if (expression.arguments.length !== 1) {
    return false;
  }
  const arg = expression.arguments[0];
  if (arg === undefined) {
    return false;
  }
  return (
    ts.isPropertyAccessExpression(arg) &&
    ts.isIdentifier(arg.expression) &&
    arg.expression.text === 'evalCtx' &&
    arg.name.text === 'mode'
  );
};

describe('effect resolver normalization architecture guard', () => {
  it('keeps effect handler resolver usage aligned with normalization policy', () => {
    const actualEffectModules = listKernelModulesByPrefix('effects-');
    const policyModules = [...Object.keys(selectorNormalizedModules), ...selectorFreeModules].sort();
    assert.deepEqual(
      actualEffectModules,
      policyModules,
      'Effect module policy list must stay in sync with src/kernel/effects-*.ts modules',
    );

    for (const moduleName of actualEffectModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      for (const resolver of prohibitedDirectResolvers) {
        assert.doesNotMatch(
          source,
          new RegExp(`\\b${resolver}\\b`, 'u'),
          `${moduleName} must not use direct ${resolver}; route via selector-resolution-normalization`,
        );
      }
    }

    for (const [moduleName, requiredHelpers] of Object.entries(selectorNormalizedModules)) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      for (const helperName of requiredHelpers) {
        assert.match(
          source,
          new RegExp(`\\b${helperName}\\b`, 'u'),
          `${moduleName} must resolve selectors/zones via ${helperName}`,
        );
      }
    }

    for (const moduleName of selectorFreeModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      assert.doesNotMatch(
        source,
        /\bresolve(?:Zone|Players|SinglePlayer)WithNormalization\b/u,
        `${moduleName} is expected to be selector-free and not depend on selector normalization helpers`,
      );
    }
  });

  it('enforces canonical onResolutionFailure derivation for normalized resolver helper calls', () => {
    for (const moduleName of helperModulesRequiringCanonicalPolicyDerivation) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      const sourceFile = parseTypeScriptSource(source, moduleName);
      const usesResolverHelpers = resolverHelpers.some((helperName) => source.includes(helperName));
      if (!usesResolverHelpers) {
        continue;
      }

      const canonicalIdentifiers = collectVariableIdentifiersByInitializer(sourceFile, isCanonicalPolicyDerivationCall);
      assert.ok(
        canonicalIdentifiers.length > 0,
        `${moduleName} must derive at least one canonical onResolutionFailure identifier from selectorResolutionFailurePolicyForMode(evalCtx.mode)`,
      );

      for (const helperName of resolverHelpers) {
        const helperCalls = collectCallExpressionsByIdentifier(sourceFile, helperName);
        for (const helperCall of helperCalls) {
          const optionsArg = helperCall.arguments[2];
          assert.ok(
            optionsArg !== undefined && ts.isObjectLiteralExpression(optionsArg),
            `${moduleName} ${helperName} call must pass an options object literal`,
          );
          if (optionsArg === undefined || !ts.isObjectLiteralExpression(optionsArg)) {
            continue;
          }

          const onResolutionFailureExpression = getObjectPropertyExpression(optionsArg, 'onResolutionFailure');
          assert.ok(
            onResolutionFailureExpression !== undefined,
            `${moduleName} ${helperName} call must pass onResolutionFailure`,
          );
          if (onResolutionFailureExpression === undefined) {
            continue;
          }

          assert.equal(
            ts.isStringLiteral(onResolutionFailureExpression) || ts.isNoSubstitutionTemplateLiteral(onResolutionFailureExpression),
            false,
            `${moduleName} ${helperName} must not use ad-hoc onResolutionFailure literals`,
          );
          assert.equal(
            isCanonicalPolicyDerivationCall(onResolutionFailureExpression),
            false,
            `${moduleName} ${helperName} must not inline selectorResolutionFailurePolicyForMode(...)`,
          );
          assert.ok(
            ts.isIdentifier(onResolutionFailureExpression),
            `${moduleName} ${helperName} onResolutionFailure must reference a canonical identifier, got: ${expressionToText(sourceFile, onResolutionFailureExpression)}`,
          );
          if (!ts.isIdentifier(onResolutionFailureExpression)) {
            continue;
          }
          assert.ok(
            canonicalIdentifiers.includes(onResolutionFailureExpression.text),
            `${moduleName} ${helperName} onResolutionFailure identifier "${onResolutionFailureExpression.text}" must be canonically derived from selectorResolutionFailurePolicyForMode(evalCtx.mode)`,
          );
        }
      }
    }
  });

  it('keeps selector-normalization helper decoupled from effect-context plumbing', () => {
    const source = readKernelSource('src/kernel/selector-resolution-normalization.ts');
    const sourceFile = parseTypeScriptSource(source, 'selector-resolution-normalization.ts');
    assert.equal(
      hasImportWithModuleSubstring(sourceFile, 'effect-context'),
      false,
      'selector-resolution-normalization.ts must not import from effect-context.ts',
    );
  });
});
