import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { isIdentifierExported, parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
import { findEnginePackageRoot } from '../../helpers/lint-policy-helpers.js';

const VALIDATOR_BEHAVIOR_FILE = ['src', 'kernel', 'validate-gamedef-behavior.ts'] as const;
const QUERY_PREDICATE_FILE = ['src', 'kernel', 'query-predicate.ts'] as const;

describe('validator/runtime predicate-op boundary policy', () => {
  it('validator behavior imports predicate-op contracts from neutral contract module, not runtime evaluator', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const validatorPath = resolve(engineRoot, ...VALIDATOR_BEHAVIOR_FILE);
    const validatorSource = readFileSync(validatorPath, 'utf8');

    assert.match(
      validatorSource,
      /import\s*\{[^}]*\bisPredicateOp\b[^}]*\bPREDICATE_OPERATORS\b[^}]*\}\s*from\s*['"]\.\.\/contracts\/index\.js['"]/u,
      'validate-gamedef-behavior.ts must import predicate-op contracts from ../contracts/index.js',
    );
    assert.doesNotMatch(
      validatorSource,
      /from\s*['"]\.\/query-predicate\.js['"]/u,
      'validate-gamedef-behavior.ts must not import runtime query-predicate module',
    );
  });

  it('query-predicate runtime module does not re-export predicate-op contract symbols', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const runtimePath = resolve(engineRoot, ...QUERY_PREDICATE_FILE);
    const runtimeSource = readFileSync(runtimePath, 'utf8');
    const runtimeSourceFile = parseTypeScriptSource(runtimeSource, runtimePath);

    assert.equal(
      isIdentifierExported(runtimeSourceFile, 'isPredicateOp'),
      false,
      'query-predicate.ts must not re-export isPredicateOp',
    );
    assert.equal(
      isIdentifierExported(runtimeSourceFile, 'PREDICATE_OPERATORS'),
      false,
      'query-predicate.ts must not re-export PREDICATE_OPERATORS',
    );
    assert.equal(
      isIdentifierExported(runtimeSourceFile, 'PredicateOp'),
      false,
      'query-predicate.ts must not re-export PredicateOp',
    );
  });
});
