import type { GameDef, GameState } from '../../../../src/kernel/index.js';
import type { Probe, ProbeAssertion, ProbeMatch, ProbeOutcome } from '../probe-types.js';
import { evaluateActionFamilyDistributionBelow } from './action-family-distribution-below.js';
import { assertNever } from './common.js';
import { evaluateGuardrailFired } from './guardrail-fired.js';
import { evaluateGuardrailFiresUniformAcross } from './guardrail-fires-uniform-across.js';
import { evaluateGuardrailNotFired } from './guardrail-not-fired.js';
import { evaluateModuleActiveContributionRateAtLeast } from './module-active-contribution-rate-at-least.js';
import { evaluatePreviewRefStatusIn } from './preview-ref-status-in.js';
import { evaluatePublishedFrontierConstructible } from './published-frontier-constructible.js';
import { evaluateSelectedCandidateHasTag } from './selected-candidate-has-tag.js';
import { evaluateSelectedCandidateLacksTag } from './selected-candidate-lacks-tag.js';
import { evaluateSelectedCandidateRankWithinTopK } from './selected-candidate-rank-within-top-k.js';
import { evaluateSelectedNotByReason } from './selected-not-by-reason.js';
import { evaluateSelectedSeatTargetMatchesRole } from './selected-seat-target-matches-role.js';
import { evaluateSelectedTargetSatisfiesSelector } from './selected-target-satisfies-selector.js';
import { evaluateTraceContainsField } from './trace-contains-field.js';
import { evaluateTraceHasAdvisory } from './trace-has-advisory.js';
import { evaluateTraceLacksAdvisory } from './trace-lacks-advisory.js';

export const dispatchAssertion = (
  assertion: ProbeAssertion,
  context: {
    readonly probe: Probe;
    readonly matches: readonly ProbeMatch[];
    readonly def?: GameDef;
    readonly state?: GameState;
  },
): ProbeOutcome => {
  switch (assertion.kind) {
    case 'selectedCandidateHasTag':
      return evaluateSelectedCandidateHasTag({ ...context, assertion });
    case 'selectedCandidateLacksTag':
      return evaluateSelectedCandidateLacksTag({ ...context, assertion });
    case 'selectedCandidateRankWithinTopK':
      return evaluateSelectedCandidateRankWithinTopK({ ...context, assertion });
    case 'selectedTargetSatisfiesSelector':
      return evaluateSelectedTargetSatisfiesSelector({ ...context, assertion });
    case 'selectedSeatTargetMatchesRole':
      return evaluateSelectedSeatTargetMatchesRole({ ...context, assertion });
    case 'previewRefStatusIn':
      return evaluatePreviewRefStatusIn({ ...context, assertion });
    case 'selectedNotByReason':
      return evaluateSelectedNotByReason({ ...context, assertion });
    case 'actionFamilyDistributionBelow':
      return evaluateActionFamilyDistributionBelow({ ...context, assertion });
    case 'moduleActiveContributionRateAtLeast':
      return evaluateModuleActiveContributionRateAtLeast({ ...context, assertion });
    case 'traceContainsField':
      return evaluateTraceContainsField({ ...context, assertion });
    case 'traceHasAdvisory':
      return evaluateTraceHasAdvisory({ ...context, assertion });
    case 'traceLacksAdvisory':
      return evaluateTraceLacksAdvisory({ ...context, assertion });
    case 'publishedFrontierConstructible':
      return evaluatePublishedFrontierConstructible({ ...context, assertion });
    case 'guardrailFired':
      return evaluateGuardrailFired({ ...context, assertion });
    case 'guardrailNotFired':
      return evaluateGuardrailNotFired({ ...context, assertion });
    case 'guardrailFiresUniformAcross':
      return evaluateGuardrailFiresUniformAcross({ ...context, assertion });
    default:
      return assertNever(assertion);
  }
};
