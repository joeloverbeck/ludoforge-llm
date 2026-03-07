import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const readFunctionBlock = (source: string, functionName: string): string => {
  const startToken = `function ${functionName}`;
  const arrowToken = `const ${functionName} =`;
  const startIndex = source.indexOf(startToken) >= 0
    ? source.indexOf(startToken)
    : source.indexOf(arrowToken);
  assert.notEqual(startIndex, -1, `${functionName} must exist in guarded module source`);
  if (startIndex === -1) {
    throw new Error(`${functionName} must exist in guarded module source`);
  }

  const nextExportIndex = source.indexOf('\nexport ', startIndex + 1);
  return nextExportIndex === -1
    ? source.slice(startIndex)
    : source.slice(startIndex, nextExportIndex);
};

describe('eval/effect resource constructor contract guard', () => {
  it('forbids implicit resources default/fallback semantics in createEvalContext', () => {
    const source = readKernelSource('src/kernel/eval-context.ts');
    const block = readFunctionBlock(source, 'createEvalContext');

    assert.doesNotMatch(
      block,
      /resources\s*=\s*/u,
      'createEvalContext must require caller-owned resources and must not default resources',
    );
    assert.doesNotMatch(
      block,
      /resources\s*\?\?/u,
      'createEvalContext must not reconstruct resources via nullish fallback',
    );
    assert.match(
      block,
      /collector:\s*resources\.collector/u,
      'createEvalContext must derive collector from canonical resources identity',
    );
  });

  it('forbids implicit resources default/fallback semantics in effect-context constructors', () => {
    const source = readKernelSource('src/kernel/effect-context.ts');
    const constructorNames = [
      'createExecutionEffectContext',
      'createDiscoveryStrictEffectContext',
      'createDiscoveryProbeEffectContext',
    ] as const;

    for (const constructorName of constructorNames) {
      const block = readFunctionBlock(source, constructorName);
      assert.doesNotMatch(
        block,
        /resources\s*=\s*/u,
        `${constructorName} must require caller-owned resources and must not default resources`,
      );
      assert.doesNotMatch(
        block,
        /resources\s*\?\?/u,
        `${constructorName} must not reconstruct resources via nullish fallback`,
      );
      assert.match(
        block,
        /collector:\s*resources\.collector/u,
        `${constructorName} must derive collector from canonical resources identity`,
      );
    }
  });
});
