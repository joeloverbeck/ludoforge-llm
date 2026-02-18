import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { InterruptBanner } from '../../src/ui/InterruptBanner.js';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

describe('InterruptBanner', () => {
  it('renders when isInInterrupt is true', () => {
    const html = renderToStaticMarkup(createElement(InterruptBanner, {
      store: createStore(makeRenderModel({
        interruptStack: [{ phase: 'headline', resumePhase: 'action-round' }],
        isInInterrupt: true,
      })),
    }));

    expect(html).toContain('data-testid="interrupt-banner"');
  });

  it('shows interrupt phase name', () => {
    const html = renderToStaticMarkup(createElement(InterruptBanner, {
      store: createStore(makeRenderModel({
        interruptStack: [{ phase: 'headline', resumePhase: 'action-round' }],
        isInInterrupt: true,
      })),
    }));

    expect(html).toContain('Interrupt: headline');
  });

  it('shows resume phase name', () => {
    const html = renderToStaticMarkup(createElement(InterruptBanner, {
      store: createStore(makeRenderModel({
        interruptStack: [{ phase: 'headline', resumePhase: 'action-round' }],
        isInInterrupt: true,
      })),
    }));

    expect(html).toContain('Resumes: action-round');
  });

  it('uses the top-most interrupt frame', () => {
    const html = renderToStaticMarkup(
      createElement(InterruptBanner, {
        store: createStore(
          makeRenderModel({
            interruptStack: [
              { phase: 'first', resumePhase: 'main' },
              { phase: 'second', resumePhase: 'combat' },
            ],
            isInInterrupt: true,
          }),
        ),
      }),
    );

    expect(html).toContain('Interrupt: second');
    expect(html).toContain('Resumes: combat');
  });

  it('does not render when isInInterrupt is false', () => {
    const tree = InterruptBanner({
      store: createStore(makeRenderModel({ isInInterrupt: false })),
    });

    expect(tree).toBeNull();
  });

  it('does not render when interrupt stack is empty', () => {
    const tree = InterruptBanner({
      store: createStore(makeRenderModel({ interruptStack: [] })),
    });

    expect(tree).toBeNull();
  });

  it('has prominent visual styling contract', () => {
    const css = readFileSync(new URL('../../src/ui/InterruptBanner.module.css', import.meta.url), 'utf-8');
    const bannerBlock = css.match(/\.banner\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(bannerBlock).toContain('border: 1px solid var(--danger);');
    expect(bannerBlock).toContain('background: rgba(217, 74, 74, 0.2);');
  });
});
