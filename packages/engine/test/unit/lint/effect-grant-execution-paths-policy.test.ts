import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('effect grant execution-path traversal policy', () => {
  it('forbids recovering control-flow semantics from pathSuffix string comparisons', () => {
    const source = readKernelSource('src/kernel/effect-grant-execution-paths.ts');

    assert.equal(
      /\.pathSuffix\s*===\s*['"`]\./u.test(source),
      false,
      'effect-grant-execution-paths.ts must not branch on serialized pathSuffix values',
    );
    assert.equal(
      /nestedScope\.pathSuffix\s*===/u.test(source),
      false,
      'effect-grant-execution-paths.ts must not compare nestedScope.pathSuffix directly',
    );
  });

  it('requires traversal semantics to come from helper-owned descriptor metadata', () => {
    const source = readKernelSource('src/kernel/effect-grant-execution-paths.ts');

    assert.equal(
      source.includes("nestedScope.traversal.kind === 'alternative'")
        && source.includes("nestedScope.traversal.kind === 'loop-body'")
        && source.includes("nestedScope.traversal.kind === 'loop-continuation'")
        && source.includes("nestedScope.traversal.kind === 'sequential'"),
      true,
      'effect-grant-execution-paths.ts must branch on helper-owned traversal metadata',
    );
  });
});
