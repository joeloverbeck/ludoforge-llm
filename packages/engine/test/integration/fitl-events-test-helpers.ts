import type { EventEligibilityOverrideDef } from '../../src/kernel/index.js';

export type FactionRef = number | string;

export const createEligibilityOverride = ({
  target,
  eligible,
  windowId,
}: {
  target: 'self' | FactionRef;
  eligible: boolean;
  windowId: string;
}): EventEligibilityOverrideDef => (
  target === 'self'
    ? {
        target: { kind: 'active' },
        eligible,
        windowId,
      }
    : {
        target: { kind: 'seat', seat: String(target) },
        eligible,
        windowId,
      }
);
