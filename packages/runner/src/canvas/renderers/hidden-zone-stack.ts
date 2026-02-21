import { Container, Graphics, Text } from 'pixi.js';
import { safeDestroyChildren } from './safe-destroy.js';

interface HiddenStackMetrics {
  readonly layerCount: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

interface HiddenStackPalette {
  readonly topColor: number;
  readonly bottomColor: number;
  readonly stripeColor: number;
  readonly badgeColor: number;
  readonly badgeTextColor: string;
  readonly outlineColor: number;
}

export interface HiddenZoneStackVisual {
  readonly root: Container;
  readonly cards: Container;
  readonly badge: Graphics;
  readonly countLabel: Text;
}

const MAX_STACK_LAYERS = 5;

const CARD_BACK_PALETTE: HiddenStackPalette = {
  topColor: 0x1e293b,
  bottomColor: 0x0f172a,
  stripeColor: 0xffffff,
  badgeColor: 0xf1f5f9,
  badgeTextColor: '#0f172a',
  outlineColor: 0x0b1220,
};

export function createHiddenZoneStackVisual(): HiddenZoneStackVisual {
  const root = new Container();
  root.eventMode = 'none';
  root.interactiveChildren = false;

  const cards = new Container();
  cards.eventMode = 'none';
  cards.interactiveChildren = false;

  const badge = new Graphics();
  const countLabel = new Text({
    text: '',
    style: {
      fill: CARD_BACK_PALETTE.badgeTextColor,
      fontSize: 11,
      fontFamily: 'monospace',
      fontWeight: '700',
    },
  });
  countLabel.eventMode = 'none';
  countLabel.interactiveChildren = false;

  root.addChild(cards, badge, countLabel);

  return {
    root,
    cards,
    badge,
    countLabel,
  };
}

export function updateHiddenZoneStackVisual(
  visual: HiddenZoneStackVisual,
  hiddenTokenCount: number,
  zoneWidth: number,
  zoneHeight: number,
): void {
  const clampedCount = Math.max(0, hiddenTokenCount);
  if (clampedCount === 0) {
    visual.root.visible = false;
    destroyChildren(visual.cards);
    visual.badge.clear();
    visual.countLabel.text = '';
    return;
  }

  visual.root.visible = true;
  const metrics = deriveMetrics(clampedCount, zoneWidth, zoneHeight);
  rebuildCards(visual.cards, metrics);

  visual.badge.clear();
  const badgeWidth = 26;
  const badgeHeight = 18;
  const badgeX = metrics.cardWidth * 0.45;
  const badgeY = -metrics.cardHeight * 0.4;
  visual.badge.roundRect(
    badgeX - badgeWidth / 2,
    badgeY - badgeHeight / 2,
    badgeWidth,
    badgeHeight,
    8,
  );
  visual.badge.fill(CARD_BACK_PALETTE.badgeColor).stroke({
    color: CARD_BACK_PALETTE.outlineColor,
    width: 1,
    alpha: 0.85,
  });

  visual.countLabel.text = String(clampedCount);
  visual.countLabel.position.set(badgeX - 4, badgeY - 6);
}

function deriveMetrics(hiddenTokenCount: number, zoneWidth: number, zoneHeight: number): HiddenStackMetrics {
  const layerCount = Math.min(hiddenTokenCount, MAX_STACK_LAYERS);
  const cardWidth = Math.max(28, Math.min(44, zoneWidth * 0.27));
  const cardHeight = Math.max(38, Math.min(60, zoneHeight * 0.58));

  return {
    layerCount,
    cardWidth,
    cardHeight,
    offsetX: Math.max(1, cardWidth * 0.08),
    offsetY: Math.max(1, cardHeight * 0.05),
  };
}

function rebuildCards(cards: Container, metrics: HiddenStackMetrics): void {
  destroyChildren(cards);

  for (let index = 0; index < metrics.layerCount; index += 1) {
    const card = new Graphics();
    const x = (index - (metrics.layerCount - 1) / 2) * metrics.offsetX;
    const y = (index - (metrics.layerCount - 1) / 2) * metrics.offsetY;

    card.roundRect(
      -metrics.cardWidth / 2,
      -metrics.cardHeight / 2,
      metrics.cardWidth,
      metrics.cardHeight,
      6,
    );
    card.fill({ color: resolveCardColor(index) }).stroke({
      color: CARD_BACK_PALETTE.outlineColor,
      width: 1,
      alpha: 0.75,
    });

    // Lightweight stripe hint to evoke face-down card backs in canvas space.
    const stripe = new Graphics()
      .roundRect(-metrics.cardWidth / 2 + 4, -2, metrics.cardWidth - 8, 4, 2)
      .fill({ color: CARD_BACK_PALETTE.stripeColor, alpha: 0.12 });

    card.position.set(x, y);
    card.rotation = (index - (metrics.layerCount - 1) / 2) * 0.04;
    card.addChild(stripe);
    cards.addChild(card);
  }
}

function destroyChildren(container: Container): void {
  safeDestroyChildren(container);
}

function resolveCardColor(index: number): number {
  return index % 2 === 0 ? CARD_BACK_PALETTE.topColor : CARD_BACK_PALETTE.bottomColor;
}
