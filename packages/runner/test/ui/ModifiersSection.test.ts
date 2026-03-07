// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentModifier } from '@ludoforge/engine/runtime';

import { ModifiersSection } from '../../src/ui/ModifiersSection.js';

afterEach(cleanup);

function makeModifiers(count: number): ContentModifier[] {
  return Array.from({ length: count }, (_, i) => ({
    condition: `Condition ${i + 1}`,
    description: `Description ${i + 1}`,
  }));
}

describe('ModifiersSection', () => {
  it('returns null when modifiers array is empty', () => {
    const { container } = render(
      createElement(ModifiersSection, { modifiers: [], activeModifierIndices: [] }),
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders section with correct data-testid', () => {
    render(createElement(ModifiersSection, {
      modifiers: makeModifiers(1),
      activeModifierIndices: [],
    }));
    expect(screen.getByTestId('modifiers-section')).toBeTruthy();
  });

  it('starts expanded when <=2 modifiers and none active', () => {
    render(createElement(ModifiersSection, {
      modifiers: makeModifiers(2),
      activeModifierIndices: [],
    }));
    expect(screen.getByTestId('modifiers-list')).toBeTruthy();
  });

  it('starts collapsed when >2 modifiers and none active', () => {
    render(createElement(ModifiersSection, {
      modifiers: makeModifiers(3),
      activeModifierIndices: [],
    }));
    expect(screen.queryByTestId('modifiers-list')).toBeNull();
  });

  it('starts expanded when >2 modifiers but some are active', () => {
    render(createElement(ModifiersSection, {
      modifiers: makeModifiers(4),
      activeModifierIndices: [1],
    }));
    expect(screen.getByTestId('modifiers-list')).toBeTruthy();
  });

  it('shows active count in header', () => {
    render(createElement(ModifiersSection, {
      modifiers: makeModifiers(3),
      activeModifierIndices: [0, 2],
    }));
    const toggle = screen.getByTestId('modifiers-toggle');
    expect(toggle.textContent).toContain('2 active');
  });

  it('highlights active modifiers with checkmark', () => {
    render(createElement(ModifiersSection, {
      modifiers: makeModifiers(2),
      activeModifierIndices: [0],
    }));
    const activeItems = screen.getAllByTestId('modifier-active');
    expect(activeItems).toHaveLength(1);
    expect(activeItems[0]!.textContent).toContain('\u2713');
    expect(activeItems[0]!.textContent).toContain('Condition 1');
  });

  it('renders inactive modifiers without checkmark', () => {
    render(createElement(ModifiersSection, {
      modifiers: makeModifiers(2),
      activeModifierIndices: [0],
    }));
    const inactiveItems = screen.getAllByTestId('modifier-inactive');
    expect(inactiveItems).toHaveLength(1);
    expect(inactiveItems[0]!.textContent).not.toContain('\u2713');
    expect(inactiveItems[0]!.textContent).toContain('Condition 2');
  });

  it('toggles expand/collapse on header click', () => {
    render(createElement(ModifiersSection, {
      modifiers: makeModifiers(3),
      activeModifierIndices: [],
    }));

    // Starts collapsed
    expect(screen.queryByTestId('modifiers-list')).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByTestId('modifiers-toggle'));
    expect(screen.getByTestId('modifiers-list')).toBeTruthy();

    // Click to collapse
    fireEvent.click(screen.getByTestId('modifiers-toggle'));
    expect(screen.queryByTestId('modifiers-list')).toBeNull();
  });

  it('sets aria-expanded attribute on toggle button', () => {
    render(createElement(ModifiersSection, {
      modifiers: makeModifiers(2),
      activeModifierIndices: [],
    }));
    const toggle = screen.getByTestId('modifiers-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
