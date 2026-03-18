import type { EvalRuntimeResources } from './eval-context.js';
import { kernelRuntimeError } from './runtime-error.js';

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const EVAL_RUNTIME_RESOURCE_KEYS = ['collector'] as const;
const EVAL_RUNTIME_COLLECTOR_KEYS = ['warnings', 'trace', 'conditionTrace', 'decisionTrace', 'selectorTrace', 'nextSeq'] as const;

const describeType = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  return Array.isArray(value) ? 'array' : typeof value;
};

export const assertEvalRuntimeResourcesContract: (
  value: unknown,
  resourcePath: string,
) => asserts value is EvalRuntimeResources = (
  value: unknown,
  resourcePath: string,
) => {
  if (!isObjectRecord(value)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `${resourcePath} must be an object; received ${describeType(value)}`,
    );
  }
  const unknownTopLevelKeys = Object.keys(value).filter(
    (key) => !EVAL_RUNTIME_RESOURCE_KEYS.includes(key as (typeof EVAL_RUNTIME_RESOURCE_KEYS)[number]),
  );
  if (unknownTopLevelKeys.length > 0) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `${resourcePath} contains unknown resource key(s): ${unknownTopLevelKeys.sort().join(', ')}`,
    );
  }
  const candidate = value as { collector?: unknown };
  if (!isObjectRecord(candidate.collector)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `${resourcePath}.collector must be an object; received ${describeType(candidate.collector)}`,
    );
  }
  const unknownCollectorKeys = Object.keys(candidate.collector).filter(
    (key) => !EVAL_RUNTIME_COLLECTOR_KEYS.includes(key as (typeof EVAL_RUNTIME_COLLECTOR_KEYS)[number]),
  );
  if (unknownCollectorKeys.length > 0) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `${resourcePath}.collector contains unknown key(s): ${unknownCollectorKeys.sort().join(', ')}`,
    );
  }
  if (!Array.isArray(candidate.collector.warnings)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `${resourcePath}.collector.warnings must be an array; received ${describeType(candidate.collector.warnings)}`,
    );
  }
  const collectorTrace = candidate.collector.trace;
  if (collectorTrace !== null && !Array.isArray(collectorTrace)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `${resourcePath}.collector.trace must be an array or null; received ${describeType(collectorTrace)}`,
    );
  }
};
