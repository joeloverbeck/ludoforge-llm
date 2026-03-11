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

  it('routes ambiguous overlap deferral through free-operation-viability.ts from discovery and canonical move enumeration', () => {
    const legalChoicesSource = readKernelSource('src/kernel/legal-choices.ts');
    const legalChoicesFile = parseTypeScriptSource(legalChoicesSource, 'legal-choices.ts');
    const legalChoicesViabilityImports = collectNamedImportsByLocalName(legalChoicesFile, './free-operation-viability.js');
    assert.equal(
      legalChoicesViabilityImports.get('canResolveAmbiguousFreeOperationOverlapInCurrentState'),
      'canResolveAmbiguousFreeOperationOverlapInCurrentState',
      'legal-choices.ts must import ambiguous-overlap deferral through free-operation-viability.ts',
    );

    const legalMovesSource = readKernelSource('src/kernel/legal-moves.ts');
    const legalMovesFile = parseTypeScriptSource(legalMovesSource, 'legal-moves.ts');
    const legalMovesViabilityImports = collectNamedImportsByLocalName(legalMovesFile, './free-operation-viability.js');
    assert.equal(
      legalMovesViabilityImports.get('canResolveAmbiguousFreeOperationOverlapInCurrentState'),
      'canResolveAmbiguousFreeOperationOverlapInCurrentState',
      'legal-moves.ts must import ambiguous-overlap deferral through free-operation-viability.ts',
    );
    assert.equal(
      hasImportWithModuleSubstring(legalMovesFile, './legal-choices.js'),
      false,
      'legal-moves.ts must not import legal-choices.ts for free-operation ambiguity deferral',
    );
  });

  it('forbids direct viability imports from execution-only grant authorization helpers', () => {
    const source = readKernelSource('src/kernel/free-operation-viability.ts');
    const sourceFile = parseTypeScriptSource(source, 'free-operation-viability.ts');

    const sharedImports = collectNamedImportsByLocalName(sourceFile, './free-operation-grant-bindings.js');
    assert.equal(
      sharedImports.get('collectGrantAwareMoveZoneCandidates'),
      'collectGrantAwareMoveZoneCandidates',
      'free-operation-viability.ts must consume canonical grant-aware zone-candidate helper through the neutral bindings module',
    );

    assert.equal(
      hasImportWithModuleSubstring(sourceFile, './free-operation-grant-authorization.js'),
      false,
      'free-operation-viability.ts must not import free-operation-grant-authorization.ts directly',
    );
  });

  it('keeps authorization on the same neutral grant-binding helper', () => {
    const source = readKernelSource('src/kernel/free-operation-grant-authorization.ts');
    const sourceFile = parseTypeScriptSource(source, 'free-operation-grant-authorization.ts');
    const sharedImports = collectNamedImportsByLocalName(sourceFile, './free-operation-grant-bindings.js');

    assert.equal(
      sharedImports.get('collectGrantAwareMoveZoneCandidates'),
      'collectGrantAwareMoveZoneCandidates',
      'free-operation-grant-authorization.ts must use the neutral grant-binding helper for zone candidates',
    );
    assert.equal(
      sharedImports.get('resolveGrantAwareMoveRuntimeBindings'),
      'resolveGrantAwareMoveRuntimeBindings',
      'free-operation-grant-authorization.ts must use the neutral grant-binding helper for canonical bindings',
    );
  });

  it('keeps legal-moves free-operation seeding on shared grant helpers instead of local grant semantics', () => {
    const source = readKernelSource('src/kernel/legal-moves.ts');
    const sourceFile = parseTypeScriptSource(source, 'legal-moves.ts');
    const bindingImports = collectNamedImportsByLocalName(sourceFile, './free-operation-grant-bindings.js');
    const overlayImports = collectNamedImportsByLocalName(sourceFile, './free-operation-preflight-overlay.js');

    assert.equal(
      bindingImports.get('resolvePendingFreeOperationGrantExecutionPlayer'),
      'resolvePendingFreeOperationGrantExecutionPlayer',
      'legal-moves.ts must resolve grant execution players through the shared free-operation grant bindings helper',
    );
    assert.equal(
      overlayImports.get('buildFreeOperationPreflightOverlay'),
      'buildFreeOperationPreflightOverlay',
      'legal-moves.ts must build grant preflight overlays through the shared free-operation overlay helper',
    );
  });
});
