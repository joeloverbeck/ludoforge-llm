import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectNamedImportsByLocalName, parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const assertUsesCanonicalSeatResolver = (sourcePath: string, moduleLabel: string): void => {
  const source = readKernelSource(sourcePath);
  const sourceFile = parseTypeScriptSource(source, moduleLabel);
  const imports = collectNamedImportsByLocalName(sourceFile, './free-operation-seat-resolution.js');

  assert.equal(
    imports.get('resolveFreeOperationGrantSeatToken'),
    'resolveFreeOperationGrantSeatToken',
    `${moduleLabel} must import resolveFreeOperationGrantSeatToken from free-operation-seat-resolution.ts`,
  );
  assert.doesNotMatch(
    source,
    /\bconst\s+resolveGrantSeat\s*=/u,
    `${moduleLabel} must not re-declare local free-operation seat resolver`,
  );
};

describe('free-operation seat resolution boundary architecture guard', () => {
  it('enforces canonical seat-token resolver ownership', () => {
    assertUsesCanonicalSeatResolver('src/kernel/effects-turn-flow.ts', 'effects-turn-flow.ts');
    assertUsesCanonicalSeatResolver('src/kernel/free-operation-viability.ts', 'free-operation-viability.ts');
    assertUsesCanonicalSeatResolver('src/kernel/turn-flow-eligibility.ts', 'turn-flow-eligibility.ts');
  });
});
