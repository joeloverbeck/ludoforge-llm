// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import { assertRequestObjectApiShape } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('dispatchTriggers API shape policy', () => {
  it('keeps dispatchTriggers as a single request-object parameter entrypoint', () => {
    const source = readKernelSource('src/kernel/trigger-dispatch.ts');
    assertRequestObjectApiShape(source, {
      sourceFilePath: 'trigger-dispatch.ts',
      functionIdentifier: 'dispatchTriggers',
      requestTypeName: 'DispatchTriggersRequest',
    });
  });
});
