// @vitest-environment jsdom

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import type { StoreApi } from 'zustand';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GameStore } from '../../src/store/game-store.js';
import type { DiagnosticBuffer } from '../../src/animation/diagnostic-buffer.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { AnimationControls } from '../../src/ui/AnimationControls.js';

afterEach(() => {
  cleanup();
});

function createAnimationControlsStore(state: {
  readonly animationPlaying?: boolean;
  readonly animationPaused?: boolean;
  readonly animationPlaybackSpeed?: GameStore['animationPlaybackSpeed'];
  readonly aiPlaybackDetailLevel?: GameStore['aiPlaybackDetailLevel'];
  readonly aiPlaybackAutoSkip?: boolean;
  readonly setAnimationPlaybackSpeed?: GameStore['setAnimationPlaybackSpeed'];
  readonly setAnimationPaused?: GameStore['setAnimationPaused'];
  readonly requestAnimationSkipCurrent?: GameStore['requestAnimationSkipCurrent'];
  readonly setAiPlaybackDetailLevel?: GameStore['setAiPlaybackDetailLevel'];
  readonly setAiPlaybackAutoSkip?: GameStore['setAiPlaybackAutoSkip'];
}): StoreApi<GameStore> {
  return {
    getState: () => ({
      animationPlaying: state.animationPlaying ?? false,
      animationPaused: state.animationPaused ?? false,
      animationPlaybackSpeed: state.animationPlaybackSpeed ?? '1x',
      aiPlaybackDetailLevel: state.aiPlaybackDetailLevel ?? 'standard',
      aiPlaybackAutoSkip: state.aiPlaybackAutoSkip ?? false,
      setAnimationPlaybackSpeed: state.setAnimationPlaybackSpeed ?? (() => {}),
      setAnimationPaused: state.setAnimationPaused ?? (() => {}),
      requestAnimationSkipCurrent: state.requestAnimationSkipCurrent ?? (() => {}),
      setAiPlaybackDetailLevel: state.setAiPlaybackDetailLevel ?? (() => {}),
      setAiPlaybackAutoSkip: state.setAiPlaybackAutoSkip ?? (() => {}),
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('AnimationControls', () => {
  it('renders controls shell and speed buttons', () => {
    const html = renderToStaticMarkup(
      createElement(AnimationControls, {
        store: createAnimationControlsStore({ animationPlaybackSpeed: '2x' }),
      }),
    );

    expect(html).toContain('data-testid="animation-controls"');
    expect(html).toContain('data-testid="animation-speed-1x"');
    expect(html).toContain('data-testid="animation-speed-2x"');
    expect(html).toContain('data-testid="animation-speed-4x"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('dispatches speed, pause, skip, detail, and auto-skip actions', () => {
    const setAnimationPlaybackSpeed = vi.fn();
    const setAnimationPaused = vi.fn();
    const requestAnimationSkipCurrent = vi.fn();
    const setAiPlaybackDetailLevel = vi.fn();
    const setAiPlaybackAutoSkip = vi.fn();

    render(createElement(AnimationControls, {
      store: createAnimationControlsStore({
        animationPlaying: true,
        animationPaused: false,
        animationPlaybackSpeed: '1x',
        aiPlaybackDetailLevel: 'standard',
        aiPlaybackAutoSkip: false,
        setAnimationPlaybackSpeed,
        setAnimationPaused,
        requestAnimationSkipCurrent,
        setAiPlaybackDetailLevel,
        setAiPlaybackAutoSkip,
      }),
    }));

    fireEvent.click(screen.getByTestId('animation-speed-4x'));
    expect(setAnimationPlaybackSpeed).toHaveBeenCalledWith('4x');

    fireEvent.click(screen.getByTestId('animation-pause-toggle'));
    expect(setAnimationPaused).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByTestId('animation-skip-current'));
    expect(requestAnimationSkipCurrent).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId('animation-ai-detail-level'), { target: { value: 'minimal' } });
    expect(setAiPlaybackDetailLevel).toHaveBeenCalledWith('minimal');

    fireEvent.click(screen.getByTestId('animation-ai-auto-skip'));
    expect(setAiPlaybackAutoSkip).toHaveBeenCalledWith(true);
  });

  it('disables pause/skip controls while no animation is playing', () => {
    render(createElement(AnimationControls, {
      store: createAnimationControlsStore({
        animationPlaying: false,
      }),
    }));

    expect((screen.getByTestId('animation-pause-toggle') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('animation-skip-current') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps controls pointer-active via CSS contract', () => {
    const css = readFileSync('src/ui/AnimationControls.module.css', 'utf-8');
    const containerBlock = css.match(/\.container\s*\{[^}]*\}/u)?.[0] ?? '';
    const speedBlock = css.match(/\.speedButton\s*,\s*\.controlButton\s*,\s*\.select\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(containerBlock).toContain('pointer-events: auto;');
    expect(speedBlock).toContain('pointer-events: auto;');
  });

  it('renders download button in dev mode when diagnostic buffer is provided', () => {
    const diagnosticBuffer = {
      downloadAsJson: vi.fn(),
    } as unknown as DiagnosticBuffer;

    render(createElement(AnimationControls, {
      store: createAnimationControlsStore({}),
      diagnostics: { animationDiagnosticBuffer: diagnosticBuffer },
    }));

    if (!import.meta.env.DEV) {
      expect(screen.queryByTestId('animation-download-log')).toBeNull();
      return;
    }

    expect(screen.queryByTestId('animation-download-log')).not.toBeNull();
  });

  it('does not render download button without diagnostic buffer', () => {
    render(createElement(AnimationControls, {
      store: createAnimationControlsStore({}),
    }));

    expect(screen.queryByTestId('animation-download-log')).toBeNull();
  });

  it('downloads diagnostics when download button is clicked', () => {
    const downloadAsJson = vi.fn();
    const diagnosticBuffer = {
      downloadAsJson,
    } as unknown as DiagnosticBuffer;

    render(createElement(AnimationControls, {
      store: createAnimationControlsStore({}),
      diagnostics: { animationDiagnosticBuffer: diagnosticBuffer },
    }));

    const downloadButton = screen.queryByTestId('animation-download-log');
    if (downloadButton === null) {
      expect(import.meta.env.DEV).toBe(false);
      expect(downloadAsJson).not.toHaveBeenCalled();
      return;
    }

    fireEvent.click(downloadButton);
    expect(downloadAsJson).toHaveBeenCalledTimes(1);
  });
});
