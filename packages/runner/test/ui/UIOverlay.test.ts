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
    expect(html).toContain('data-testid="ui-overlay-side"');
    expect(html).toContain('data-testid="ui-overlay-bottom"');
    expect(html).toContain('data-testid="ui-overlay-floating"');
  });

  it('renders provided bottomBarContent in bottom region', () => {
    const html = renderToStaticMarkup(
      createElement(UIOverlay, {
        bottomBarContent: createElement('div', { 'data-testid': 'bottom-slot-content' }, 'bottom controls'),
      }),
    );

    expect(html).toContain('data-testid="ui-overlay-bottom"');
    expect(html).toContain('data-testid="bottom-slot-content"');
    expect(html).toContain('bottom controls');
  });

  it('exports expected CSS module classes', () => {
    expect(styles).toMatchObject({
      overlay: expect.any(String),
      topBar: expect.any(String),
      sidePanels: expect.any(String),
      bottomBar: expect.any(String),
      floating: expect.any(String),
    });
  });

  it('keeps overlay root non-interactive via CSS contract', () => {
    const css = readFileSync(new URL('../../src/ui/UIOverlay.module.css', import.meta.url), 'utf-8');
    const overlayBlock = css.match(/\.overlay\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(overlayBlock).toContain('pointer-events: none;');
  });
});
