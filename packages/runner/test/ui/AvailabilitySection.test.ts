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
        limitUsage: [{ id: 'a::turn::0', scope: 'turn', used: 1, max: 3 }],
      }),
    }));
    const limits = screen.getAllByTestId('limit-usage-item');
    expect(limits).toHaveLength(1);
    expect(limits[0]?.textContent).toContain('2 remaining this turn');
  });

  it('renders phase and game scope labels for limit usage', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: true,
        limitUsage: [
          { id: 'a::phase::0', scope: 'phase', used: 1, max: 2 },
          { id: 'a::game::1', scope: 'game', used: 2, max: 5 },
        ],
      }),
    }));
    const limits = screen.getAllByTestId('limit-usage-item');
    expect(limits).toHaveLength(2);
    expect(limits[0]?.textContent).toContain('1 remaining this phase');
    expect(limits[1]?.textContent).toContain('3 remaining total');
  });

  it('renders one line per limit for multi-limit actions', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: true,
        limitUsage: [
          { id: 'a::turn::0', scope: 'turn', used: 0, max: 1 },
          { id: 'a::game::1', scope: 'game', used: 2, max: 3 },
        ],
      }),
    }));
    const list = screen.getByTestId('limit-usage-list');
    expect(list.tagName).toBe('UL');
    const limits = screen.getAllByTestId('limit-usage-item');
    expect(limits).toHaveLength(2);
    expect(limits[0]?.tagName).toBe('LI');
    expect(limits[1]?.tagName).toBe('LI');
    expect(limits[0]?.textContent).toContain('1 remaining this turn');
    expect(limits[1]?.textContent).toContain('1 remaining total');
  });

  it('does not show limit usage when absent', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({ available: true }),
    }));
    expect(screen.queryByTestId('limit-usage-item')).toBeNull();
  });

  it('does not show limit usage when limit usage is empty array', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: true,
        limitUsage: [],
      }),
    }));
    expect(screen.queryByTestId('limit-usage-list')).toBeNull();
    expect(screen.queryByTestId('limit-usage-item')).toBeNull();
  });

  it('keeps limit rows mounted when usage values change', () => {
    const { rerender } = render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: true,
        limitUsage: [
          { id: 'a::turn::0', scope: 'turn', used: 0, max: 1 },
          { id: 'a::game::1', scope: 'game', used: 1, max: 3 },
        ],
      }),
    }));
    const before = screen.getAllByTestId('limit-usage-item');

    rerender(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: true,
        limitUsage: [
          { id: 'a::turn::0', scope: 'turn', used: 1, max: 1 },
          { id: 'a::game::1', scope: 'game', used: 2, max: 3 },
        ],
      }),
    }));

    const after = screen.getAllByTestId('limit-usage-item');
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[0]?.textContent).toContain('0 remaining this turn');
    expect(after[1]?.textContent).toContain('1 remaining total');
  });

  it('shows limit usage together with blocked state', () => {
    render(createElement(AvailabilitySection, {
      ruleState: makeRuleState({
        available: false,
        blockers: [{ astPath: 'root', description: 'Blocked reason' }],
        limitUsage: [{ id: 'a::turn::0', scope: 'turn', used: 2, max: 2 }],
      }),
    }));
    const section = screen.getByTestId('availability-section');
    expect(section.textContent).toContain('Blocked');
    expect(section.textContent).toContain('0 remaining this turn');
  });
});
