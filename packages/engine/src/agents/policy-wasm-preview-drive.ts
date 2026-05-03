import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';

const I32_BYTES = 4;

export const POLICY_WASM_PREVIEW_DRIVE_LAYOUT_ID = 0x1500_0014;

export type PolicyWasmPreviewDriveOutcome = 'completed' | 'stochastic' | 'depthCap' | 'failed';

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
    );
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
      ...(previewStateValues === undefined ? {} : { previewStateValues }),
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

const assertFiniteI32 = (label: string, value: number): void => {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new Error(`Policy WASM ${label} must be a signed 32-bit integer.`);
  }
};
