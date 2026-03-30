import { beforeEach, describe, expect, it, vi } from 'vitest';

const { installMock, uninstallMock } = vi.hoisted(() => ({
  installMock: vi.fn(),
  uninstallMock: vi.fn(),
}));

vi.mock('pixi.js', () => ({
  BitmapFontManager: {
    install: installMock,
    uninstall: uninstallMock,
    ASCII: [[' ', '~']],
  },
}));

import {
  LABEL_FONT_NAME,
  STROKE_LABEL_FONT_NAME,
  installLabelBitmapFonts,
  resetBitmapFontRegistry,
} from '../../../src/canvas/text/bitmap-font-registry';

describe('bitmap-font-registry', () => {
  beforeEach(() => {
    resetBitmapFontRegistry();
    installMock.mockClear();
    uninstallMock.mockClear();
  });

  it('installs two bitmap fonts with expected options', () => {
    installLabelBitmapFonts(2);

    expect(installMock).toHaveBeenCalledTimes(2);

    const plainCall = installMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(plainCall.name).toBe(LABEL_FONT_NAME);
    expect((plainCall.style as Record<string, unknown>).fontFamily).toBe('monospace');
    expect((plainCall.style as Record<string, unknown>).fontSize).toBe(36);
    expect((plainCall.style as Record<string, unknown>).fill).toBe(0xffffff);
    expect(plainCall.resolution).toBe(2);
    expect(plainCall.chars).toEqual([[' ', '~']]);

    const strokeCall = installMock.mock.calls[1]![0] as Record<string, unknown>;
    expect(strokeCall.name).toBe(STROKE_LABEL_FONT_NAME);
    expect((strokeCall.style as Record<string, unknown>).stroke).toEqual({ color: 0x000000, width: 3 });
  });

  it('is idempotent — second call is a no-op', () => {
    installLabelBitmapFonts(1);
    installLabelBitmapFonts(1);

    expect(installMock).toHaveBeenCalledTimes(2); // only from first call
  });

  it('resetBitmapFontRegistry uninstalls and allows reinstallation', () => {
    installLabelBitmapFonts(1);
    expect(installMock).toHaveBeenCalledTimes(2);

    resetBitmapFontRegistry();
    expect(uninstallMock).toHaveBeenCalledTimes(2);
    expect(uninstallMock).toHaveBeenCalledWith(LABEL_FONT_NAME);
    expect(uninstallMock).toHaveBeenCalledWith(STROKE_LABEL_FONT_NAME);

    // Can install again after reset
    installMock.mockClear();
    installLabelBitmapFonts(1);
    expect(installMock).toHaveBeenCalledTimes(2);
  });

  it('resetBitmapFontRegistry is a no-op when not installed', () => {
    resetBitmapFontRegistry();
    expect(uninstallMock).not.toHaveBeenCalled();
  });
});
