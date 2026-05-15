import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';

const I32_BYTES = 4;

export const POLICY_WASM_PREVIEW_DRIVE_LAYOUT_ID = 0x1500_0015;

export type PolicyWasmPreviewDriveOutcome = 'completed' | 'stochastic' | 'depthCap' | 'failed';

export type PolicyWasmPreviewStatus =
  | 'ready'
  | 'stochastic'
  | 'hidden'
  | 'unresolved'
  | 'failed'
  | 'depthCap'
  | 'gated';

export type PolicyWasmPreviewBranch = 'none' | 'greedy' | 'continuedDeepening';

export type PolicyWasmDecisionStackFrameVariant =
  | 'actionSelection'
  | 'chooseOne'
  | 'chooseNStep'
  | 'stochasticResolve'
  | 'outcomeGrantResolve'
  | 'turnRetirement';

export interface PolicyWasmDecisionStackPublicationFrame {
  readonly frameId: number;
  readonly parentFrameId: number | null;
  readonly turnId: number;
  readonly depth: number;
  readonly variant: PolicyWasmDecisionStackFrameVariant;
  readonly contextId: string;
}

export interface PolicyWasmDecisionStackPublication {
  readonly maxDepth: number;
  readonly frames: readonly PolicyWasmDecisionStackPublicationFrame[];
}

export interface PolicyWasmPreviewSignalCarrier {
  readonly previewStatus: PolicyWasmPreviewStatus;
  readonly previewBranch: PolicyWasmPreviewBranch;
  readonly tiebreakAfterPreviewNoSignal: boolean;
  readonly policyPreviewSignalUnavailable: boolean;
}

export type PolicyWasmPreviewDriveUnsupportedClass =
  | 'gated'
  | 'hidden-sampling'
  | 'agent-guided-completion'
  | 'unsupported-effect'
  | 'unknown';

export type PolicyWasmPreviewDriveStep =
  | {
      readonly kind: 'addGlobal';
      readonly delta: number;
    }
  | {
      readonly kind: 'setGlobal';
      readonly value: number;
    }
  | {
      readonly kind: 'addPreviewSlot';
      readonly slotIndex: number;
      readonly delta: number;
    }
  | {
      readonly kind: 'setPreviewSlot';
      readonly slotIndex: number;
      readonly value: number;
    }
  | {
      readonly kind: 'applyCandidateDeltas';
      readonly candidateDeltas: readonly number[];
    }
  | {
      readonly kind: 'chooseOneGreedy';
      readonly seatId?: string;
      readonly turnId?: number;
      readonly optionDeltas: readonly number[];
    }
  | {
      readonly kind: 'chooseNGreedy';
      readonly min: number;
      readonly max: number;
      readonly seatId?: string;
      readonly turnId?: number;
      readonly optionDeltas: readonly number[];
    }
  | {
      readonly kind: 'stochastic';
    }
  | {
      readonly kind: 'unsupported';
      readonly unsupportedClass: PolicyWasmPreviewDriveUnsupportedClass;
      readonly owner?: string;
    };

export interface PolicyWasmPreviewDriveCandidate {
  readonly actionId: string;
  readonly stableMoveKey: string;
  readonly initialValue: number;
  readonly initialPreviewStateValues?: readonly number[];
  readonly previewBranch?: PolicyWasmPreviewBranch;
  readonly previewSignalCarrier?: PolicyWasmPreviewSignalCarrier;
  readonly decisionStackPublication?: PolicyWasmDecisionStackPublication;
}

export interface PolicyWasmPreviewDriveBatchInput {
  readonly profileId: string;
  readonly layoutId?: number;
  readonly expectedLayoutId?: number;
  readonly originSeatId: string;
  readonly originTurnId: number;
  readonly depthCap: number;
  readonly previewStateSlots?: readonly string[];
  readonly candidates: readonly PolicyWasmPreviewDriveCandidate[];
  readonly steps: readonly PolicyWasmPreviewDriveStep[];
}

