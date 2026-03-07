// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuleState } from '@ludoforge/engine/runtime';

import { AvailabilitySection } from '../../src/ui/AvailabilitySection.js';

afterEach(cleanup);

function makeRuleState(overrides: Partial<RuleState> = {}): RuleState {
  return {
    available: true,
    blockers: [],
    activeModifierIndices: [],
    ...overrides,
  };
}

describe('AvailabilitySection', () => {
  it('renders section with correct data-testid', () => {
    render(createElement(AvailabilitySection, { ruleState: makeRuleState() }));
    expect(screen.getByTestId('availability-section')).toBeTruthy();
  });

  it('shows "Available" when ruleState.available is true', () => {
    render(createElement(AvailabilitySection, { ruleState: makeRuleState({ available: true }) }));
    const section = screen.getByTestId('availability-section');
    expect(section.textContent).toContain('Available');
  });

  it('shows "Blocked" when ruleState.available is false', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: false,
        blockers: [{ astPath: 'root', description: 'Need Aid >= 3' }],
      }),
    }));
    const section = screen.getByTestId('availability-section');
    expect(section.textContent).toContain('Blocked');
  });

  it('renders blocker reasons when blocked', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: false,
        blockers: [
          { astPath: 'root.0', description: 'Need Aid >= 3 (currently 1)' },
          { astPath: 'root.1', description: 'Need at least 1 US Troop in Available' },
        ],
      }),
    }));
    const list = screen.getByTestId('blocker-list');
    expect(list.children).toHaveLength(2);
    expect(list.textContent).toContain('Need Aid >= 3 (currently 1)');
    expect(list.textContent).toContain('Need at least 1 US Troop in Available');
  });

  it('does not render blocker list when available', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({ available: true }),
    }));
    expect(screen.queryByTestId('blocker-list')).toBeNull();
  });

  it('shows limit usage when present', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: true,
        limitUsage: { used: 1, max: 3 },
      }),
    }));
    const limit = screen.getByTestId('limit-usage');
    expect(limit.textContent).toContain('2 remaining this turn');
  });

  it('does not show limit usage when absent', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({ available: true }),
    }));
    expect(screen.queryByTestId('limit-usage')).toBeNull();
  });

  it('shows limit usage together with blocked state', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: false,
        blockers: [{ astPath: 'root', description: 'Blocked reason' }],
        limitUsage: { used: 2, max: 2 },
      }),
    }));
    const section = screen.getByTestId('availability-section');
    expect(section.textContent).toContain('Blocked');
    expect(section.textContent).toContain('0 remaining this turn');
  });
});
