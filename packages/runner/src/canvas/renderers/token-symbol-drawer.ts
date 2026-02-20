interface TokenSymbolGraphics {
  clear(): TokenSymbolGraphics;
  circle(x: number, y: number, radius: number): TokenSymbolGraphics;
  poly(points: number[]): TokenSymbolGraphics;
  fill(style: { color: number; alpha?: number }): TokenSymbolGraphics;
}

type TokenSymbolDrawer = (
  graphics: TokenSymbolGraphics,
  size: number,
  color: number,
) => void;

const DEFAULT_SYMBOL_COLOR = 0xf8fafc;

const tokenSymbolDrawers: Record<string, TokenSymbolDrawer> = {
  star: (graphics, size, color) => {
    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.45;
    const points: number[] = [];

    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      const angle = -Math.PI / 2 + index * (Math.PI / 5);
      points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }

    graphics.poly(points).fill({ color });
  },
  diamond: (graphics, size, color) => {
    const radius = size / 2;
    graphics
      .poly([0, -radius, radius, 0, 0, radius, -radius, 0])
      .fill({ color });
  },
  cross: (graphics, size, color) => {
    const half = size / 2;
    const arm = size * 0.2;

    graphics
      .poly([
        -arm,
        -half,
        arm,
        -half,
        arm,
        -arm,
        half,
        -arm,
        half,
        arm,
        arm,
        arm,
        arm,
        half,
        -arm,
        half,
        -arm,
        arm,
        -half,
        arm,
        -half,
        -arm,
        -arm,
        -arm,
      ])
      .fill({ color });
  },
  'circle-dot': (graphics, size, color) => {
    const radius = size / 2;
    graphics.circle(0, 0, radius).fill({ color, alpha: 0.95 });
    graphics.circle(0, 0, radius * 0.36).fill({ color: 0x0f172a, alpha: 0.92 });
  },
};

export function drawTokenSymbol(
  graphics: TokenSymbolGraphics,
  symbolId: string | null | undefined,
  size: number,
  color: number = DEFAULT_SYMBOL_COLOR,
): void {
  graphics.clear();

  const normalizedSymbol = typeof symbolId === 'string' ? symbolId.trim() : '';
  if (normalizedSymbol.length === 0) {
    return;
  }

  const drawer = tokenSymbolDrawers[normalizedSymbol];
  if (drawer === undefined) {
    return;
  }

  drawer(graphics, Math.max(1, size), color);
}

export function getTokenSymbolDrawerRegistry(): Readonly<Record<string, TokenSymbolDrawer>> {
  return tokenSymbolDrawers;
}
