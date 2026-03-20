import { useEffect, useMemo } from 'react';
import { useFloating, type Middleware, type Placement, type VirtualElement } from '@floating-ui/react-dom';

type AnchorReference = HTMLElement | VirtualElement;

interface UseResolvedFloatingAnchorOptions {
  readonly reference: AnchorReference | null;
  readonly placement: Placement;
  readonly middleware: Middleware[];
}

interface ResolvedFloatingAnchorResult {
  readonly refs: ReturnType<typeof useFloating>['refs'];
  readonly floatingStyle: {
    readonly position: ReturnType<typeof useFloating>['strategy'];
    readonly left: number;
    readonly top: number;
  } | null;
  readonly isPositioned: boolean;
}

function isHTMLElement(reference: AnchorReference): reference is HTMLElement {
  return reference instanceof HTMLElement;
}

function resolveLiveReference(reference: AnchorReference | null): AnchorReference | null {
  if (reference === null) {
    return null;
  }

  if (!isHTMLElement(reference)) {
    return reference;
  }

  if (!reference.isConnected) {
    return null;
  }

  return reference;
}

export function useResolvedFloatingAnchor({
  reference,
  placement,
  middleware,
}: UseResolvedFloatingAnchorOptions): ResolvedFloatingAnchorResult {
  const { x, y, strategy, refs, update } = useFloating({
    placement,
    middleware,
  });

  const liveReference = useMemo(() => resolveLiveReference(reference), [reference]);

  useEffect(() => {
    refs.setReference(liveReference);
  }, [refs, liveReference]);

  useEffect(() => {
    if (liveReference === null || typeof update !== 'function') {
      return;
    }
    void update();
  }, [liveReference, update]);

  const isPositioned = liveReference !== null && typeof x === 'number' && typeof y === 'number';

  return {
    refs,
    floatingStyle: isPositioned
      ? {
        position: strategy,
        left: x,
        top: y,
      }
      : null,
    isPositioned,
  };
}
