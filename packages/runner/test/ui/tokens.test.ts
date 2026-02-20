import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import '../../src/ui/tokens.css';

describe('tokens.css', () => {
  it('imports without throwing', () => {
    expect(true).toBe(true);
  });

  it('defines root sizing reset without global overflow suppression', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/ui/tokens.css'), 'utf-8');
    const rootReset = css.match(/html,\s*body,\s*#root\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(rootReset).toContain('margin: 0;');
    expect(rootReset).toContain('width: 100%;');
    expect(rootReset).toContain('height: 100%;');
    expect(rootReset).not.toContain('overflow: hidden;');
    expect(css).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box;[^}]*\}/u);
  });

  it('keeps top-level screen layout on root-chain sizing instead of viewport units', () => {
    const gameContainerCss = readFileSync(resolve(process.cwd(), 'src/ui/GameContainer.module.css'), 'utf-8');
    const replayScreenCss = readFileSync(resolve(process.cwd(), 'src/ui/ReplayScreen.module.css'), 'utf-8');

    expect(gameContainerCss).toContain('width: 100%;');
    expect(gameContainerCss).toContain('min-height: 100%;');
    expect(gameContainerCss).not.toMatch(/100vw|100vh/u);

    expect(replayScreenCss).toContain('min-height: 100%;');
    expect(replayScreenCss).not.toMatch(/100vh/u);
  });
});
