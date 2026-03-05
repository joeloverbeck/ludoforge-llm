import { describe, it } from 'node:test';
import { assertRequestObjectApiShape } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('phase-advance API shape policy', () => {
  it('keeps advancePhase as a single request-object parameter entrypoint', () => {
    const source = readKernelSource('src/kernel/phase-advance.ts');
    assertRequestObjectApiShape(source, {
      sourceFilePath: 'phase-advance.ts',
      functionIdentifier: 'advancePhase',
      requestTypeName: 'AdvancePhaseRequest',
    });
  });
});
