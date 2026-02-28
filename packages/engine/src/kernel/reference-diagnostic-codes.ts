const KERNEL_REFERENCE_DIAGNOSTIC_CODE_PREFIX = 'REF_' as const;

export const isKernelReferenceDiagnosticCode = (code: string): boolean =>
  code.startsWith(KERNEL_REFERENCE_DIAGNOSTIC_CODE_PREFIX);
