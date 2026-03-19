// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenderEventCard } from '../../src/model/render-model.js';
import { useCardTooltip } from '../../src/ui/useCardTooltip.js';

function makeCard(overrides: Partial<RenderEventCard> = {}): RenderEventCard {
  return {
    id: 'card-1',
    title: 'Containment',
    orderNumber: 5,
    eligibility: null,
    sideMode: 'dual',
    unshadedText: 'Unshaded effect text',
    shadedText: 'Shaded effect text',
    ...overrides,
  };
}

function createAnchorElement(): HTMLElement {
  return document.createElement('div');
}

describe('useCardTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with null card state', () => {
    const { result } = renderHook(() => useCardTooltip());
    expect(result.current.cardTooltipState.card).toBeNull();
    expect(result.current.cardTooltipState.anchorElement).toBeNull();
    expect(result.current.cardTooltipState.status).toBe('idle');
  });

  it('shows card after debounce period', () => {
    const { result } = renderHook(() => useCardTooltip());
    const card = makeCard();
    const anchor = createAnchorElement();

    act(() => {
      result.current.onCardHoverStart(card, anchor);
    });

    // Before debounce — still null
    expect(result.current.cardTooltipState.card).toBeNull();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // After debounce — card is shown
    expect(result.current.cardTooltipState.card).toBe(card);
    expect(result.current.cardTooltipState.anchorElement).toBe(anchor);
    expect(result.current.cardTooltipState.status).toBe('visible');
  });

  it('does not show card if hover ends before debounce', () => {
    const { result } = renderHook(() => useCardTooltip());

    act(() => {
      result.current.onCardHoverStart(makeCard(), createAnchorElement());
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    act(() => {
      result.current.onCardHoverEnd();
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.cardTooltipState.card).toBeNull();
    expect(result.current.cardTooltipState.status).toBe('idle');
  });

  it('keeps tooltip visible when pointer enters tooltip during grace period', () => {
    const { result } = renderHook(() => useCardTooltip());
    const card = makeCard();

    act(() => {
      result.current.onCardHoverStart(card, createAnchorElement());
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Card is shown
    expect(result.current.cardTooltipState.card).toBe(card);

    // Leave card widget
    act(() => {
      result.current.onCardHoverEnd();
    });

    // Enter tooltip before grace expires
    act(() => {
      vi.advanceTimersByTime(50);
      result.current.onCardTooltipPointerEnter();
    });

    // Advance past grace period
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Should still be visible
    expect(result.current.cardTooltipState.card).toBe(card);
    expect(result.current.cardTooltipState.interactionOwner).toBe('popover');
  });

  it('dismisses tooltip when pointer leaves tooltip', () => {
    const { result } = renderHook(() => useCardTooltip());

    act(() => {
      result.current.onCardHoverStart(makeCard(), createAnchorElement());
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.cardTooltipState.card).not.toBeNull();

    // Enter then leave tooltip
    act(() => {
      result.current.onCardTooltipPointerEnter();
    });

    act(() => {
      result.current.onCardTooltipPointerLeave();
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.cardTooltipState.card).toBeNull();
    expect(result.current.cardTooltipState.status).toBe('idle');
  });

  it('supports explicit invalidation', () => {
    const { result } = renderHook(() => useCardTooltip());

    act(() => {
      result.current.onCardHoverStart(makeCard(), createAnchorElement());
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current.invalidateCardTooltip();
    });

    expect(result.current.cardTooltipState.card).toBeNull();
    expect(result.current.cardTooltipState.anchorElement).toBeNull();
    expect(result.current.cardTooltipState.status).toBe('idle');
  });

  it('supports explicit dismiss after becoming visible', () => {
    const { result } = renderHook(() => useCardTooltip());

    act(() => {
      result.current.onCardHoverStart(makeCard(), createAnchorElement());
      vi.advanceTimersByTime(200);
    });

    expect(result.current.cardTooltipState.card).not.toBeNull();

    act(() => {
      result.current.dismissCardTooltip();
    });

    expect(result.current.cardTooltipState.card).toBeNull();
    expect(result.current.cardTooltipState.anchorElement).toBeNull();
    expect(result.current.cardTooltipState.status).toBe('idle');
  });

  it('replaces a pending hover with the latest hovered card', () => {
    const { result } = renderHook(() => useCardTooltip());
    const firstCard = makeCard({ id: 'card-1', title: 'Containment' });
    const secondCard = makeCard({ id: 'card-2', title: 'Ambush' });

    act(() => {
      result.current.onCardHoverStart(firstCard, createAnchorElement());
      vi.advanceTimersByTime(100);
      result.current.onCardHoverStart(secondCard, createAnchorElement());
      vi.advanceTimersByTime(200);
    });

    expect(result.current.cardTooltipState.card).toBe(secondCard);
    expect(result.current.cardTooltipState.card).not.toBe(firstCard);
    expect(result.current.cardTooltipState.status).toBe('visible');
  });
});
