import { describe, expect, it } from 'vitest';

import styles from '../../src/ui/shared.module.css';

describe('shared.module.css', () => {
  it('exports expected composable class keys', () => {
    expect(styles).toMatchObject({
      panel: expect.any(String),
      panelHover: expect.any(String),
      interactive: expect.any(String),
      textPrimary: expect.any(String),
      textSecondary: expect.any(String),
      textMuted: expect.any(String),
      fontMono: expect.any(String),
      fontUi: expect.any(String),
      srOnly: expect.any(String),
    });
  });
});
