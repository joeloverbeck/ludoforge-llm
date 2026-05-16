const I32_BYTES = 4;
const COMPLETION_RECORD_WORDS = 3;

export type PolicyWasmPreviewDriveCompletionOutcome = 'completed' | 'stochastic' | 'depthCap' | 'failed';

export interface PolicyWasmPreviewDriveCompletionRecord {
  readonly iterationIndex: number;
  readonly residualBudget: number;
  readonly outcome: PolicyWasmPreviewDriveCompletionOutcome;
}

interface CompletionRecordCarrier {
  readonly continuedDeepeningCompletionRecords?: readonly PolicyWasmPreviewDriveCompletionRecord[];
}

export const policyWasmPreviewDriveCompletionRecordWords = (): number => COMPLETION_RECORD_WORDS;

export const maxCompletionRecordCount = (
  candidates: readonly CompletionRecordCarrier[],
  depthCap: number,
): number => {
  if (depthCap <= 0 || !Number.isInteger(depthCap)) {
    throw new Error('Policy WASM preview-drive depthCap must be a positive integer.');
  }
  let maxCount = 0;
  for (const candidate of candidates) {
    const records = candidate.continuedDeepeningCompletionRecords ?? [];
    if (records.length > depthCap) {
      throw new Error('Policy WASM continued-deepening completion record count must not exceed depthCap.');
    }
    maxCount = Math.max(maxCount, records.length);
  }
  return maxCount;
};

export const encodeCompletionRecords = (
  words: number[],
  candidate: CompletionRecordCarrier,
  completionRecordMaxCount: number,
  depthCap: number,
): void => {
  const records = candidate.continuedDeepeningCompletionRecords ?? [];
  if (records.length > completionRecordMaxCount) {
    throw new Error('Policy WASM continued-deepening completion record count exceeds batch max count.');
  }
  words.push(records.length);
  let previousIterationIndex = -1;
  for (const record of records) {
    if (!Number.isInteger(record.iterationIndex) || record.iterationIndex < 0) {
      throw new Error('Policy WASM continued-deepening completion iterationIndex must be a non-negative integer.');
    }
    if (record.iterationIndex <= previousIterationIndex) {
      throw new Error('Policy WASM continued-deepening completion iterationIndex must be strictly ordered.');
    }
    if (!Number.isInteger(record.residualBudget) || record.residualBudget < 0 || record.residualBudget > depthCap) {
      throw new Error('Policy WASM continued-deepening completion residualBudget must be within depthCap.');
    }
    previousIterationIndex = record.iterationIndex;
    words.push(record.iterationIndex, record.residualBudget, completionOutcomeCode(record.outcome));
  }
};

export const decodeCompletionRecords = (
  input: { readonly candidates: readonly CompletionRecordCarrier[] },
  view: DataView,
  outCompletionRecordsPtr: number,
  completionRecordMaxCount: number,
  candidateIndex: number,
): { readonly continuedDeepeningCompletionRecords?: readonly PolicyWasmPreviewDriveCompletionRecord[] } => {
  const expectedRecords = input.candidates[candidateIndex]?.continuedDeepeningCompletionRecords;
  if (expectedRecords === undefined || completionRecordMaxCount === 0) {
    return {};
  }
  const records: PolicyWasmPreviewDriveCompletionRecord[] = [];
  const candidateBaseWord = candidateIndex * completionRecordMaxCount * COMPLETION_RECORD_WORDS;
  for (let recordIndex = 0; recordIndex < expectedRecords.length; recordIndex += 1) {
    const base = outCompletionRecordsPtr + ((candidateBaseWord + (recordIndex * COMPLETION_RECORD_WORDS)) * I32_BYTES);
    const iterationIndex = view.getInt32(base, true);
    const residualBudget = view.getInt32(base + I32_BYTES, true);
    const outcome = decodeCompletionOutcome(view.getInt32(base + (2 * I32_BYTES), true));
    const expected = expectedRecords[recordIndex]!;
    if (iterationIndex !== expected.iterationIndex) {
      throw new Error(`Policy WASM continued-deepening completion iteration mismatch for candidate ${candidateIndex}, record ${recordIndex}.`);
    }
    if (residualBudget !== expected.residualBudget) {
      throw new Error(`Policy WASM continued-deepening completion residual budget mismatch for candidate ${candidateIndex}, record ${recordIndex}.`);
    }
    if (outcome !== expected.outcome) {
      throw new Error(`Policy WASM continued-deepening completion outcome mismatch for candidate ${candidateIndex}, record ${recordIndex}.`);
    }
    records.push({ iterationIndex, residualBudget, outcome });
  }
  return { continuedDeepeningCompletionRecords: records };
};

const completionOutcomeCode = (outcome: PolicyWasmPreviewDriveCompletionOutcome): number => {
  switch (outcome) {
    case 'completed':
      return 1;
    case 'stochastic':
      return 2;
    case 'depthCap':
      return 3;
    case 'failed':
      return 4;
  }
};

const decodeCompletionOutcome = (code: number): PolicyWasmPreviewDriveCompletionOutcome => {
  switch (code) {
    case 1:
      return 'completed';
    case 2:
      return 'stochastic';
    case 3:
      return 'depthCap';
    case 4:
      return 'failed';
    default:
      throw new Error(`Policy WASM preview-drive returned unknown completion outcome ${code}.`);
  }
};
