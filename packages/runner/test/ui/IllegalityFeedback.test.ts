import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { IllegalityFeedback } from '../../src/ui/IllegalityFeedback.js';

describe('IllegalityFeedback', () => {
  it('renders the provided illegal reason', () => {
    const html = renderToStaticMarkup(
      createElement(IllegalityFeedback, {
        illegalReason: 'Insufficient resources.',
      }),
    );

    expect(html).toContain('Insufficient resources.');
  });

  it('renders fallback text when illegal reason is null or blank', () => {
    const nullHtml = renderToStaticMarkup(
      createElement(IllegalityFeedback, {
        illegalReason: null,
      }),
    );

    const blankHtml = renderToStaticMarkup(
      createElement(IllegalityFeedback, {
        illegalReason: '   ',
      }),
    );

    expect(nullHtml).toContain('This option is currently unavailable.');
    expect(blankHtml).toContain('This option is currently unavailable.');
  });

  it('uses role="note" accessibility semantics', () => {
    const html = renderToStaticMarkup(
      createElement(IllegalityFeedback, {
        illegalReason: 'Blocked by prerequisite.',
      }),
    );

    expect(html).toContain('role="note"');
    expect(html).toContain('data-testid="illegality-feedback"');
  });

  it('uses tokenized muted and danger styling in css module', () => {
    const css = readFileSync(new URL('../../src/ui/IllegalityFeedback.module.css', import.meta.url), 'utf-8');
    const feedbackBlock = css.match(/\.feedback\s*\{[^}]*\}/u)?.[0] ?? '';
    const iconBlock = css.match(/\.icon\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(feedbackBlock).toContain('color: var(--text-muted);');
    expect(feedbackBlock).toContain('font-size: var(--font-size-sm);');
    expect(iconBlock).toContain('color: var(--danger);');
  });
});
