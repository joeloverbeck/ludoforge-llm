import type { EventEligibilityOverrideDef } from '../../src/kernel/index.js';

export type FactionRef = number | string;

const SEAT_BY_INDEX: Readonly<Record<number, string>> = {
  0: 'US',
  1: 'ARVN',
  2: 'NVA',
  3: 'VC',
};

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
        target: { kind: 'seat', seat: typeof target === 'number' ? (SEAT_BY_INDEX[target] ?? String(target)) : String(target) },
        eligible,
        windowId,
      }
);
