import { describe, it } from 'node:test';
import {
  assertModuleExportContract,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const probeResultModule = 'src/kernel/probe-result.ts';
const expectedProbeResultExports = [
  'ProbeOutcome',
  'ProbeInconclusiveReason',
  'ProbeResultLegal',
  'ProbeResultIllegal',
  'ProbeResultInconclusive',
  'ProbeResult',
  'ProbeResultPolicy',
  'resolveProbeResult',
] as const;

describe('probe-result export surface architecture guard', () => {
  it('exports only the curated probe-result API', () => {
    const source = readKernelSource(probeResultModule);
    const sourceFile = parseTypeScriptSource(source, probeResultModule);
    assertModuleExportContract(sourceFile, 'probe-result.ts', {
      expectedNamedExports: expectedProbeResultExports,
    });
  });
});
