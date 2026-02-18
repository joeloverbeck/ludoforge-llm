// @vitest-environment jsdom

import { createElement } from 'react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { asPlayerId } from '@ludoforge/engine/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import type { GameStore } from '../../src/store/game-store.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

const floatingMocks = vi.hoisted(() => ({
  setReference: vi.fn(),
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
      },
      update: floatingMocks.update,
    };
  },
}));

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => selector(store.getState()),
}));

import { TooltipLayer } from '../../src/ui/TooltipLayer.js';

afterEach(() => {
  cleanup();
  floatingMocks.setReference.mockClear();
  floatingMocks.update.mockClear();
  floatingMocks.offset.mockClear();
  floatingMocks.flip.mockClear();
  floatingMocks.shift.mockClear();
  floatingMocks.useFloatingOptions = null;
});

function createStore(renderModel: NonNullable<GameStore['renderModel']>): StoreApi<GameStore> {
  return {
    getState: () => ({ renderModel }),
  } as unknown as StoreApi<GameStore>;
}

describe('TooltipLayer', () => {
  it('returns null when hover target is missing', () => {
    render(createElement(TooltipLayer, {
      store: createStore(makeRenderModel()),
      hoverTarget: null,
      anchorRect: null,
    }));

    expect(screen.queryByTestId('tooltip-layer')).toBeNull();
  });

  it('renders zone details for hovered zones', () => {
    const store = createStore(makeRenderModel({
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
        ownerID: null,
        metadata: {},
      }],
    }));

    render(createElement(TooltipLayer, {
      store,
      hoverTarget: { kind: 'zone', id: 'zone:alpha' },
      anchorRect: {
        x: 10,
        y: 20,
        width: 100,
        height: 40,
        left: 10,
        top: 20,
        right: 110,
        bottom: 60,
      },
    }));

    expect(screen.getByTestId('tooltip-layer').textContent).toContain('Alpha Zone');
    expect(screen.getByTestId('tooltip-layer').textContent).toContain('Tokens: 3');
    expect(screen.getByTestId('tooltip-layer').textContent).toContain('Visibility: public');
    expect(screen.getByTestId('tooltip-layer').textContent).toContain('Control:Blue');
  });

  it('renders token details for hovered tokens', () => {
    const store = createStore(makeRenderModel({
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
      anchorRect: {
        x: 10,
        y: 20,
        width: 100,
        height: 40,
        left: 10,
        top: 20,
        right: 110,
        bottom: 60,
      },
    }));

    const tooltip = screen.getByTestId('tooltip-layer');
    expect(tooltip.textContent).toContain('Infantry');
    expect(tooltip.textContent).toContain('Owner: 1');
    expect(tooltip.textContent).toContain('Face Up: yes');
    expect(tooltip.textContent).toContain('strength: 3');
    expect(tooltip.textContent).toContain('ready: true');
  });

  it('configures Floating UI middleware', () => {
    render(createElement(TooltipLayer, {
      store: createStore(makeRenderModel()),
      hoverTarget: { kind: 'zone', id: 'missing' },
      anchorRect: {
        x: 10,
        y: 20,
        width: 100,
        height: 40,
        left: 10,
        top: 20,
        right: 110,
        bottom: 60,
      },
    }));

    expect(floatingMocks.offset).toHaveBeenCalledWith(10);
    expect(floatingMocks.flip).toHaveBeenCalledTimes(1);
    expect(floatingMocks.shift).toHaveBeenCalledWith({ padding: 8 });
    expect(floatingMocks.useFloatingOptions?.middleware).toHaveLength(3);
  });

  it('repositions when anchor rect changes', () => {
    const store = createStore(makeRenderModel({
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
        metadata: {},
      }],
    }));

    const view = render(createElement(TooltipLayer, {
      store,
      hoverTarget: { kind: 'zone', id: 'zone:alpha' },
      anchorRect: {
        x: 10,
        y: 20,
        width: 100,
        height: 40,
        left: 10,
        top: 20,
        right: 110,
        bottom: 60,
      },
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
    expect(floatingMocks.update).toHaveBeenCalled();
  });

  it('keeps tooltip content pointer-active via CSS contract', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/ui/TooltipLayer.module.css'), 'utf-8');
    const tooltipBlock = css.match(/\.tooltip\s*\{[^}]*\}/u)?.[0] ?? '';
    expect(tooltipBlock).toContain('pointer-events: auto;');
  });
});
