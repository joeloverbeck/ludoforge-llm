import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertEvalRuntimeResourcesContract,
  createCollector,
  createEvalRuntimeResources,
} from '../../src/kernel/index.js';

describe('assertEvalRuntimeResourcesContract', () => {
  it('accepts canonical runtime resources', () => {
    const resources = createEvalRuntimeResources({ collector: createCollector({ trace: true }) });
    assert.doesNotThrow(() => {
      assertEvalRuntimeResourcesContract(resources, 'testBoundary evalRuntimeResources');
    });
  });

  it('fails when runtime resources is not an object', () => {
    assert.throws(
      () => {
        assertEvalRuntimeResourcesContract(undefined, 'testBoundary evalRuntimeResources');
      },
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /testBoundary evalRuntimeResources must be an object/);
        return true;
      },
    );
  });

  it('fails when collector contract is malformed', () => {
    const invalidResources = {
      collector: { warnings: {}, trace: [] },
    };
    assert.throws(
      () => {
        assertEvalRuntimeResourcesContract(invalidResources, 'testBoundary evalRuntimeResources');
      },
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /collector\.warnings must be an array/);
        return true;
      },
    );
  });

  it('ignores unrelated extra fields and enforces only collector runtime resources contract', () => {
    const invalidResources = {
      collector: { warnings: [], trace: {} },
      queryRuntimeCache: 'legacy-extra-field',
    };
    assert.throws(
      () => {
        assertEvalRuntimeResourcesContract(invalidResources, 'testBoundary evalRuntimeResources');
      },
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'RUNTIME_CONTRACT_INVALID');
        assert.match((error as Error).message, /collector\.trace must be an array or null/);
        return true;
      },
    );
  });
});
