import { createElement, useContext } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { VisualConfigContext } from '../../src/config/visual-config-context.js';

function ContextReader() {
  const provider = useContext(VisualConfigContext);
  return createElement('div', { 'data-value': provider === null ? 'null' : 'set' });
}

describe('VisualConfigContext', () => {
  it('defaults to null', () => {
    const html = renderToStaticMarkup(createElement(ContextReader));
    expect(html).toContain('data-value="null"');
  });
});
