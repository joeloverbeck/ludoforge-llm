export type FactionRef = number | string;
type EligibilityRef = 'eligible' | 'ineligible';

const stringifyFactionRef = (value: FactionRef): string => String(value);

export const FITL_NO_OVERRIDE = 'none';

export const createEligibilityOverrideDirective = ({
  target,
  eligibility,
  windowId,
}: {
  target: 'self' | FactionRef;
  eligibility: EligibilityRef;
  windowId: string;
}): string => `eligibilityOverride:${target === 'self' ? 'self' : stringifyFactionRef(target)}:${eligibility}:${windowId}`;
