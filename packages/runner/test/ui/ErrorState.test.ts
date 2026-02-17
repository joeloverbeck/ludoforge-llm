import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ErrorState } from '../../src/ui/ErrorState';

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

describe('ErrorState', () => {
  it('renders error message from props', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorState, {
        error: { message: 'init failure' },
        onRetry: () => {},
      }),
    );

    expect(html).toContain('Failed to load game');
    expect(html).toContain('init failure');
    expect(html).toContain('Retry');
  });

  it('calls onRetry when Retry button is clicked', () => {
    const onRetry = vi.fn();

    const tree = ErrorState({
      error: { message: 'retry me' },
      onRetry,
    });

    const retryButton = findElementByType(tree, 'button');
    expect(retryButton).not.toBeNull();
    if (retryButton === null || retryButton.props.onClick === undefined) {
      throw new Error('Expected retry button click handler.');
    }

    retryButton.props.onClick();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
