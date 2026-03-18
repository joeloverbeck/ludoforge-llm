// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { RenderEventCard } from '../../src/model/render-model.js';
import { EventCardTooltip } from '../../src/ui/EventCardTooltip.js';

function makeCard(overrides: Partial<RenderEventCard> = {}): RenderEventCard {
  return {
    id: 'card-1',
    title: 'Containment',
    orderNumber: 5,
    eligibility: null,
    sideMode: 'dual',
    unshadedText: 'Aid +6.',
    shadedText: 'NVA Resources +6.',
    ...overrides,
  };
}

function createAnchorElement(): HTMLElement {
  return document.createElement('div');
}

describe('EventCardTooltip', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders card title and order number', () => {
    render(createElement(EventCardTooltip, {
      card: makeCard(),
      anchorElement: createAnchorElement(),
    }));

    expect(screen.getByTestId('event-card-tooltip-title').textContent).toBe('Containment');
    expect(screen.getByTestId('event-card-tooltip-number').textContent).toBe('#5');
  });

  it('renders dual badge for dual-side cards', () => {
    render(createElement(EventCardTooltip, {
      card: makeCard({ sideMode: 'dual' }),
      anchorElement: createAnchorElement(),
    }));

    expect(screen.getByTestId('event-card-tooltip-badge').textContent).toBe('Dual');
  });

  it('renders single badge for single-side cards', () => {
    render(createElement(EventCardTooltip, {
      card: makeCard({ sideMode: 'single', shadedText: null }),
      anchorElement: createAnchorElement(),
    }));

    expect(screen.getByTestId('event-card-tooltip-badge').textContent).toBe('Single');
  });

  it('renders both unshaded and shaded text for dual cards', () => {
    render(createElement(EventCardTooltip, {
      card: makeCard({ unshadedText: 'Aid +6.', shadedText: 'NVA Resources +6.' }),
      anchorElement: createAnchorElement(),
    }));

    const unshadedSection = screen.getByTestId('event-card-tooltip-unshaded');
    const shadedSection = screen.getByTestId('event-card-tooltip-shaded');

    expect(unshadedSection.textContent).toContain('Aid +6.');
    expect(shadedSection.textContent).toContain('NVA Resources +6.');
  });

  it('renders only unshaded text when shaded is null', () => {
    render(createElement(EventCardTooltip, {
      card: makeCard({ unshadedText: 'Some effect', shadedText: null }),
      anchorElement: createAnchorElement(),
    }));

    expect(screen.getByTestId('event-card-tooltip-unshaded').textContent).toContain('Some effect');
    expect(screen.queryByTestId('event-card-tooltip-shaded')).toBeNull();
  });

  it('renders only shaded text when unshaded is null', () => {
    render(createElement(EventCardTooltip, {
      card: makeCard({ unshadedText: null, shadedText: 'Dark effect' }),
      anchorElement: createAnchorElement(),
    }));

    expect(screen.queryByTestId('event-card-tooltip-unshaded')).toBeNull();
    expect(screen.getByTestId('event-card-tooltip-shaded').textContent).toContain('Dark effect');
  });

  it('returns null when both text fields are null', () => {
    const { container } = render(createElement(EventCardTooltip, {
      card: makeCard({ unshadedText: null, shadedText: null }),
      anchorElement: createAnchorElement(),
    }));

    expect(container.innerHTML).toBe('');
  });

  it('does not render order number when orderNumber is null', () => {
    render(createElement(EventCardTooltip, {
      card: makeCard({ orderNumber: null }),
      anchorElement: createAnchorElement(),
    }));

    expect(screen.getByTestId('event-card-tooltip-title').textContent).toBe('Containment');
    expect(screen.queryByTestId('event-card-tooltip-number')).toBeNull();
  });
});
