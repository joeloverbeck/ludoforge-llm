import { describe, expect, it } from 'vitest';

import { parseHexColor } from '../../src/rendering/color-utils.js';

describe('color-utils', () => {
  it('parseHexColor enforces strict #RRGGBB by default and supports optional #RGB mode', () => {
    expect(parseHexColor('#e63946')).toBe(0xe63946);
    expect(parseHexColor('#abc')).toBeNull();
    expect(parseHexColor('#abc', { allowShortHex: true })).toBe(0xaabbcc);
    expect(parseHexColor('bright-blue', { allowNamedColors: true })).toBe(0x00bfff);
    expect(parseHexColor('olive', { allowNamedColors: true })).toBe(0x808000);
    expect(parseHexColor('invalid')).toBeNull();
  });
});
