import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';
import type { GameState, MoveParamScalar } from '../kernel/index.js';
import type {
  PolicyWasmPreviewDriveBatchInput,
  PolicyWasmPreviewDriveCandidate,
  PolicyWasmPreviewDriveRow,
} from './policy-wasm-preview-drive.js';

export type PolicyWasmPreviewStatePatchScalar =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean };

export type PolicyWasmChooseNStepContinuationCommand = 'add' | 'remove' | 'confirm';

export type PolicyWasmPreviewStatePatchOp =
  | { readonly kind: 'setGlobalVar'; readonly varName: string; readonly value: PolicyWasmPreviewStatePatchScalar }
  | { readonly kind: 'setZoneVar'; readonly zoneId: string; readonly varName: string; readonly value: number }
  | { readonly kind: 'moveToken'; readonly tokenId: string; readonly fromZoneId: string; readonly toZoneId: string; readonly position?: 'top' | 'bottom' }
  | { readonly kind: 'setTokenProp'; readonly tokenId: string; readonly prop: string; readonly value: PolicyWasmPreviewStatePatchScalar }
  | { readonly kind: 'setMarker'; readonly zoneId: string; readonly marker: string; readonly state: string }
  | { readonly kind: 'setActionUsage'; readonly actionId: string; readonly turnCount: number; readonly phaseCount: number; readonly gameCount: number }
  | { readonly kind: 'setMicroturnMetadata'; readonly nextFrameId: number; readonly nextTurnId: number }
  | {
      readonly kind: 'applyChooseNStepDecision';
      readonly frameId: NonNullable<GameState['decisionStack']>[number]['frameId'];
      readonly decisionKey: string;
      readonly command: PolicyWasmChooseNStepContinuationCommand;
      readonly value?: MoveParamScalar;
    };

export interface PolicyWasmPreviewStatePatch {
  readonly ops: readonly PolicyWasmPreviewStatePatchOp[];
}

const I32_BYTES = 4;
const STATE_PATCH_OP_WORDS = 5;

export const policyWasmPreviewDriveStatePatchOpWords = (): number => STATE_PATCH_OP_WORDS;

export const maxStatePatchOpCount = (
  candidates: readonly PolicyWasmPreviewDriveCandidate[],
  depthCap: number,
): number => {
  const max = candidates.reduce((count, candidate) => Math.max(count, candidate.statePatch?.ops.length ?? 0), 0);
  if (max > depthCap) {
    throw new Error('Policy WASM preview-drive state-patch op count must not exceed depth cap.');
  }
  return max;
};

export const encodeStatePatch = (
  words: number[],
  candidate: PolicyWasmPreviewDriveCandidate,
  statePatchMaxOpCount: number,
  materializeStatePatch: boolean,
): void => {
  if (!materializeStatePatch) {
    return;
  }
  const ops = candidate.statePatch?.ops;
  if (ops === undefined) {
    throw new Error('Policy WASM preview-drive materialized state patch is required for every candidate.');
  }
  if (ops.length > statePatchMaxOpCount) {
    throw new Error('Policy WASM preview-drive state-patch op count exceeds batch maximum.');
  }
  words.push(ops.length);
  for (const op of ops) {
    words.push(...encodeStatePatchOp(op));
  }
};

export const decodeStatePatch = (
  input: PolicyWasmPreviewDriveBatchInput,
  view: DataView,
  outStatePatchCountsPtr: number,
  outStatePatchOpsPtr: number,
  statePatchMaxOpCount: number,
  candidateIndex: number,
): Pick<PolicyWasmPreviewDriveRow, 'statePatch'> => {
  if (input.materializeStatePatch !== true) {
    return {};
  }
  const opCount = view.getInt32(outStatePatchCountsPtr + (candidateIndex * I32_BYTES), true);
  if (opCount < 0 || opCount > statePatchMaxOpCount) {
    throw new Error(`Policy WASM preview-drive returned invalid state-patch op count for candidate ${candidateIndex}.`);
  }
  const expectedPatch = input.candidates[candidateIndex]?.statePatch;
  if (expectedPatch === undefined || expectedPatch.ops.length !== opCount) {
    throw new Error(`Policy WASM preview-drive state-patch op count mismatch for candidate ${candidateIndex}.`);
  }
  const ops = Array.from({ length: opCount }, (_entry, opIndex) =>
    decodeStatePatchOp(input, expectedPatch.ops[opIndex]!, view, outStatePatchOpsPtr, statePatchMaxOpCount, candidateIndex, opIndex));
  return { statePatch: { ops } };
};

