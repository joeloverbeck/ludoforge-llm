/**
 * Pre-installs bitmap fonts used by game label renderers.
 *
 * BitmapText avoids PixiJS's TexturePool code path entirely (unlike Text),
 * eliminating the crash from TexturePool.returnTexture (PixiJS #11735).
 *
 * Two fonts are registered:
 * - LABEL_FONT_NAME: plain monospace for badges and counts
 * - STROKE_LABEL_FONT_NAME: monospace with black stroke for zone labels
 *
 * A single font at 14px (the largest needed size) scales down cleanly to
 * 10px and 11px. BitmapText handles this scaling internally.
 */
import { BitmapFontManager } from 'pixi.js';

export const LABEL_FONT_NAME = 'ludoforge-label';
export const STROKE_LABEL_FONT_NAME = 'ludoforge-label-stroke';

let installed = false;

export function installLabelBitmapFonts(resolution?: number): void {
  if (installed) {
    return;
  }

  const res = resolution ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1);

  BitmapFontManager.install({
    name: LABEL_FONT_NAME,
    style: {
      fontFamily: 'monospace',
      fontSize: 14,
      fill: 0xffffff,
    },
    chars: BitmapFontManager.ASCII,
    resolution: res,
  });

  BitmapFontManager.install({
    name: STROKE_LABEL_FONT_NAME,
    style: {
      fontFamily: 'monospace',
      fontSize: 14,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3 },
    },
    chars: BitmapFontManager.ASCII,
    resolution: res,
  });

  installed = true;
}

/** Reset for testing — uninstalls both fonts and clears the installed flag. */
export function resetBitmapFontRegistry(): void {
  if (!installed) {
    return;
  }
  try { BitmapFontManager.uninstall(LABEL_FONT_NAME); } catch { /* already removed */ }
  try { BitmapFontManager.uninstall(STROKE_LABEL_FONT_NAME); } catch { /* already removed */ }
  installed = false;
}
