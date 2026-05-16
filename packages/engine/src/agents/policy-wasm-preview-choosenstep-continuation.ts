import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';
import type { GameState, MoveParamScalar } from '../kernel/index.js';
import type { Decision, MicroturnState } from '../kernel/microturn/types.js';
import { advanceChooseNStepContext } from '../kernel/microturn/publish.js';
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

const scalarCode = (value: MoveParamScalar): number =>
  stablePayloadCode({ literal: value });

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
  if (input.decision.command === 'confirm') {
    return unsupported(owner, 'chooseNStep confirm continuation materialization is deferred to production consumption');
  }
  if (input.decision.value === undefined) {
    return unsupported(owner, 'chooseNStep continuation add/remove commands require a scalar value');
  }
  const publishedDecision = input.microturn.legalActions.find((candidate): candidate is ChooseNStepDecision =>
    candidate.kind === 'chooseNStep'
    && candidate.decisionKey === input.decision.decisionKey
    && candidate.command === input.decision.command
    && candidate.value !== undefined
    && scalarCode(candidate.value as MoveParamScalar) === scalarCode(input.decision.value as MoveParamScalar));
  if (publishedDecision === undefined) {
    return unsupported(owner, 'candidate chooseNStep decision is not published as a legal continuation');
  }
  const advanced = advanceChooseNStepContext(top.context, input.decision);
  if (advanced.done) {
    return unsupported(owner, 'chooseNStep terminal continuation materialization is deferred to production consumption');
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
          value: input.decision.value as MoveParamScalar,
        }],
      },
    },
  };
};

const unsupported = (
  owner: string,
  reason: string,
): Extract<PolicyWasmChooseNStepContinuationLoweringResult, { readonly kind: 'unsupported' }> => ({
  kind: 'unsupported',
  unsupportedClass: 'unsupported-effect',
  owner,
  reason,
});