const encodeStatePatchOp = (op: PolicyWasmPreviewStatePatchOp): readonly number[] => {
  switch (op.kind) {
    case 'setGlobalVar': {
      const [tag, value] = encodeStatePatchScalar(op.value);
      return [1, stablePayloadCode({ literal: op.varName }), tag, value, 0];
    }
    case 'setZoneVar':
      return [2, stablePayloadCode({ literal: op.zoneId }), stablePayloadCode({ literal: op.varName }), op.value, 0];
    case 'moveToken':
      return [
        3,
        stablePayloadCode({ literal: op.tokenId }),
        stablePayloadCode({ literal: op.fromZoneId }),
        stablePayloadCode({ literal: op.toZoneId }),
        statePatchPositionCode(op.position),
      ];
    case 'setTokenProp': {
      const [tag, value] = encodeStatePatchScalar(op.value);
      return [4, stablePayloadCode({ literal: op.tokenId }), stablePayloadCode({ literal: op.prop }), tag, value];
    }
    case 'setMarker':
      return [5, stablePayloadCode({ literal: op.zoneId }), stablePayloadCode({ literal: op.marker }), stablePayloadCode({ literal: op.state }), 0];
    case 'setActionUsage':
      return [6, stablePayloadCode({ literal: op.actionId }), op.turnCount, op.phaseCount, op.gameCount];
    case 'setMicroturnMetadata':
      return [7, op.nextFrameId, op.nextTurnId, 0, 0];
    case 'applyChooseNStepDecision':
      return [
        8,
        op.frameId,
        stablePayloadCode({ literal: op.decisionKey }),
        chooseNStepCommandCode(op.command),
        op.value === undefined ? 0 : stablePayloadCode({ literal: op.value }),
      ];
  }
};

const decodeStatePatchOp = (
  input: PolicyWasmPreviewDriveBatchInput,
  expected: PolicyWasmPreviewStatePatchOp,
  view: DataView,
  outStatePatchOpsPtr: number,
  statePatchMaxOpCount: number,
  candidateIndex: number,
  opIndex: number,
): PolicyWasmPreviewStatePatchOp => {
  const base = outStatePatchOpsPtr + (((candidateIndex * statePatchMaxOpCount) + opIndex) * STATE_PATCH_OP_WORDS * I32_BYTES);
  const actual = Array.from({ length: STATE_PATCH_OP_WORDS }, (_entry, wordIndex) =>
    view.getInt32(base + (wordIndex * I32_BYTES), true));
  const expectedWords = encodeStatePatchOp(expected);
  if (!actual.every((word, wordIndex) => word === expectedWords[wordIndex])) {
    throw new Error(`Policy WASM preview-drive state-patch op mismatch for candidate ${candidateIndex}, op ${opIndex}.`);
  }
  return expected;
};

const encodeStatePatchScalar = (value: PolicyWasmPreviewStatePatchScalar): readonly [number, number] => {
  switch (value.kind) {
    case 'number':
      assertFiniteI32('state-patch scalar', value.value);
      return [1, value.value];
    case 'boolean':
      return [value.value ? 3 : 2, value.value ? 1 : 0];
  }
};

const chooseNStepCommandCode = (command: PolicyWasmChooseNStepContinuationCommand): number => {
  switch (command) {
    case 'add':
      return 1;
    case 'remove':
      return 2;
    case 'confirm':
      return 3;
  }
};

const statePatchPositionCode = (position: 'top' | 'bottom' | undefined): number => {
  switch (position) {
    case undefined:
    case 'top':
      return 0;
    case 'bottom':
      return 1;
  }
};

const assertFiniteI32 = (label: string, value: number): void => {
  if (!Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw new Error(`Policy WASM preview-drive ${label} must be a finite i32.`);
  }
};
