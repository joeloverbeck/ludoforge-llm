import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectNamedImportsByLocalName,
  hasImportWithModuleSubstring,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('free-operation probe boundary architecture guard', () => {
  it('routes viability probe move checks through discovery analysis contract', () => {
    const source = readKernelSource('src/kernel/free-operation-viability.ts');
    const sourceFile = parseTypeScriptSource(source, 'free-operation-viability.ts');
    const discoveryImports = collectNamedImportsByLocalName(sourceFile, './free-operation-discovery-analysis.js');

    assert.equal(
      discoveryImports.get('isFreeOperationApplicableForMove'),
      'isFreeOperationApplicableForMove',
      'free-operation-viability.ts must import isFreeOperationApplicableForMove from free-operation-discovery-analysis.ts',
    );
    assert.equal(
      discoveryImports.get('isFreeOperationGrantedForMove'),
      'isFreeOperationGrantedForMove',
      'free-operation-viability.ts must import isFreeOperationGrantedForMove from free-operation-discovery-analysis.ts',
    );
  });

  it('routes ambiguous overlap deferral through free-operation-viability.ts from both discovery and move enumeration', () => {
    const legalChoicesSource = readKernelSource('src/kernel/legal-choices.ts');
    const legalChoicesFile = parseTypeScriptSource(legalChoicesSource, 'legal-choices.ts');
    const legalChoicesViabilityImports = collectNamedImportsByLocalName(legalChoicesFile, './free-operation-viability.js');
    assert.equal(
      legalChoicesViabilityImports.get('canResolveAmbiguousFreeOperationOverlapInCurrentState'),
      'canResolveAmbiguousFreeOperationOverlapInCurrentState',
      'legal-choices.ts must import ambiguous-overlap deferral through free-operation-viability.ts',
    );

    const legalMovesSource = readKernelSource('src/kernel/legal-moves-turn-order.ts');
    const legalMovesFile = parseTypeScriptSource(legalMovesSource, 'legal-moves-turn-order.ts');
    const legalMovesViabilityImports = collectNamedImportsByLocalName(legalMovesFile, './free-operation-viability.js');
    assert.equal(
      legalMovesViabilityImports.get('canResolveAmbiguousFreeOperationOverlapInCurrentState'),
      'canResolveAmbiguousFreeOperationOverlapInCurrentState',
      'legal-moves-turn-order.ts must import ambiguous-overlap deferral through free-operation-viability.ts',
    );
    assert.equal(
      hasImportWithModuleSubstring(legalMovesFile, './legal-choices.js'),
      false,
      'legal-moves-turn-order.ts must not import legal-choices.ts for free-operation ambiguity deferral',
    );
  });

  it('forbids direct viability imports from execution-only grant authorization helpers', () => {
    const source = readKernelSource('src/kernel/free-operation-viability.ts');
    const sourceFile = parseTypeScriptSource(source, 'free-operation-viability.ts');

    assert.equal(
      hasImportWithModuleSubstring(sourceFile, './free-operation-grant-authorization.js'),
      false,
      'free-operation-viability.ts must not import free-operation-grant-authorization.ts directly',
    );
  });
});
