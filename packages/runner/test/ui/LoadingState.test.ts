import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LoadingState } from '../../src/ui/LoadingState';

describe('LoadingState', () => {
  it('renders loading message text', () => {
    const html = renderToStaticMarkup(createElement(LoadingState));

    expect(html).toContain('Loading game...');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
  });

  it('accepts custom message prop', () => {
    const html = renderToStaticMarkup(createElement(LoadingState, { message: 'Bootstrapping...' }));

    expect(html).toContain('Bootstrapping...');
  });
});