export interface PolicyWasmPreviewDriveRow {
  readonly stableMoveKey: string;
  readonly outcome: PolicyWasmPreviewDriveOutcome;
  readonly depth: number;
  readonly value: number;
  readonly previewStateValues?: Readonly<Record<string, number>>;
  readonly previewSignalCarrier: PolicyWasmPreviewSignalCarrier;
  readonly decisionStackPublication?: PolicyWasmDecisionStackPublication;
}

export type PolicyWasmPreviewDriveResult =
  | {
      readonly kind: 'supported';
      readonly profileId: string;
      readonly rows: readonly PolicyWasmPreviewDriveRow[];
    }
  | {
      readonly kind: 'unsupported';
      readonly profileId: string;
      readonly candidateCount: number;
      readonly unsupportedDriveClass: PolicyWasmPreviewDriveUnsupportedClass;
      readonly unsupportedOwner?: string;
      readonly reason: string;
    };

export const encodePolicyWasmPreviewDriveInput = (
  input: PolicyWasmPreviewDriveBatchInput,
  abiMagic: number,
  abiVersion: number,
): Uint8Array => {
  const layoutId = input.layoutId ?? POLICY_WASM_PREVIEW_DRIVE_LAYOUT_ID;
  const expectedLayoutId = input.expectedLayoutId ?? layoutId;
  const decisionStackMaxDepth = maxDecisionStackPublicationDepth(input.candidates);
  const words = [
    abiMagic,
    abiVersion,
    expectedLayoutId,
    layoutId,
    input.candidates.length,
    input.depthCap,
    stablePayloadCode({ literal: input.originSeatId }),
    input.originTurnId,
    input.steps.length,
    input.previewStateSlots?.length ?? 0,
    decisionStackMaxDepth,
  ];
  for (const slot of input.previewStateSlots ?? []) {
    words.push(stablePayloadCode({ literal: slot }));
  }

  for (const candidate of input.candidates) {
    const initialPreviewStateValues = candidate.initialPreviewStateValues ?? [];
    if (initialPreviewStateValues.length !== (input.previewStateSlots?.length ?? 0)) {
      throw new Error('Policy WASM preview-drive candidate preview-state value count must match preview-state slot count.');
    }
    words.push(
      stablePayloadCode({ literal: candidate.actionId }),
      stablePayloadCode({ literal: candidate.stableMoveKey }),
      candidate.initialValue,
      ...initialPreviewStateValues,
      candidate.previewSignalCarrier === undefined ? 0 : 1,
      previewStatusCode(candidate.previewSignalCarrier?.previewStatus ?? 'ready'),
      previewBranchCode(candidate.previewSignalCarrier?.previewBranch ?? candidate.previewBranch ?? 'none'),
      candidate.previewSignalCarrier?.tiebreakAfterPreviewNoSignal === true ? 1 : 0,
      candidate.previewSignalCarrier?.policyPreviewSignalUnavailable === true ? 1 : 0,
    );
    encodeDecisionStackPublication(words, candidate, decisionStackMaxDepth);
  }
  for (const step of input.steps) {
    encodeStep(words, input, step);
  }

  const bytes = new Uint8Array(words.length * I32_BYTES);
  const view = new DataView(bytes.buffer);
  for (const [index, word] of words.entries()) {
    assertFiniteI32(`preview-drive word ${index}`, word);
    view.setInt32(index * I32_BYTES, word, true);
  }
  return bytes;
};

