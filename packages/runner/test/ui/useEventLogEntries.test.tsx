// @vitest-environment jsdom

import { createElement } from 'react';
import { createStore } from 'zustand/vanilla';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { useEventLogEntries } from '../../src/ui/useEventLogEntries.js';
import { translateEffectTrace } from '../../src/model/translate-effect-trace.js';

vi.mock('../../src/model/translate-effect-trace.js', () => ({
  translateEffectTrace: vi.fn(),
}));

const translateEffectTraceMock = vi.mocked(translateEffectTrace);

interface MinimalGameStoreState {
  readonly gameDef: object | null;
  readonly effectTrace: readonly unknown[];
  readonly triggerFirings: readonly unknown[];
}

function createMinimalStore(initial: MinimalGameStoreState) {
  return createStore<MinimalGameStoreState>()(() => initial);
}

function HookHarness(props: {
  readonly store: ReturnType<typeof createMinimalStore>;
  readonly visualConfigProvider: VisualConfigProvider;
}) {
  const entries = useEventLogEntries(
    props.store as unknown as Parameters<typeof useEventLogEntries>[0],
    props.visualConfigProvider,
  );
  return createElement('div', {
    'data-testid': 'event-log-count',
    'data-count': String(entries.length),
    'data-ids': entries.map((entry) => entry.id).join(','),
  });
}

describe('useEventLogEntries', () => {
  beforeEach(() => {
    translateEffectTraceMock.mockReset();
    translateEffectTraceMock.mockImplementation((_effectTrace, _triggerFirings, _visualConfig, _gameDef, moveIndex) => ([{
      id: `entry-${moveIndex}`,
      kind: 'movement',
      message: `move ${moveIndex}`,
      zoneIds: [],
      tokenIds: [],
      depth: 0,
      moveIndex,
    }]));
  });

  afterEach(() => {
    cleanup();
  });

  it('accumulates translated entries when traces change', async () => {
    const store = createMinimalStore({
      gameDef: { metadata: { id: 'test' } },
      effectTrace: [],
      triggerFirings: [],
    });

    render(createElement(HookHarness, {
      store,
      visualConfigProvider: {} as VisualConfigProvider,
    }));

    store.setState({ effectTrace: [{ kind: 'moveToken' }] });
    await waitFor(() => {
      expect(screen.getByTestId('event-log-count').getAttribute('data-count')).toBe('1');
    });

    store.setState({ effectTrace: [{ kind: 'moveToken' }, { kind: 'varChange' }] });
    await waitFor(() => {
      expect(screen.getByTestId('event-log-count').getAttribute('data-count')).toBe('2');
      expect(screen.getByTestId('event-log-count').getAttribute('data-ids')).toBe('entry-0,entry-1');
    });
  });

  it('ignores updates with empty traces and resets when store instance changes', async () => {
    const firstStore = createMinimalStore({
      gameDef: { metadata: { id: 'first' } },
      effectTrace: [],
      triggerFirings: [],
    });

    const { rerender } = render(createElement(HookHarness, {
      store: firstStore,
      visualConfigProvider: {} as VisualConfigProvider,
    }));

    firstStore.setState({ effectTrace: [{ kind: 'moveToken' }] });
    await waitFor(() => {
      expect(screen.getByTestId('event-log-count').getAttribute('data-count')).toBe('1');
    });

    firstStore.setState({ effectTrace: [], triggerFirings: [] });
    await waitFor(() => {
      expect(screen.getByTestId('event-log-count').getAttribute('data-count')).toBe('1');
    });

    const secondStore = createMinimalStore({
      gameDef: { metadata: { id: 'second' } },
      effectTrace: [],
      triggerFirings: [],
    });

    rerender(createElement(HookHarness, {
      store: secondStore,
      visualConfigProvider: {} as VisualConfigProvider,
    }));

    await waitFor(() => {
      expect(screen.getByTestId('event-log-count').getAttribute('data-count')).toBe('0');
    });

    secondStore.setState({ effectTrace: [{ kind: 'moveToken' }] });
    await waitFor(() => {
      expect(screen.getByTestId('event-log-count').getAttribute('data-count')).toBe('1');
      expect(screen.getByTestId('event-log-count').getAttribute('data-ids')).toBe('entry-0');
    });
  });
});
