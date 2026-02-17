import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '../../src/ui/ErrorBoundary';

type TraversableElement = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

function findElementByType(node: ReactNode, type: string): TraversableElement | null {
  if (!isValidElement(node)) {
    return null;
  }

  const element = node as TraversableElement;

  if (element.type === type) {
    return element;
  }

  const children = element.props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementByType(child, type);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  return findElementByType(children, type);
}

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    const html = renderToStaticMarkup(
      createElement(
        ErrorBoundary,
        null,
        createElement('div', null, 'child-ok'),
      ),
    );

    expect(html).toContain('child-ok');
  });

  it('renders fallback UI when a child throws during render', () => {
    const thrown = new Error('boom');
    const boundary = new ErrorBoundary({
      children: createElement('div', null, 'never-rendered'),
    });

    const nextState = ErrorBoundary.getDerivedStateFromError(thrown);
    boundary.state = nextState;

    const html = renderToStaticMarkup(boundary.render() as ReactElement);

    expect(html).toContain('Something went wrong.');
    expect(html).toContain('boom');
  });

  it('default fallback exposes a Reload action', () => {
    const reload = vi.fn();
    const previousWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      value: { location: { reload } },
      configurable: true,
      writable: true,
    });

    try {
      const boundary = new ErrorBoundary({ children: null });
      boundary.state = {
        hasError: true,
        error: new Error('fatal'),
      };

      const tree = boundary.render();
      const button = findElementByType(tree, 'button');
      expect(button).not.toBeNull();
      if (button === null || button.props.onClick === undefined) {
        throw new Error('Expected reload button click handler.');
      }
      expect(renderToStaticMarkup(tree as ReactElement)).toContain('Reload');

      button.props.onClick();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: previousWindow,
        configurable: true,
        writable: true,
      });
    }
  });
});