export const decodePolicyWasmPreviewDriveRows = (
  input: PolicyWasmPreviewDriveBatchInput,
  memory: ArrayBuffer,
  outOutcomesPtr: number,
  outDepthsPtr: number,
  outValuesPtr: number,
  outPreviewStatePtr: number,
  outPreviewStatusesPtr: number,
  outPreviewBranchesPtr: number,
  outTiebreakAfterPreviewNoSignalPtr: number,
  outPolicyPreviewSignalUnavailablePtr: number,
  outDecisionStackPublicationPtr: number,
  decisionStackMaxDepth: number,
): readonly PolicyWasmPreviewDriveRow[] => {
  const view = new DataView(memory);
  const slots = input.previewStateSlots ?? [];
  return input.candidates.map((candidate, index) => {
    const previewStateValues = slots.length === 0
      ? undefined
      : Object.fromEntries(slots.map((slot, slotIndex) => [
        slot,
        view.getInt32(outPreviewStatePtr + (((index * slots.length) + slotIndex) * I32_BYTES), true),
      ]));
    return {
      stableMoveKey: candidate.stableMoveKey,
      outcome: decodeOutcome(view.getInt32(outOutcomesPtr + (index * I32_BYTES), true)),
      depth: view.getInt32(outDepthsPtr + (index * I32_BYTES), true),
      value: view.getInt32(outValuesPtr + (index * I32_BYTES), true),
      previewSignalCarrier: {
        previewStatus: decodePreviewStatus(view.getInt32(outPreviewStatusesPtr + (index * I32_BYTES), true)),
        previewBranch: decodePreviewBranch(view.getInt32(outPreviewBranchesPtr + (index * I32_BYTES), true)),
        tiebreakAfterPreviewNoSignal: decodeBoolFlag(view.getInt32(outTiebreakAfterPreviewNoSignalPtr + (index * I32_BYTES), true)),
        policyPreviewSignalUnavailable: decodeBoolFlag(view.getInt32(outPolicyPreviewSignalUnavailablePtr + (index * I32_BYTES), true)),
      },
      ...(previewStateValues === undefined ? {} : { previewStateValues }),
      ...decodeDecisionStackPublication(
        input,
        view,
        outDecisionStackPublicationPtr,
        decisionStackMaxDepth,
        index,
      ),
    };
  });
};

export const firstUnsupportedPreviewDriveClass = (
  input: PolicyWasmPreviewDriveBatchInput,
): PolicyWasmPreviewDriveUnsupportedClass | undefined =>
  input.steps.find((step): step is Extract<PolicyWasmPreviewDriveStep, { readonly kind: 'unsupported' }> =>
    step.kind === 'unsupported',
  )?.unsupportedClass;

export const firstUnsupportedPreviewDriveOwner = (
  input: PolicyWasmPreviewDriveBatchInput,
): string | undefined =>
  input.steps.find((step): step is Extract<PolicyWasmPreviewDriveStep, { readonly kind: 'unsupported' }> =>
    step.kind === 'unsupported',
  )?.owner;

const encodeStep = (
  words: number[],
  input: PolicyWasmPreviewDriveBatchInput,
  step: PolicyWasmPreviewDriveStep,
): void => {
  switch (step.kind) {
    case 'addGlobal':
      words.push(1, step.delta);
      return;
    case 'setGlobal':
      words.push(7, step.value);
      return;
    case 'addPreviewSlot':
      words.push(8, step.slotIndex, step.delta);
      return;
    case 'setPreviewSlot':
      words.push(9, step.slotIndex, step.value);
      return;
    case 'applyCandidateDeltas':
      if (step.candidateDeltas.length !== input.candidates.length) {
        throw new Error('Policy WASM preview-drive candidate delta count must match candidate count.');
      }
      words.push(6, ...step.candidateDeltas);
      return;
    case 'chooseOneGreedy':
      words.push(
        2,
        stablePayloadCode({ literal: step.seatId ?? input.originSeatId }),
        step.turnId ?? input.originTurnId,
        step.optionDeltas.length,
        ...step.optionDeltas,
      );
      return;
    case 'chooseNGreedy':
      words.push(
        3,
        stablePayloadCode({ literal: step.seatId ?? input.originSeatId }),
        step.turnId ?? input.originTurnId,
        step.min,
        step.max,
        step.optionDeltas.length,
        ...step.optionDeltas,
      );
      return;
    case 'stochastic':
      words.push(4);
      return;
    case 'unsupported':
      words.push(5, unsupportedClassCode(step.unsupportedClass));
      return;
  }
};

