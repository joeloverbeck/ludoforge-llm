import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectCallExpressionsByIdentifier,
  collectNamedImportsByLocalName,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('scoped eval hot-path architecture guard', () => {
  it('keeps trigger-dispatch off createEvalContext inside the trigger loop', () => {
    const source = readKernelSource('src/kernel/trigger-dispatch.ts');
    const sourceFile = parseTypeScriptSource(source, 'trigger-dispatch.ts');
    const evalContextImports = collectNamedImportsByLocalName(sourceFile, './eval-context.js');

    assert.equal(
      evalContextImports.has('createEvalContext'),
      false,
      'trigger-dispatch.ts must not import createEvalContext after the hot-loop local eval-scope migration',
    );
    assert.equal(
      collectCallExpressionsByIdentifier(sourceFile, 'createEvalContext').length,
      0,
      'trigger-dispatch.ts must not rebuild eval contexts inside trigger dispatch',
    );
  });

  it('keeps free-operation grant authorization off per-probe createEvalContext rebuilding', () => {
    const source = readKernelSource('src/kernel/free-operation-grant-authorization.ts');
    const sourceFile = parseTypeScriptSource(source, 'free-operation-grant-authorization.ts');
    const evalContextImports = collectNamedImportsByLocalName(sourceFile, './eval-context.js');

    assert.equal(
      evalContextImports.has('createEvalContext'),
      false,
      'free-operation-grant-authorization.ts must not import createEvalContext after probe-local eval-scope migration',
    );
    assert.equal(
      collectCallExpressionsByIdentifier(sourceFile, 'createEvalContext').length,
      0,
      'free-operation-grant-authorization.ts must not rebuild eval contexts per zone/probe callback',
    );
  });

  it('reuses the threaded mutable scope in grantFreeOperation handler', () => {
    const source = readKernelSource('src/kernel/effects-turn-flow.ts');
    const sourceFile = parseTypeScriptSource(source, 'effects-turn-flow.ts');
    const effectContextImports = collectNamedImportsByLocalName(sourceFile, './effect-context.js');

    assert.equal(
      effectContextImports.get('updateReadScopeRaw'),
      'updateReadScopeRaw',
      'effects-turn-flow.ts must import updateReadScopeRaw when reusing the threaded mutable scope',
    );
    assert.equal(
      collectCallExpressionsByIdentifier(sourceFile, 'createEvalContext').length,
      0,
      'effects-turn-flow.ts must not reconstruct handler-local eval contexts once MutableReadScope is threaded in',
    );
    assert.ok(
      collectCallExpressionsByIdentifier(sourceFile, 'updateReadScopeRaw').length > 0,
      'effects-turn-flow.ts must refresh the threaded mutable scope with raw cursor bindings for grantFreeOperation',
    );
  });
});
