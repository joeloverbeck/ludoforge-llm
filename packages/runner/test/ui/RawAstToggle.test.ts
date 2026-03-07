// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DisplayGroupNode, DisplayLineNode } from '@ludoforge/engine/runtime';

/* ------------------------------------------------------------------ */
/* Floating UI mock (kept aligned with shared tooltip test setup) */
/* ------------------------------------------------------------------ */

vi.mock('@floating-ui/react-dom', () => ({
  offset: vi.fn(),
  flip: vi.fn(),
  shift: vi.fn(),
  useFloating: () => ({
    x: 0,
    y: 0,
    strategy: 'absolute' as const,
    refs: { setReference: vi.fn(), setFloating: vi.fn() },
  }),
}));

import { RawAstToggle } from '../../src/ui/RawAstToggle.js';

afterEach(cleanup);

function makeSection(): DisplayGroupNode {
  const line: DisplayLineNode = {
    kind: 'line',
    indent: 0,
    children: [
      { kind: 'keyword', text: 'moveToken' },
      { kind: 'punctuation', text: '(' },
      { kind: 'reference', text: 'soldier', refKind: 'token' },
      { kind: 'punctuation', text: ')' },
    ],
  };
  return { kind: 'group', label: 'Effects', children: [line] };
}

describe('RawAstToggle', () => {
  it('renders toggle with correct data-testid', () => {
    render(createElement(RawAstToggle, { sections: [makeSection()] }));
    expect(screen.getByTestId('raw-ast-toggle')).toBeTruthy();
  });

  it('starts collapsed — content is not visible', () => {
    render(createElement(RawAstToggle, { sections: [makeSection()] }));
    expect(screen.queryByTestId('raw-ast-content')).toBeNull();
  });

  it('expands on click — shows DisplayNode content', () => {
    render(createElement(RawAstToggle, { sections: [makeSection()] }));

    fireEvent.click(screen.getByTestId('raw-ast-button'));

    const content = screen.getByTestId('raw-ast-content');
    expect(content.textContent).toContain('Effects');
    expect(content.textContent).toContain('moveToken');
    expect(content.textContent).toContain('soldier');
  });

  it('collapses again on second click', () => {
    render(createElement(RawAstToggle, { sections: [makeSection()] }));
    const button = screen.getByTestId('raw-ast-button');

    fireEvent.click(button);
    expect(screen.getByTestId('raw-ast-content')).toBeTruthy();

    fireEvent.click(button);
    expect(screen.queryByTestId('raw-ast-content')).toBeNull();
  });

  it('sets aria-expanded attribute', () => {
    render(createElement(RawAstToggle, { sections: [makeSection()] }));
    const button = screen.getByTestId('raw-ast-button');

    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows "Raw AST" label', () => {
    render(createElement(RawAstToggle, { sections: [makeSection()] }));
    const button = screen.getByTestId('raw-ast-button');
    expect(button.textContent).toContain('Raw AST');
  });
});
