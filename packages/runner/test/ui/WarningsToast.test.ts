// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import type { GameStore } from '../../src/store/game-store.js';
import { WarningsToast } from '../../src/ui/WarningsToast.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => selector(store.getState()),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface MutableRenderModelStore {
  readonly store: StoreApi<GameStore>;
  setWarnings(warnings: NonNullable<GameStore['renderModel']>['moveEnumerationWarnings']): void;
  setOrchestrationDiagnostic(diagnostic: GameStore['orchestrationDiagnostic']): void;
}

function createMutableStore(
  initialWarnings: NonNullable<GameStore['renderModel']>['moveEnumerationWarnings'],
): MutableRenderModelStore {
  let renderModel = makeRenderModel({
    moveEnumerationWarnings: initialWarnings,
  });
  let orchestrationDiagnostic: GameStore['orchestrationDiagnostic'] = null;

  const store = {
    getState: () => ({
      renderModel,
      orchestrationDiagnostic,
    }),
  } as unknown as StoreApi<GameStore>;

  return {
    store,
    setWarnings: (warnings) => {
      renderModel = makeRenderModel({
        moveEnumerationWarnings: warnings,
      });
    },
    setOrchestrationDiagnostic: (diagnostic) => {
      orchestrationDiagnostic = diagnostic;
    },
  };
}

describe('WarningsToast', () => {
  it('renders a toast for each new warning', () => {
    const warningStore = createMutableStore([
      { code: 'WARN_A', message: 'First warning' },
      { code: 'WARN_B', message: 'Second warning' },
    ]);
    render(createElement(WarningsToast, { store: warningStore.store }));

    expect(screen.getAllByTestId('warnings-toast-item')).toHaveLength(2);
  });

  it('shows each warning code and message', () => {
    const warningStore = createMutableStore([
      { code: 'ENUM_PARSE', message: 'Choice metadata is missing.' },
    ]);
    render(createElement(WarningsToast, { store: warningStore.store }));

    expect(screen.getByTestId('warnings-toast-code').textContent).toBe('ENUM_PARSE');
    expect(screen.getByTestId('warnings-toast-message').textContent).toBe('Choice metadata is missing.');
  });

  it('auto-dismisses toasts after the timeout', () => {
    vi.useFakeTimers();
    const warningStore = createMutableStore([
      { code: 'AUTO_TIMEOUT', message: 'This warning should disappear.' },
    ]);
    render(createElement(WarningsToast, { store: warningStore.store }));
    expect(screen.getByText('This warning should disappear.')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5200);
    });

    expect(screen.queryByText('This warning should disappear.')).toBeNull();
  });

  it('stacks multiple toasts in a single vertical list', () => {
    const warningStore = createMutableStore([
      { code: 'WARN_1', message: 'Alpha' },
      { code: 'WARN_2', message: 'Bravo' },
      { code: 'WARN_3', message: 'Charlie' },
    ]);
    render(createElement(WarningsToast, { store: warningStore.store }));

    expect(screen.getByTestId('warnings-toast-list')).toBeTruthy();
    expect(screen.getAllByTestId('warnings-toast-item')).toHaveLength(3);
  });

  it('dismisses a toast when clicked', () => {
    vi.useFakeTimers();
    const warningStore = createMutableStore([
      { code: 'CLICK_DISMISS', message: 'Dismiss me now' },
    ]);
    render(createElement(WarningsToast, { store: warningStore.store }));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss warning CLICK_DISMISS' }));
    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(screen.queryByText('Dismiss me now')).toBeNull();
  });

  it('does not enqueue duplicate toasts for unchanged warning keys across re-renders', () => {
    const warningStore = createMutableStore([
      { code: 'DUPLICATE', message: 'Same warning instance' },
    ]);
    const renderResult = render(createElement(WarningsToast, { store: warningStore.store }));
    expect(screen.getAllByTestId('warnings-toast-item')).toHaveLength(1);

    warningStore.setWarnings([
      { code: 'DUPLICATE', message: 'Same warning instance' },
    ]);
    renderResult.rerender(createElement(WarningsToast, { store: warningStore.store }));
    expect(screen.getAllByTestId('warnings-toast-item')).toHaveLength(1);

    warningStore.setWarnings([
      { code: 'DUPLICATE', message: 'Same warning instance' },
      { code: 'NEW_WARNING', message: 'Brand new warning' },
    ]);
    renderResult.rerender(createElement(WarningsToast, { store: warningStore.store }));
    expect(screen.getAllByTestId('warnings-toast-item')).toHaveLength(2);
  });

  it('cleans up dismiss timers on unmount', () => {
    vi.useFakeTimers();
    const warningStore = createMutableStore([
      { code: 'TIMER_CLEANUP', message: 'Timer must be cleaned.' },
    ]);
    const renderResult = render(createElement(WarningsToast, { store: warningStore.store }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    renderResult.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders orchestration diagnostics as toasts', () => {
    const warningStore = createMutableStore([]);
    warningStore.setOrchestrationDiagnostic({
      sequence: 1,
      code: 'UNCOMPLETABLE_TEMPLATE_MOVE',
      message: 'AI selected legal template move "tick" but completion returned null.',
      details: undefined,
    });
    render(createElement(WarningsToast, { store: warningStore.store }));

    expect(screen.getByText('UNCOMPLETABLE_TEMPLATE_MOVE')).toBeTruthy();
    expect(screen.getByText('AI selected legal template move "tick" but completion returned null.')).toBeTruthy();
  });
});
