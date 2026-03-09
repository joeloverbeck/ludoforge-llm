import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectNamedImportsByLocalName, parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('free-operation viability boundary architecture guard', () => {
  it('routes effects turn-flow viability helpers through dedicated viability module', () => {
    const source = readKernelSource('src/kernel/effects-turn-flow.ts');
    const sourceFile = parseTypeScriptSource(source, 'effects-turn-flow.ts');
    const viabilityImports = collectNamedImportsByLocalName(sourceFile, './free-operation-viability.js');

    assert.equal(
      viabilityImports.get('grantRequiresUsableProbe'),
      'grantRequiresUsableProbe',
      'effects-turn-flow.ts must import grantRequiresUsableProbe from free-operation-viability.ts',
    );
    assert.equal(
      viabilityImports.get('isFreeOperationGrantUsableInCurrentState'),
      'isFreeOperationGrantUsableInCurrentState',
      'effects-turn-flow.ts must import isFreeOperationGrantUsableInCurrentState from free-operation-viability.ts',
    );

    const legacyImports = collectNamedImportsByLocalName(sourceFile, './turn-flow-eligibility.js');
    assert.equal(
      legacyImports.has('grantRequiresUsableProbe'),
      false,
      'effects-turn-flow.ts must not import grantRequiresUsableProbe from turn-flow-eligibility.ts',
    );
    assert.equal(
      legacyImports.has('isFreeOperationGrantUsableInCurrentState'),
      false,
      'effects-turn-flow.ts must not import isFreeOperationGrantUsableInCurrentState from turn-flow-eligibility.ts',
    );
  });
});