const decodeOutcome = (code: number): PolicyWasmPreviewDriveOutcome => {
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
      throw new Error(`Policy WASM preview-drive returned unknown outcome ${code}.`);
  }
};

const previewStatusCode = (previewStatus: PolicyWasmPreviewStatus): number => {
  switch (previewStatus) {
    case 'ready':
      return 1;
    case 'stochastic':
      return 2;
    case 'hidden':
      return 3;
    case 'unresolved':
      return 4;
    case 'failed':
      return 5;
    case 'depthCap':
      return 6;
    case 'gated':
      return 7;
  }
};

const decodePreviewStatus = (code: number): PolicyWasmPreviewStatus => {
  switch (code) {
    case 1:
      return 'ready';
    case 2:
      return 'stochastic';
    case 3:
      return 'hidden';
    case 4:
      return 'unresolved';
    case 5:
      return 'failed';
    case 6:
      return 'depthCap';
    case 7:
      return 'gated';
    default:
      throw new Error(`Policy WASM preview-drive returned unknown preview status ${code}.`);
  }
};

const previewBranchCode = (previewBranch: PolicyWasmPreviewBranch): number => {
  switch (previewBranch) {
    case 'none':
      return 0;
    case 'greedy':
      return 1;
    case 'continuedDeepening':
      return 2;
  }
};

const decodePreviewBranch = (code: number): PolicyWasmPreviewBranch => {
  switch (code) {
    case 0:
      return 'none';
    case 1:
      return 'greedy';
    case 2:
      return 'continuedDeepening';
    default:
      throw new Error(`Policy WASM preview-drive returned unknown preview branch ${code}.`);
  }
};

const decodeBoolFlag = (code: number): boolean => {
  if (code === 0) {
    return false;
  }
  if (code === 1) {
    return true;
  }
  throw new Error(`Policy WASM preview-drive returned unknown boolean flag ${code}.`);
};

const unsupportedClassCode = (unsupportedClass: PolicyWasmPreviewDriveUnsupportedClass): number => {
  switch (unsupportedClass) {
    case 'gated':
      return 1;
    case 'hidden-sampling':
      return 2;
    case 'agent-guided-completion':
      return 3;
    case 'unsupported-effect':
      return 4;
    case 'unknown':
      return 5;
  }
};

const DECISION_STACK_FRAME_WORDS = 6;

export const policyWasmPreviewDriveDecisionStackFrameWords = (): number => DECISION_STACK_FRAME_WORDS;

const maxDecisionStackPublicationDepth = (
  candidates: readonly PolicyWasmPreviewDriveCandidate[],
): number => {
  let maxDepth = 0;
  for (const candidate of candidates) {
    const publication = candidate.decisionStackPublication;
    if (publication === undefined) {
      continue;
    }
    if (publication.maxDepth < 0 || !Number.isInteger(publication.maxDepth)) {
      throw new Error('Policy WASM decision-stack publication maxDepth must be a non-negative integer.');
    }
    if (publication.frames.length > publication.maxDepth) {
      throw new Error('Policy WASM decision-stack publication frame count must not exceed maxDepth.');
    }
    maxDepth = Math.max(maxDepth, publication.maxDepth);
  }
  return maxDepth;
};

