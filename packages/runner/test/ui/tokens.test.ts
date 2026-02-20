import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import '../../src/ui/tokens.css';

interface ScreenLayoutContract {
  readonly cssPath: string;
  readonly requiredTokens: readonly string[];
}

const TOP_LEVEL_SCREEN_LAYOUT_CONTRACTS: readonly ScreenLayoutContract[] = [
  {
    cssPath: 'src/ui/GameContainer.module.css',
    requiredTokens: ['width: 100%;', 'min-height: 100%;'],
  },
  {
    cssPath: 'src/ui/ReplayScreen.module.css',
    requiredTokens: ['min-height: 100%;'],
  },
  {
    cssPath: 'src/ui/GameSelectionScreen.module.css',
    requiredTokens: ['min-height: 100%;'],
  },
  {
    cssPath: 'src/ui/PreGameConfigScreen.module.css',
    requiredTokens: ['min-height: 100%;'],
  },
];

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
    for (const contract of TOP_LEVEL_SCREEN_LAYOUT_CONTRACTS) {
      const css = readFileSync(resolve(process.cwd(), contract.cssPath), 'utf-8');
      for (const token of contract.requiredTokens) {
        expect(css).toContain(token);
      }
      expect(css).not.toMatch(/100vw|100vh/u);
    }
  });
});
