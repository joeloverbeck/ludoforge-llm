import { appendFileSync } from 'node:fs';

export const POLICY_PROFILE_QUALITY_REPORT_PATH_ENV = 'ENGINE_POLICY_PROFILE_QUALITY_REPORT_PATH';

export type PolicyProfileQualityRecord = {
  readonly file: string;
  readonly variantId: string;
  readonly seed: number;
  readonly passed: boolean;
  readonly stopReason: string;
  readonly moves: number;
};

export function emitPolicyProfileQualityRecord(
  record: PolicyProfileQualityRecord,
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly appendFileSyncImpl?: typeof appendFileSync;
  } = {},
): void {
  const env = options.env ?? process.env;
  const outputPath = env[POLICY_PROFILE_QUALITY_REPORT_PATH_ENV];
  if (typeof outputPath !== 'string' || outputPath.length === 0) {
    return;
  }

  const appendFileSyncImpl = options.appendFileSyncImpl ?? appendFileSync;
  appendFileSyncImpl(outputPath, `${JSON.stringify(record)}\n`, 'utf8');
}
