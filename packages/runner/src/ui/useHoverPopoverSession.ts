import { useCallback, useEffect, useRef, useState } from 'react';

export type HoverPopoverInteractionOwner = 'source' | 'popover' | 'grace' | null;
export type HoverPopoverStatus = 'idle' | 'pending' | 'visible';

export interface HoverPopoverSessionState<TSource, TContent> {
  readonly source: TSource | null;
  readonly anchorElement: HTMLElement | null;
  readonly content: TContent | null;
  readonly loading: boolean;
  readonly status: HoverPopoverStatus;
  readonly interactionOwner: HoverPopoverInteractionOwner;
  readonly revision: number;
}

interface UseHoverPopoverSessionOptions<TSource, TContent> {
  readonly debounceMs?: number;
  readonly graceMs?: number;
  readonly loadContent: (source: TSource) => TContent | Promise<TContent>;
  readonly isContentVisible?: (content: TContent | null) => boolean;
}

interface HoverPopoverSessionControls<TSource> {
  readonly startHover: (source: TSource, anchorElement: HTMLElement) => void;
  readonly endHover: () => void;
  readonly onPopoverPointerEnter: () => void;
  readonly onPopoverPointerLeave: () => void;
  readonly dismiss: () => void;
  readonly invalidate: () => void;
}

const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_GRACE_MS = 100;

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object'
    && value !== null
    && 'then' in value
    && typeof value.then === 'function';
}

function defaultIsContentVisible<TContent>(content: TContent | null): boolean {
  return content !== null;
}

function createState<TSource, TContent>(
  revision: number,
  source: TSource | null = null,
  anchorElement: HTMLElement | null = null,
  content: TContent | null = null,
  loading = false,
  interactionOwner: HoverPopoverInteractionOwner = null,
  isContentVisible: (content: TContent | null) => boolean,
): HoverPopoverSessionState<TSource, TContent> {
  return {
    source,
    anchorElement,
    content,
    loading,
    status: source === null ? 'idle' : (isContentVisible(content) ? 'visible' : 'pending'),
    interactionOwner,
    revision,
  };
}

export function useHoverPopoverSession<TSource, TContent>(
  options: UseHoverPopoverSessionOptions<TSource, TContent>,
): HoverPopoverSessionState<TSource, TContent> & HoverPopoverSessionControls<TSource> {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    graceMs = DEFAULT_GRACE_MS,
    loadContent,
    isContentVisible = defaultIsContentVisible,
  } = options;
  const revisionRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionOwnerRef = useRef<HoverPopoverInteractionOwner>(null);
  const sourcePresentRef = useRef(false);
  const [sessionState, setSessionState] = useState<HoverPopoverSessionState<TSource, TContent>>(
    () => createState<TSource, TContent>(0, null, null, null, false, null, isContentVisible),
  );

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current !== null) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearDebounceTimer();
    clearGraceTimer();
    revisionRef.current += 1;
    interactionOwnerRef.current = null;
    sourcePresentRef.current = false;
    setSessionState(createState<TSource, TContent>(revisionRef.current, null, null, null, false, null, isContentVisible));
  }, [clearDebounceTimer, clearGraceTimer, isContentVisible]);

  const invalidate = useCallback(() => {
    dismiss();
  }, [dismiss]);

  const startGracePeriod = useCallback(() => {
    clearGraceTimer();
    interactionOwnerRef.current = 'grace';
    setSessionState((previous) => {
      if (previous.source === null) {
        return previous;
      }
      return {
        ...previous,
        interactionOwner: 'grace',
      };
    });

    graceTimerRef.current = setTimeout(() => {
      graceTimerRef.current = null;
      setSessionState((previous) => {
        if (interactionOwnerRef.current !== 'grace' || previous.source === null) {
          return previous;
        }
        revisionRef.current += 1;
        interactionOwnerRef.current = null;
        sourcePresentRef.current = false;
        return createState<TSource, TContent>(revisionRef.current, null, null, null, false, null, isContentVisible);
      });
    }, graceMs);
  }, [clearGraceTimer, graceMs, isContentVisible]);

  const commitResolvedContent = useCallback((capturedRevision: number, content: TContent | null) => {
    if (revisionRef.current !== capturedRevision) {
      return;
    }

    setSessionState((previous) => {
      if (previous.revision !== capturedRevision) {
        return previous;
      }
      return createState(
        capturedRevision,
        previous.source,
        previous.anchorElement,
        content,
        false,
        previous.interactionOwner,
        isContentVisible,
      );
    });
  }, [isContentVisible]);

  const startHover = useCallback((source: TSource, anchorElement: HTMLElement) => {
    clearDebounceTimer();
    clearGraceTimer();
    revisionRef.current += 1;
    interactionOwnerRef.current = 'source';
    sourcePresentRef.current = true;
    const capturedRevision = revisionRef.current;

    setSessionState(createState(
      capturedRevision,
      source,
      anchorElement,
      null,
      false,
      'source',
      isContentVisible,
    ));

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (revisionRef.current !== capturedRevision) {
        return;
      }

      let contentResult: TContent | Promise<TContent>;
      try {
        contentResult = loadContent(source);
      } catch {
        commitResolvedContent(capturedRevision, null);
        return;
      }

      if (isPromiseLike(contentResult)) {
        setSessionState((previous) => {
          if (previous.revision !== capturedRevision) {
            return previous;
          }
          return {
            ...previous,
            loading: true,
            status: 'pending',
          };
        });

        contentResult.then(
          (content) => {
            commitResolvedContent(capturedRevision, content);
          },
          () => {
            commitResolvedContent(capturedRevision, null);
          },
        );
        return;
      }

      commitResolvedContent(capturedRevision, contentResult);
    }, debounceMs);
  }, [clearDebounceTimer, clearGraceTimer, commitResolvedContent, debounceMs, isContentVisible, loadContent]);

  const endHover = useCallback(() => {
    clearDebounceTimer();
    if (!sourcePresentRef.current || interactionOwnerRef.current === 'popover') {
      return;
    }
    startGracePeriod();
  }, [clearDebounceTimer, startGracePeriod]);

  const onPopoverPointerEnter = useCallback(() => {
    if (!sourcePresentRef.current) {
      return;
    }
    clearGraceTimer();
    interactionOwnerRef.current = 'popover';
    setSessionState((previous) => {
      if (previous.source === null) {
        return previous;
      }
      return {
        ...previous,
        interactionOwner: 'popover',
      };
    });
  }, [clearGraceTimer]);

  const onPopoverPointerLeave = useCallback(() => {
    if (!sourcePresentRef.current) {
      return;
    }
    startGracePeriod();
  }, [startGracePeriod]);

  useEffect(() => {
    return () => {
      clearDebounceTimer();
      clearGraceTimer();
    };
  }, [clearDebounceTimer, clearGraceTimer]);

  return {
    ...sessionState,
    startHover,
    endHover,
    onPopoverPointerEnter,
    onPopoverPointerLeave,
    dismiss,
    invalidate,
  };
}
