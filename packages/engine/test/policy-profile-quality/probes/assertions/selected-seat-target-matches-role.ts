import type { ProbeOutcome } from '../probe-types.js';
import { resolvePolicyStandingRoleSelector } from '../../../../src/agents/policy-surface.js';
import { fail, getDottedField, pass, requireSingleMatch, type AssertionContext } from './common.js';

const TARGET_PARAM_KEYS = ['targetSeat', 'seatId', 'player', 'targetPlayer'] as const;

export const evaluateSelectedSeatTargetMatchesRole = (context: AssertionContext): ProbeOutcome => {
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const assertion = context.assertion;
  if (assertion.kind !== 'selectedSeatTargetMatchesRole') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const expected = context.def === undefined || context.state === undefined
    ? undefined
    : resolvePolicyStandingRoleSelector(context.def, context.state, assertion.role, context.probe.seat);
  const expectedFromTrace = getDottedField(match.trace, `stateFeatures.standingRole.${assertion.role}`)
    ?? getDottedField(match.trace, `standingRoles.${assertion.role}.seatId`);
  const expectedSeat = typeof expected === 'string' ? expected : expectedFromTrace;
  if (typeof expectedSeat !== 'string') {
    return fail(assertion, `standing role \`${assertion.role}\` was not present in trace`);
  }
  const params = match.selectedDecision.kind === 'actionSelection'
    ? match.selectedDecision.move?.params
    : undefined;
  const actual = TARGET_PARAM_KEYS
    .map((key) => params?.[key])
    .find((value): value is string => typeof value === 'string');
  return actual === expectedSeat
    ? pass()
    : fail(assertion, `selected target seat ${String(actual)} did not match ${assertion.role}=${expectedSeat}`);
};
