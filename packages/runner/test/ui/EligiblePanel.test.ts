import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EligiblePanel } from '../../src/ui/EligiblePanel.js';
import { createRenderModelStore, makeRenderModelFixture } from './helpers/render-model-fixture.js';

describe('EligiblePanel', () => {
  it('renders eligible faction names', () => {
    const model = makeRenderModelFixture({
      runtimeEligible: [
        { seatId: 'us', displayName: 'Us', factionId: 'us', seatIndex: 0 },
        { seatId: 'arvn', displayName: 'Arvn', factionId: 'arvn', seatIndex: 1 },
      ],
    });
    const store = createRenderModelStore(model);
    const html = renderToStaticMarkup(createElement(EligiblePanel, { store }));

    expect(html).toContain('data-testid="eligible-panel"');
    expect(html).toContain('data-testid="eligible-faction-us"');
    expect(html).toContain('data-testid="eligible-faction-arvn"');
    expect(html).toContain('Us');
    expect(html).toContain('Arvn');
  });

  it('applies faction color CSS variables', () => {
    const model = makeRenderModelFixture({
      runtimeEligible: [
        { seatId: 'nva', displayName: 'Nva', factionId: 'nva', seatIndex: 0 },
      ],
    });
    const store = createRenderModelStore(model);
    const html = renderToStaticMarkup(createElement(EligiblePanel, { store }));

    expect(html).toContain('var(--faction-nva');
  });

  it('returns null when runtimeEligible is empty', () => {
    const model = makeRenderModelFixture({ runtimeEligible: [] });
    const store = createRenderModelStore(model);
    const html = renderToStaticMarkup(createElement(EligiblePanel, { store }));

    expect(html).toBe('');
  });

  it('returns null when renderModel is null', () => {
    const store = createRenderModelStore(null);
    const html = renderToStaticMarkup(createElement(EligiblePanel, { store }));

    expect(html).toBe('');
  });
});
