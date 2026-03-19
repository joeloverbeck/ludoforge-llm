import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UIOverlay } from '../../src/ui/UIOverlay.js';
import styles from '../../src/ui/UIOverlay.module.css';

describe('UIOverlay', () => {
  it('renders all semantic overlay regions', () => {
    const html = renderToStaticMarkup(createElement(UIOverlay));

    expect(html).toContain('data-testid="ui-overlay"');
    expect(html).toContain('data-testid="ui-overlay-top"');
    expect(html).toContain('data-testid="ui-overlay-top-status"');
    expect(html).toContain('data-testid="ui-overlay-top-session"');
    expect(html).toContain('data-testid="ui-overlay-left-rail"');
    expect(html).toContain('data-testid="ui-overlay-right-rail"');
    expect(html).toContain('data-testid="ui-overlay-bottom-region"');
    expect(html).toContain('data-testid="ui-overlay-bottom-primary"');
    expect(html).toContain('data-testid="ui-overlay-bottom-right-dock"');
    expect(html).toContain('data-testid="ui-overlay-floating"');
    expect(html).not.toContain('data-testid="ui-overlay-left"');
    expect(html).not.toContain('data-testid="ui-overlay-side"');
    expect(html).not.toContain('data-testid="ui-overlay-bottom"');
  });

  it('renders provided bottomPrimaryContent and bottomRightDockContent in distinct bottom regions', () => {
    const html = renderToStaticMarkup(
      createElement(UIOverlay, {
        bottomPrimaryContent: createElement('div', { 'data-testid': 'bottom-primary-slot-content' }, 'bottom controls'),
        bottomRightDockContent: createElement('div', { 'data-testid': 'bottom-dock-slot-content' }, 'dock content'),
      }),
    );

    expect(html).toContain('data-testid="ui-overlay-bottom-primary"');
    expect(html).toContain('data-testid="ui-overlay-bottom-right-dock"');
    expect(html).toContain('data-testid="bottom-primary-slot-content"');
    expect(html).toContain('data-testid="bottom-dock-slot-content"');
    expect(html).toContain('bottom controls');
    expect(html).toContain('dock content');
  });

  it('renders provided topStatusContent in top status region', () => {
    const html = renderToStaticMarkup(
      createElement(UIOverlay, {
        topStatusContent: createElement('div', { 'data-testid': 'top-status-slot-content' }, 'top status'),
      }),
    );

    expect(html).toContain('data-testid="ui-overlay-top-status"');
    expect(html).toContain('data-testid="top-status-slot-content"');
    expect(html).toContain('top status');
  });

  it('consumes top-bar presentation hints for top status alignment', () => {
    const centeredHtml = renderToStaticMarkup(
      createElement(UIOverlay, {
        topBarPresentation: { statusAlignment: 'center' },
        topStatusContent: createElement('div', null, 'centered status'),
      }),
    );
    const startAlignedHtml = renderToStaticMarkup(
      createElement(UIOverlay, {
        topBarPresentation: { statusAlignment: 'start' },
        topStatusContent: createElement('div', null, 'start status'),
      }),
    );

    expect(centeredHtml).toContain('data-top-status-alignment="center"');
    expect(startAlignedHtml).toContain('data-top-status-alignment="start"');
  });

  it('renders provided topSessionContent in top session region', () => {
    const html = renderToStaticMarkup(
      createElement(UIOverlay, {
        topSessionContent: createElement('div', { 'data-testid': 'top-session-slot-content' }, 'top session'),
      }),
    );

    expect(html).toContain('data-testid="ui-overlay-top-session"');
    expect(html).toContain('data-testid="top-session-slot-content"');
    expect(html).toContain('top session');
  });

  it('renders provided rightRailContent in right rail region', () => {
    const html = renderToStaticMarkup(
      createElement(UIOverlay, {
        rightRailContent: createElement('div', { 'data-testid': 'right-rail-slot-content' }, 'right rail content'),
      }),
    );

    expect(html).toContain('data-testid="ui-overlay-right-rail"');
    expect(html).toContain('data-testid="right-rail-slot-content"');
    expect(html).toContain('right rail content');
  });

  it('renders provided floatingContent in floating region', () => {
    const html = renderToStaticMarkup(
      createElement(UIOverlay, {
        floatingContent: createElement('div', { 'data-testid': 'floating-slot-content' }, 'floating content'),
      }),
    );

    expect(html).toContain('data-testid="ui-overlay-floating"');
    expect(html).toContain('data-testid="floating-slot-content"');
    expect(html).toContain('floating content');
  });

  it('renders provided leftRailContent in left rail region', () => {
    const html = renderToStaticMarkup(
      createElement(UIOverlay, {
        leftRailContent: createElement('div', { 'data-testid': 'left-rail-slot-content' }, 'left content'),
      }),
    );

    expect(html).toContain('data-testid="ui-overlay-left-rail"');
    expect(html).toContain('data-testid="left-rail-slot-content"');
    expect(html).toContain('left content');
  });

  it('exports expected CSS module classes', () => {
    expect(styles).toMatchObject({
      overlay: expect.any(String),
      topRegion: expect.any(String),
      topBar: expect.any(String),
      topStatus: expect.any(String),
      topStatusStartAligned: expect.any(String),
      topSession: expect.any(String),
      scoringBar: expect.any(String),
      leftRail: expect.any(String),
      rightRail: expect.any(String),
      bottomRegion: expect.any(String),
      bottomPrimary: expect.any(String),
      bottomRightDock: expect.any(String),
      floating: expect.any(String),
    });
  });

  it('keeps overlay root non-interactive via CSS contract', () => {
    const css = readFileSync(new URL('../../src/ui/UIOverlay.module.css', import.meta.url), 'utf-8');
    const overlayBlock = css.match(/\.overlay\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(overlayBlock).toContain('pointer-events: none;');
  });
});