const encodeDecisionStackPublication = (
  words: number[],
  candidate: PolicyWasmPreviewDriveCandidate,
  decisionStackMaxDepth: number,
): void => {
  const publication = candidate.decisionStackPublication;
  if (publication === undefined) {
    words.push(0, 0);
    return;
  }
  if (publication.maxDepth > decisionStackMaxDepth) {
    throw new Error('Policy WASM decision-stack publication maxDepth exceeds batch maxDepth.');
  }
  words.push(publication.maxDepth, publication.frames.length);
  let previousDepth = -1;
  for (const frame of publication.frames) {
    if (frame.depth <= previousDepth) {
      throw new Error('Policy WASM decision-stack publication frame depth must be strictly ordered.');
    }
    previousDepth = frame.depth;
    words.push(
      frame.frameId,
      frame.parentFrameId ?? -1,
      frame.turnId,
      frame.depth,
      decisionStackFrameVariantCode(frame.variant),
      stablePayloadCode({ literal: frame.contextId }),
    );
  }
};

const decodeDecisionStackPublication = (
  input: PolicyWasmPreviewDriveBatchInput,
  view: DataView,
  outDecisionStackPublicationPtr: number,
  decisionStackMaxDepth: number,
  candidateIndex: number,
): Pick<PolicyWasmPreviewDriveRow, 'decisionStackPublication'> => {
  const candidatePublication = input.candidates[candidateIndex]?.decisionStackPublication;
  if (candidatePublication === undefined || decisionStackMaxDepth === 0) {
    return {};
  }
  const frames: PolicyWasmDecisionStackPublicationFrame[] = [];
  const candidateBaseWord = candidateIndex * decisionStackMaxDepth * DECISION_STACK_FRAME_WORDS;
  for (let frameIndex = 0; frameIndex < candidatePublication.frames.length; frameIndex += 1) {
    const base = outDecisionStackPublicationPtr + ((candidateBaseWord + (frameIndex * DECISION_STACK_FRAME_WORDS)) * I32_BYTES);
    frames.push({
      frameId: view.getInt32(base, true),
      parentFrameId: decodeParentFrameId(view.getInt32(base + I32_BYTES, true)),
      turnId: view.getInt32(base + (2 * I32_BYTES), true),
      depth: view.getInt32(base + (3 * I32_BYTES), true),
      variant: decodeDecisionStackFrameVariant(view.getInt32(base + (4 * I32_BYTES), true)),
      contextId: candidatePublication.frames[frameIndex]!.contextId,
    });
    const contextCode = view.getInt32(base + (5 * I32_BYTES), true);
    const expectedContextCode = stablePayloadCode({ literal: candidatePublication.frames[frameIndex]!.contextId });
    if (contextCode !== expectedContextCode) {
      throw new Error(`Policy WASM decision-stack publication context code mismatch for candidate ${candidateIndex}, frame ${frameIndex}.`);
    }
  }
  return {
    decisionStackPublication: {
      maxDepth: candidatePublication.maxDepth,
      frames,
    },
  };
};

const decodeParentFrameId = (code: number): number | null => code === -1 ? null : code;

const decisionStackFrameVariantCode = (variant: PolicyWasmDecisionStackFrameVariant): number => {
  switch (variant) {
    case 'actionSelection':
      return 1;
    case 'chooseOne':
      return 2;
    case 'chooseNStep':
      return 3;
    case 'stochasticResolve':
      return 4;
    case 'outcomeGrantResolve':
      return 5;
    case 'turnRetirement':
      return 6;
  }
};

const decodeDecisionStackFrameVariant = (code: number): PolicyWasmDecisionStackFrameVariant => {
  switch (code) {
    case 1:
      return 'actionSelection';
    case 2:
      return 'chooseOne';
    case 3:
      return 'chooseNStep';
    case 4:
      return 'stochasticResolve';
    case 5:
      return 'outcomeGrantResolve';
    case 6:
      return 'turnRetirement';
    default:
      throw new Error(`Policy WASM preview-drive returned unknown decision-stack frame variant ${code}.`);
  }
};

const assertFiniteI32 = (label: string, value: number): void => {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new Error(`Policy WASM ${label} must be a signed 32-bit integer.`);
  }
};
