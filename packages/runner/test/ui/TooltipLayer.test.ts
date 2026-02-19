// @vitest-environment jsdom

import { createElement } from 'react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { asPlayerId } from '@ludoforge/engine/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createStore, type StoreApi as VanillaStoreApi } from 'zustand/vanilla';

import type { GameStore } from '../../src/store/game-store.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

const floatingMocks = vi.hoisted(() => ({
  setReference: vi.fn(),
  setFloating: vi.fn(),
  update: vi.fn(async () => {}),
  offset: vi.fn((value: number) => ({ name: 'offset', options: value })),
  flip: vi.fn(() => ({ name: 'flip' })),
  shift: vi.fn((options: { padding: number }) => ({ name: 'shift', options })),
  useFloatingOptions: null as {
    middleware?: unknown[];
  } | null,
}));

vi.mock('@floating-ui/react-dom', () => ({
  offset: floatingMocks.offset,
  flip: floatingMocks.flip,
  shift: floatingMocks.shift,
  useFloating: (options: { middleware?: unknown[] }) => {
    floatingMocks.useFloatingOptions = options;
    return {
      x: 120,
      y: 64,
      strategy: 'absolute',
      refs: {
        setReference: floatingMocks.setReference,
        setFloating: floatingMocks.setFloating,
      },
      update: floatingMocks.update,
    };
  },
}));

import { TooltipLayer } from '../../src/ui/TooltipLayer.js';

interface TooltipStoreState {
  readonly renderModel: NonNullable<GameStore['renderModel']>;
  readonly revision: number;
}

afterEach(() => {
  cleanup();
  floatingMocks.setReference.mockClear();
  floatingMocks.setFloating.mockClear();
  floatingMocks.update.mockClear();
  floatingMocks.offset.mockClear();
  floatingMocks.flip.mockClear();
  floatingMocks.shift.mockClear();
  floatingMocks.useFloatingOptions = null;
});

function createLiveStore(
  renderModel: NonNullable<GameStore['renderModel']>,
): {
    readonly store: StoreApi<GameStore>;
    readonly liveStore: VanillaStoreApi<TooltipStoreState>;
  } {
  const liveStore = createStore<TooltipStoreState>(() => ({ renderModel, revision: 0 }));
  return {
    store: liveStore as unknown as StoreApi<GameStore>,
    liveStore,
  };
}

const ANCHOR_RECT = {
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  left: 10,
  top: 20,
  right: 110,
  bottom: 60,
} as const;

