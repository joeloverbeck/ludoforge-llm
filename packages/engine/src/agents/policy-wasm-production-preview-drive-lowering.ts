import type {
  PolicyWasmPreviewDriveBatchInput,
  PolicyWasmPreviewDriveStep,
} from './policy-wasm-preview-drive.js';
import type {
  PolicyWasmProductionPreviewDriveInput,
  PolicyWasmProductionPreviewDriveIrOp,
  PolicyWasmProductionPreviewDriveIrProgram,
} from './policy-wasm-production-preview-drive-types.js';

export const lowerProductionPreviewDriveIr = (
  input: PolicyWasmProductionPreviewDriveInput,
  program: PolicyWasmProductionPreviewDriveIrProgram,
): PolicyWasmPreviewDriveBatchInput => {
  const batch: PolicyWasmPreviewDriveBatchInput = {
    profileId: input.profileId,
    originSeatId: input.originSeatId,
    originTurnId: input.originTurnId,
    depthCap: input.depthCap,
    previewStateSlots: input.previewStateSlots,
    candidates: input.candidates.map((candidate) => ({
      actionId: candidate.actionId ?? String(candidate.move.actionId),
      stableMoveKey: candidate.stableMoveKey,
      initialValue: program.rootValues[0] ?? 0,
      initialPreviewStateValues: program.rootValues,
      ...(candidate.decisionStackPublication === undefined ? {} : { decisionStackPublication: candidate.decisionStackPublication }),
      ...(input.previewBranch === undefined ? {} : { previewBranch: input.previewBranch }),
      ...(program.previewSignalCarrier === undefined ? {} : { previewSignalCarrier: program.previewSignalCarrier }),
    })),
    steps: program.ops.flatMap(lowerProductionPreviewDriveIrOp),
  };
  return batch;
};

const lowerProductionPreviewDriveIrOp = (
  op: PolicyWasmProductionPreviewDriveIrOp,
): readonly PolicyWasmPreviewDriveStep[] => {
  switch (op.kind) {
    case 'applyCandidateDeltas':
      return op.candidateDeltas.some((delta) => delta !== 0)
        ? [{ kind: 'applyCandidateDeltas', candidateDeltas: op.candidateDeltas }]
        : [];
    case 'addGlobal':
      return [{ kind: 'addGlobal', delta: op.delta }];
    case 'setGlobal':
      return [{ kind: 'setGlobal', value: op.value }];
    case 'addPreviewSlot':
      return [{ kind: 'addPreviewSlot', slotIndex: op.slotIndex, delta: op.delta }];
    case 'setPreviewSlot':
      return [{ kind: 'setPreviewSlot', slotIndex: op.slotIndex, value: op.value }];
    case 'chooseOneGreedy':
      return [{ kind: 'chooseOneGreedy', optionDeltas: op.optionDeltas }];
    case 'chooseNGreedy':
      return [{ kind: 'chooseNGreedy', min: op.min, max: op.max, optionDeltas: op.optionDeltas }];
    case 'stochastic':
      return [{ kind: 'stochastic' }];
  }
};
