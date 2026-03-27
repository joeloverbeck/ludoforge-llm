export interface ParseHexColorOptions {
  readonly allowShortHex?: boolean;
  readonly allowNamedColors?: boolean;
}

const DEFAULT_PARSE_HEX_COLOR_OPTIONS: ParseHexColorOptions = {
  allowShortHex: false,
  allowNamedColors: false,
};

const NAMED_COLOR_MAP: Readonly<Record<string, number>> = {
  red: 0xff0000,
  yellow: 0xffff00,
  orange: 0xffa500,
  olive: 0x808000,
  blue: 0x0000ff,
  'bright-blue': 0x00bfff,
  brightblue: 0x00bfff,
  cyan: 0x00ffff,
  green: 0x008000,
  black: 0x000000,
  white: 0xffffff,
  gray: 0x808080,
  grey: 0x808080,
};

export function parseHexColor(
  color: string | undefined,
  options: ParseHexColorOptions = DEFAULT_PARSE_HEX_COLOR_OPTIONS,
): number | null {
  if (typeof color !== 'string') {
    return null;
  }

  const normalized = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return Number.parseInt(normalized.slice(1), 16);
  }

  if (options.allowShortHex === true && /^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const [r, g, b] = normalized.slice(1);
    return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
  }

  if (options.allowNamedColors === true) {
    const named = NAMED_COLOR_MAP[normalized.toLowerCase()];
    if (named !== undefined) {
      return named;
    }
  }

  return null;
}
