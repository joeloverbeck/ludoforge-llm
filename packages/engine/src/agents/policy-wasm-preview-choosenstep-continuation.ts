import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';
import type { GameState, MoveParamScalar } from '../kernel/index.js';
import type { Decision, MicroturnState } from '../kernel/microturn/types.js';
import type {
  PolicyWasmPreviewDriveCandidate,
  PolicyWasmPreviewDriveUnsupportedClass,
  PolicyWasmPreviewSignalCarrier,
} from './policy-wasm-preview-drive.js';

type ChooseNStepDecision = Extract<Decision, { readonly kind: 'chooseNStep' }>;
type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: Extract<MicroturnState['decisionContext'], { readonly kind: 'chooseNStep' }>;
};
type ChooseOneDecision = Extract<Decision, { readonly kind: 'chooseOne' }>;
type ChooseOneMicroturn = MicroturnState & {
  readonly kind: 'chooseOne';
  readonly decisionContext: Extract<MicroturnState['decisionContext'], { readonly kind: 'chooseOne' }>;
};
type SupportedContinuationDecision = ChooseNStepDecision | ChooseOneDecision;
type SupportedContinuationMicroturn = ChooseNStepMicroturn | ChooseOneMicroturn;

export type PolicyWasmChooseNStepContinuationLoweringResult =
  | { readonly kind: 'supported'; readonly candidate: PolicyWasmPreviewDriveCandidate }
  | {
      readonly kind: 'unsupported';
      readonly unsupportedClass: PolicyWasmPreviewDriveUnsupportedClass;
      readonly owner: string;
      readonly reason: string;
    };

export const chooseNStepContinuationStableKey = (
  decision: ChooseNStepDecision,
): string => `${decision.kind}:${String(decision.decisionKey)}:${decision.command}:${JSON.stringify(decision.value ?? null)}`;

const chooseOneContinuationStableKey = (
  decision: ChooseOneDecision,
): string => `${decision.kind}:${String(decision.decisionKey)}:${JSON.stringify(decision.value)}`;

const scalarCode = (value: MoveParamScalar): number =>
  stablePayloadCode({ literal: value });

export const lowerPolicyWasmDeepContinuationDecision = (
  input: {
    readonly state: GameState;
    readonly microturn: SupportedContinuationMicroturn;
    readonly decision: SupportedContinuationDecision;
    readonly initialValue?: number;
    readonly previewSignalCarrier?: PolicyWasmPreviewSignalCarrier;
  },
): PolicyWasmChooseNStepContinuationLoweringResult => {
  if (input.microturn.kind === 'chooseOne' && input.decision.kind === 'chooseOne') {
    return lowerPolicyWasmChooseOneContinuation({
      ...input,
      microturn: input.microturn,
      decision: input.decision,
    });
  }
  if (input.microturn.kind === 'chooseNStep' && input.decision.kind === 'chooseNStep') {
    return lowerPolicyWasmChooseNStepContinuation({
      ...input,
      microturn: input.microturn,
      decision: input.decision,
    });
  }
  return unsupported('production-preview-drive.continuation', 'candidate decision kind does not match published continuation');
};

