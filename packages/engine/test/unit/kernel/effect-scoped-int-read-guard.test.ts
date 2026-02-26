import * as assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const readKernelSource = (relativePath: string): string => {
  const candidates = [join(process.cwd(), relativePath), join(process.cwd(), 'packages/engine', relativePath)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf8');
    }
  }

  throw new Error(`Could not find kernel source file for guard: ${relativePath}`);
};

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
