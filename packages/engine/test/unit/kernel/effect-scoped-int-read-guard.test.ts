import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('effect scoped-int read architecture guard', () => {
  it('keeps addVar/transferVar int reads routed through shared runtime helper', () => {
    const effectsVarSource = readKernelSource('src/kernel/effects-var.ts');
    const effectsResourceSource = readKernelSource('src/kernel/effects-resource.ts');

    assert.match(effectsVarSource, /\breadScopedIntVarValue\b/, 'effects-var.ts must use shared scoped int-read helper');
    assert.match(
      effectsResourceSource,
      /\breadScopedIntVarValue\b/,
      'effects-resource.ts must use shared scoped int-read helper',
    );

    assert.doesNotMatch(
      effectsVarSource,
      /\b(?:const|function)\s+readScopedInt[A-Za-z0-9_]*\s*[=(]/,
      'effects-var.ts must not define local scoped int-read wrappers',
    );
    assert.doesNotMatch(
      effectsResourceSource,
      /\b(?:const|function)\s+readScopedInt[A-Za-z0-9_]*\s*[=(]/,
      'effects-resource.ts must not define local scoped int-read wrappers',
    );

    assert.equal(
      effectsVarSource.includes("readScopedVarValue(ctx, endpoint, 'addVar'"),
      false,
      'effects-var.ts addVar path must not bypass shared int-read helper',
    );
    assert.equal(
      effectsResourceSource.includes("readScopedVarValue(ctx, endpoint, 'transferVar'"),
      false,
      'effects-resource.ts transferVar path must not bypass shared int-read helper',
    );
  });
});
