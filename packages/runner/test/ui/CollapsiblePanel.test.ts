// @vitest-environment jsdom

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CollapsiblePanel } from '../../src/ui/CollapsiblePanel.js';

afterEach(() => {
  cleanup();
});

describe('CollapsiblePanel', () => {
  it('renders panel shell with toggle and initial content', () => {
    const html = renderToStaticMarkup(
      createElement(
        CollapsiblePanel,
        {
          title: 'Example',
          panelTestId: 'example-panel',
          toggleTestId: 'example-toggle',
          contentTestId: 'example-content',
        },
        createElement('div', { 'data-testid': 'panel-child' }, 'child content'),
      ),
    );

    expect(html).toContain('data-testid="example-panel"');
    expect(html).toContain('data-testid="example-toggle"');
    expect(html).toContain('data-testid="example-content"');
    expect(html).toContain('child content');
  });

  it('toggle hides and shows content region', () => {
    render(
      createElement(
        CollapsiblePanel,
        {
          title: 'Example',
          panelTestId: 'example-panel',
          toggleTestId: 'example-toggle',
          contentTestId: 'example-content',
        },
        createElement('div', { 'data-testid': 'panel-child' }, 'child content'),
      ),
    );

    expect(screen.getByTestId('example-content')).toBeDefined();
    fireEvent.click(screen.getByTestId('example-toggle'));
    expect(screen.queryByTestId('example-content')).toBeNull();
    fireEvent.click(screen.getByTestId('example-toggle'));
    expect(screen.getByTestId('example-content')).toBeDefined();
  });

  it('keeps panel and toggle pointer-active via CSS contract', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, '../../src/ui/CollapsiblePanel.module.css'), 'utf-8');
    const panelBlock = css.match(/\.panel\s*\{[^}]*\}/u)?.[0] ?? '';
    const toggleBlock = css.match(/\.toggle\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(panelBlock).toContain('pointer-events: auto;');
    expect(toggleBlock).toContain("composes: interactive from './shared.module.css';");
  });
});
