import type {
  GrantLifecycleTransitionStep,
  TurnFlowGrantLifecycleTraceEntry,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';

type GrantLifecycleTraceGrant = Pick<
  TurnFlowPendingFreeOperationGrant,
  'grantId' | 'phase' | 'seat' | 'operationClass' | 'remainingUses'
>;

export const createGrantLifecycleTraceEntry = (
  step: GrantLifecycleTransitionStep,
  before: GrantLifecycleTraceGrant,
  after: GrantLifecycleTraceGrant,
): TurnFlowGrantLifecycleTraceEntry => ({
  kind: 'turnFlowGrantLifecycle',
  step,
  grantId: before.grantId,
  fromPhase: before.phase,
  toPhase: after.phase,
  seat: after.seat,
  operationClass: after.operationClass,
  remainingUsesBefore: before.remainingUses,
  remainingUsesAfter: after.remainingUses,
});
