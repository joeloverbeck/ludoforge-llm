import type { FreeOperationSequenceContextGrantLike } from './free-operation-sequence-context-contract.js';

export interface SequenceContextLinkageGrantReference {
  readonly batch: string;
  readonly step: number;
  readonly path: string;
  readonly captureKey?: string;
  readonly requireKey?: string;
}

export const collectSequenceContextLinkageGrantReference = (
  grant: FreeOperationSequenceContextGrantLike,
  path: string,
): SequenceContextLinkageGrantReference | null => {
  const sequence = grant.sequence;
  const sequenceContext = grant.sequenceContext;
  if (
    sequence === undefined
    || sequenceContext === undefined
    || typeof sequence.batch !== 'string'
  ) {
    return null;
  }

  const step = sequence.step;
  if (typeof step !== 'number' || !Number.isSafeInteger(step) || step < 0) {
    return null;
  }

  const captureKey =
    typeof sequenceContext.captureMoveZoneCandidatesAs === 'string'
      ? sequenceContext.captureMoveZoneCandidatesAs
      : undefined;
  const requireKey =
    typeof sequenceContext.requireMoveZoneCandidatesFrom === 'string'
      ? sequenceContext.requireMoveZoneCandidatesFrom
      : undefined;
  if (captureKey === undefined && requireKey === undefined) {
    return null;
  }

  return {
    batch: sequence.batch,
    step,
    path,
    ...(captureKey === undefined ? {} : { captureKey }),
    ...(requireKey === undefined ? {} : { requireKey }),
  };
};