export const lowerPolicyWasmChooseNStepContinuation = (
  input: {
    readonly state: GameState;
    readonly microturn: ChooseNStepMicroturn;
    readonly decision: ChooseNStepDecision;
    readonly initialValue?: number;
    readonly previewSignalCarrier?: PolicyWasmPreviewSignalCarrier;
  },
): PolicyWasmChooseNStepContinuationLoweringResult => {
  const owner = 'production-preview-drive.chooseNStepContinuation';
  const top = input.state.decisionStack?.at(-1);
  if (top === undefined || top.context.kind !== 'chooseNStep') {
    return unsupported(owner, 'source state does not contain a chooseNStep continuation frame');
  }
  if (top.frameId !== input.microturn.frameId || top.context.decisionKey !== input.microturn.decisionContext.decisionKey) {
    return unsupported(owner, 'published chooseNStep continuation identity does not match source state');
  }
  if (input.decision.decisionKey !== input.microturn.decisionContext.decisionKey) {
    return unsupported(owner, 'candidate chooseNStep decision key does not match published continuation');
  }
  if (input.decision.command !== 'confirm' && input.decision.value === undefined) {
    return unsupported(owner, 'chooseNStep continuation add/remove commands require a scalar value');
  }
  const publishedDecision = input.microturn.legalActions.find((candidate): candidate is ChooseNStepDecision =>
    candidate.kind === 'chooseNStep'
    && candidate.decisionKey === input.decision.decisionKey
    && candidate.command === input.decision.command
    && (input.decision.command === 'confirm'
      ? candidate.value === undefined
      : candidate.value !== undefined
        && input.decision.value !== undefined
        && scalarCode(candidate.value as MoveParamScalar) === scalarCode(input.decision.value as MoveParamScalar)));
  if (publishedDecision === undefined) {
    return unsupported(owner, 'candidate chooseNStep decision is not published as a legal continuation');
  }
  const stableMoveKey = chooseNStepContinuationStableKey(input.decision);
  return {
    kind: 'supported',
    candidate: {
      actionId: `chooseNStep:${String(input.decision.decisionKey)}`,
      stableMoveKey,
      initialValue: input.initialValue ?? 0,
      ...(input.previewSignalCarrier === undefined ? {} : { previewSignalCarrier: input.previewSignalCarrier }),
      statePatch: {
        ops: [{
          kind: 'applyChooseNStepDecision',
          frameId: input.microturn.frameId,
          decisionKey: String(input.decision.decisionKey),
          command: input.decision.command,
          ...(input.decision.value === undefined ? {} : { value: input.decision.value as MoveParamScalar }),
        }],
      },
    },
  };
};

const lowerPolicyWasmChooseOneContinuation = (
  input: {
    readonly state: GameState;
    readonly microturn: ChooseOneMicroturn;
    readonly decision: ChooseOneDecision;
    readonly initialValue?: number;
    readonly previewSignalCarrier?: PolicyWasmPreviewSignalCarrier;
  },
): PolicyWasmChooseNStepContinuationLoweringResult => {
  const owner = 'production-preview-drive.chooseOneContinuation';
  const top = input.state.decisionStack?.at(-1);
  if (top === undefined || top.context.kind !== 'chooseOne') {
    return unsupported(owner, 'source state does not contain a chooseOne continuation frame');
  }
  if (top.frameId !== input.microturn.frameId || top.context.decisionKey !== input.microturn.decisionContext.decisionKey) {
    return unsupported(owner, 'published chooseOne continuation identity does not match source state');
  }
  if (input.decision.decisionKey !== input.microturn.decisionContext.decisionKey) {
    return unsupported(owner, 'candidate chooseOne decision key does not match published continuation');
  }
  if (!isMoveParamScalar(input.decision.value)) {
    return unsupported(owner, 'chooseOne continuation decisions require a scalar value');
  }
  const publishedDecision = input.microturn.legalActions.find((candidate): candidate is ChooseOneDecision =>
    candidate.kind === 'chooseOne'
    && candidate.decisionKey === input.decision.decisionKey
    && isMoveParamScalar(candidate.value)
    && scalarCode(candidate.value) === scalarCode(input.decision.value as MoveParamScalar));
  if (publishedDecision === undefined) {
    return unsupported(owner, 'candidate chooseOne decision is not published as a legal continuation');
  }
  const stableMoveKey = chooseOneContinuationStableKey(input.decision);
  return {
    kind: 'supported',
    candidate: {
      actionId: `chooseOne:${String(input.decision.decisionKey)}`,
      stableMoveKey,
      initialValue: input.initialValue ?? 0,
      ...(input.previewSignalCarrier === undefined ? {} : { previewSignalCarrier: input.previewSignalCarrier }),
      statePatch: {
        ops: [{
          kind: 'applyChooseOneDecision',
          frameId: input.microturn.frameId,
          decisionKey: String(input.decision.decisionKey),
          value: input.decision.value,
        }],
      },
    },
  };
};

const isMoveParamScalar = (value: unknown): value is MoveParamScalar =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const unsupported = (
  owner: string,
  reason: string,
): Extract<PolicyWasmChooseNStepContinuationLoweringResult, { readonly kind: 'unsupported' }> => ({
  kind: 'unsupported',
  unsupportedClass: 'unsupported-effect',
  owner,
  reason,
});
