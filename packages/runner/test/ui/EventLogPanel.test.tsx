// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { EventLogEntry } from '../../src/model/translate-effect-trace.js';
import { EventLogPanel } from '../../src/ui/EventLogPanel.js';

function makeEntry(overrides: Partial<EventLogEntry>): EventLogEntry {
  return {
    id: 'move-0-effect-0',
    kind: 'movement',
    message: 'Moved token A from Zone A to Zone B.',
    zoneIds: ['zone-a', 'zone-b'],
    tokenIds: ['token-a'],
    depth: 0,
    moveIndex: 0,
    ...overrides,
  };
}

describe('EventLogPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders empty state when entries are empty', () => {
    render(<EventLogPanel entries={[]} />);

    expect(screen.getByTestId('event-log-empty').textContent).toContain('No events yet');
  });

  it('groups entries by move index and renders move labels', () => {
    render(
      <EventLogPanel
        entries={[
          makeEntry({ id: 'move-0-effect-0', moveIndex: 0, message: 'first move entry' }),
          makeEntry({ id: 'move-1-effect-0', moveIndex: 1, message: 'second move entry' }),
        ]}
      />,
    );

    expect(screen.getByTestId('event-log-move-0').textContent).toContain('Move 1');
    expect(screen.getByTestId('event-log-move-1').textContent).toContain('Move 2');
    expect(screen.getByTestId('event-log-entry-move-0-effect-0').textContent).toContain('first move entry');
    expect(screen.getByTestId('event-log-entry-move-1-effect-0').textContent).toContain('second move entry');
  });

  it('filters entries by kind', () => {
    render(
      <EventLogPanel
        entries={[
          makeEntry({ id: 'move-0-effect-0', kind: 'movement', message: 'movement event' }),
          makeEntry({ id: 'move-0-effect-1', kind: 'variable', message: 'variable event' }),
        ]}
      />,
    );

    expect(screen.getByText('movement event')).toBeTruthy();
    expect(screen.getByText('variable event')).toBeTruthy();

    fireEvent.click(screen.getByTestId('event-log-filter-movement'));

    expect(screen.queryByText('movement event')).toBeNull();
    expect(screen.getByText('variable event')).toBeTruthy();
  });

  it('collapses and expands nested trigger rows per move group', () => {
    render(
      <EventLogPanel
        entries={[
          makeEntry({
            id: 'move-0-trigger-0',
            kind: 'trigger',
            message: 'root trigger',
            depth: 0,
            moveIndex: 0,
          }),
          makeEntry({
            id: 'move-0-trigger-1',
            kind: 'trigger',
            message: 'nested trigger',
            depth: 1,
            moveIndex: 0,
          }),
        ]}
      />,
    );

    expect(screen.getByText('nested trigger')).toBeTruthy();

    fireEvent.click(screen.getByTestId('event-log-move-0-toggle-nested'));
    expect(screen.queryByText('nested trigger')).toBeNull();

    fireEvent.click(screen.getByTestId('event-log-move-0-toggle-nested'));
    expect(screen.getByText('nested trigger')).toBeTruthy();
  });

  it('auto-scrolls when at bottom and preserves scroll when user scrolled up', () => {
    const initialEntries = [
      makeEntry({ id: 'move-0-effect-0', moveIndex: 0, message: 'entry 0' }),
    ];
    const { rerender } = render(<EventLogPanel entries={initialEntries} />);

    const scrollArea = screen.getByTestId('event-log-scroll') as HTMLDivElement;
    Object.defineProperty(scrollArea, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(scrollArea, 'scrollHeight', { value: 500, configurable: true });

    scrollArea.scrollTop = 400;
    fireEvent.scroll(scrollArea);

    rerender(
      <EventLogPanel
        entries={[
          ...initialEntries,
          makeEntry({ id: 'move-1-effect-0', moveIndex: 1, message: 'entry 1' }),
        ]}
      />,
    );

    expect(scrollArea.scrollTop).toBe(500);

    scrollArea.scrollTop = 120;
    fireEvent.scroll(scrollArea);

    rerender(
      <EventLogPanel
        entries={[
          ...initialEntries,
          makeEntry({ id: 'move-1-effect-0', moveIndex: 1, message: 'entry 1' }),
          makeEntry({ id: 'move-2-effect-0', moveIndex: 2, message: 'entry 2' }),
        ]}
      />,
    );

    expect(scrollArea.scrollTop).toBe(120);

    scrollArea.scrollTop = 400;
    fireEvent.scroll(scrollArea);

    rerender(
      <EventLogPanel
        entries={[
          ...initialEntries,
          makeEntry({ id: 'move-1-effect-0', moveIndex: 1, message: 'entry 1' }),
          makeEntry({ id: 'move-2-effect-0', moveIndex: 2, message: 'entry 2' }),
          makeEntry({ id: 'move-3-effect-0', moveIndex: 3, message: 'entry 3' }),
        ]}
      />,
    );

    expect(scrollArea.scrollTop).toBe(500);
  });
});
