import { Container, Graphics } from 'pixi.js';

import { safeDestroyContainer } from '../canvas/renderers/safe-destroy.js';

const CARD_BACK_COLOR = 0x1f2937;
const CARD_WIDTH = 24;
const CARD_HEIGHT = 34;
const STROKE_COLOR = 0x0f172a;
const STROKE_WIDTH = 1.5;
const STROKE_ALPHA = 0.9;

export interface EphemeralContainerFactory {
  create(tokenId: string): Container;
  destroyAll(): void;
}

export interface EphemeralContainerFactoryOptions {
  readonly cardWidth?: number;
  readonly cardHeight?: number;
}

export function createEphemeralContainerFactory(
  parentContainer: Container,
  options?: EphemeralContainerFactoryOptions,
): EphemeralContainerFactory {
  const created: Container[] = [];
  const cardWidth = options?.cardWidth ?? CARD_WIDTH;
  const cardHeight = options?.cardHeight ?? CARD_HEIGHT;

  return {
    create(tokenId: string): Container {
      const container = new Container();
      container.label = `ephemeral:${tokenId}`;
      container.alpha = 0;

      const back = new Graphics();
      back
        .roundRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 3)
        .fill(CARD_BACK_COLOR)
        .stroke({ color: STROKE_COLOR, width: STROKE_WIDTH, alpha: STROKE_ALPHA });
      container.addChild(back);

      parentContainer.addChild(container);
      created.push(container);
      return container;
    },

    destroyAll(): void {
      for (const container of created) {
        safeDestroyContainer(container);
      }
      created.length = 0;
    },
  };
}
