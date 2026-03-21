interface RenderableChildLike {
  readonly renderable?: boolean;
  readonly visible?: boolean;
}

interface StageLike {
  readonly children?: readonly RenderableChildLike[];
}

type TickerCallback = () => void;

interface TickerLike {
  addOnce(callback: TickerCallback): void;
  remove(callback: TickerCallback): void;
}

export interface RenderHealthProbe {
  scheduleVerification(): void;
  destroy(): void;
}

export interface RenderHealthProbeOptions {
  readonly stage: StageLike;
  readonly ticker: TickerLike;
  readonly onCorruption: () => void;
  readonly logger?: Pick<Console, 'warn'>;
}

export function createRenderHealthProbe(options: RenderHealthProbeOptions): RenderHealthProbe {
  const logger = options.logger ?? console;
  let verificationPending = false;
  let destroyed = false;

  const verifyRenderHealth = (): void => {
    verificationPending = false;
    if (destroyed) {
      return;
    }

    const children = options.stage.children ?? [];
    if (children.length === 0) {
      return;
    }

    const hasRenderableVisibleChild = children.some((child) => child.renderable === true && child.visible === true);
    if (hasRenderableVisibleChild) {
      return;
    }

    logger.warn('Render health probe detected a non-functional stage after a contained ticker error.');
    options.onCorruption();
  };

  return {
    scheduleVerification(): void {
      if (destroyed || verificationPending) {
        return;
      }
      verificationPending = true;
      options.ticker.addOnce(verifyRenderHealth);
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      if (verificationPending) {
        options.ticker.remove(verifyRenderHealth);
        verificationPending = false;
      }
    },
  };
}