describe('TooltipLayer', () => {
  it('returns null when hover target is missing', () => {
    const { store } = createLiveStore(makeRenderModel());

    render(createElement(TooltipLayer, {
      store,
      hoverTarget: null,
      anchorRect: null,
    }));

    expect(screen.queryByTestId('tooltip-layer')).toBeNull();
  });

  it('renders normalized payload rows for hovered zones', () => {
    const { store } = createLiveStore(makeRenderModel({
      zones: [{
        id: 'zone:alpha',
        displayName: 'Alpha Zone',
        ordering: 'stack',
        tokenIDs: ['token:1', 'token:2'],
        hiddenTokenCount: 1,
        markers: [{
          id: 'marker:control',
          displayName: 'Control',
          state: 'Blue',
          possibleStates: ['Blue', 'Red'],
        }],
        visibility: 'public',
        isSelectable: true,
        isHighlighted: false,
        ownerID: asPlayerId(0),
        category: null,
        attributes: {},
        visual: { shape: 'rectangle', width: 160, height: 100, color: null },
        metadata: {},
      }],
    }));

    render(createElement(TooltipLayer, {
      store,
      hoverTarget: { kind: 'zone', id: 'zone:alpha' },
      anchorRect: ANCHOR_RECT,
    }));

    const tooltip = screen.getByTestId('tooltip-layer');
    expect(tooltip.textContent).toContain('Alpha Zone');
    expect(tooltip.textContent).toContain('Zone ID: zone:alpha');
    expect(tooltip.textContent).toContain('Tokens: 3');
    expect(tooltip.textContent).toContain('Visibility: public');
    expect(tooltip.textContent).toContain('Owner: 0');
    expect(tooltip.textContent).toContain('Markers');
    expect(tooltip.textContent).toContain('Control: Blue');
  });

  it('renders normalized payload rows for hovered tokens', () => {
    const { store } = createLiveStore(makeRenderModel({
      tokens: [{
        id: 'token:7',
        type: 'Infantry',
        zoneID: 'zone:alpha',
        ownerID: asPlayerId(1),
        factionId: null,
        faceUp: true,
        properties: {
          strength: 3,
          ready: true,
        },
        isSelectable: true,
        isSelected: false,
      }],
    }));

    render(createElement(TooltipLayer, {
      store,
      hoverTarget: { kind: 'token', id: 'token:7' },
      anchorRect: ANCHOR_RECT,
    }));

    const tooltip = screen.getByTestId('tooltip-layer');
    expect(tooltip.textContent).toContain('Infantry');
    expect(tooltip.textContent).toContain('Token ID: token:7');
    expect(tooltip.textContent).toContain('Owner: 1');
    expect(tooltip.textContent).toContain('Face Up: yes');
    expect(tooltip.textContent).toContain('Zone: zone:alpha');
    expect(tooltip.textContent).toContain('Properties');
    expect(tooltip.textContent).toContain('ready: true');
    expect(tooltip.textContent).toContain('strength: 3');
  });

  it('configures Floating UI middleware', () => {
    const { store } = createLiveStore(makeRenderModel());

    render(createElement(TooltipLayer, {
      store,
      hoverTarget: { kind: 'zone', id: 'missing' },
      anchorRect: ANCHOR_RECT,
    }));

    expect(floatingMocks.offset).toHaveBeenCalledWith(10);
    expect(floatingMocks.flip).toHaveBeenCalledTimes(1);
    expect(floatingMocks.shift).toHaveBeenCalledWith({ padding: 8 });
    expect(floatingMocks.useFloatingOptions?.middleware).toHaveLength(3);
  });

  it('repositions when anchor rect changes', () => {
    const { store } = createLiveStore(makeRenderModel({
      zones: [{
        id: 'zone:alpha',
        displayName: 'Alpha Zone',
        ordering: 'stack',
        tokenIDs: [],
        hiddenTokenCount: 0,
        markers: [],
        visibility: 'public',
        isSelectable: true,
        isHighlighted: false,
        ownerID: null,
        category: null,
        attributes: {},
        visual: { shape: 'rectangle', width: 160, height: 100, color: null },
        metadata: {},
      }],
    }));

    const view = render(createElement(TooltipLayer, {
      store,
      hoverTarget: { kind: 'zone', id: 'zone:alpha' },
      anchorRect: ANCHOR_RECT,
    }));

    view.rerender(createElement(TooltipLayer, {
      store,
      hoverTarget: { kind: 'zone', id: 'zone:alpha' },
      anchorRect: {
        x: 20,
        y: 30,
        width: 100,
        height: 40,
        left: 20,
        top: 30,
        right: 120,
        bottom: 70,
      },
    }));

    expect(floatingMocks.setReference).toHaveBeenCalled();
    expect(floatingMocks.setFloating).toHaveBeenCalled();
    expect(floatingMocks.update).toHaveBeenCalled();
  });

  it('ignores unrelated store updates when hovered payload is unchanged', () => {
    const { store, liveStore } = createLiveStore(makeRenderModel({
      zones: [{
        id: 'zone:alpha',
        displayName: 'Alpha Zone',
        ordering: 'stack',
        tokenIDs: ['token:1'],
        hiddenTokenCount: 0,
        markers: [],
        visibility: 'public',
        isSelectable: true,
        isHighlighted: false,
        ownerID: null,
        category: null,
        attributes: {},
        visual: { shape: 'rectangle', width: 160, height: 100, color: null },
        metadata: {},
      }],
    }));

    let renderCount = 0;
    function RenderCounter() {
      renderCount += 1;
      return createElement(TooltipLayer, {
        store,
        hoverTarget: { kind: 'zone', id: 'zone:alpha' },
        anchorRect: ANCHOR_RECT,
      });
    }

    render(createElement(RenderCounter));
    expect(renderCount).toBe(1);

    act(() => {
      liveStore.setState((state) => ({
        ...state,
        revision: state.revision + 1,
      }));
    });

    expect(renderCount).toBe(1);
    expect(screen.getByTestId('tooltip-layer').textContent).toContain('Alpha Zone');
  });

  it('keeps tooltip content pointer-active via CSS contract', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/ui/TooltipLayer.module.css'), 'utf-8');
    const tooltipBlock = css.match(/\.tooltip\s*\{[^}]*\}/u)?.[0] ?? '';
    expect(tooltipBlock).toContain('pointer-events: auto;');
  });
});
