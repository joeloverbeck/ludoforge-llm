export function parseSeedRange(raw) {
  if (raw.includes('..')) {
    const [left, right] = raw.split('..').map((part) => parsePositiveInt(part, 'seeds'));
    if (right < left) {
      throw new Error(`--seeds range must be ascending; got ${raw}`);
    }
    return Array.from({ length: right - left + 1 }, (_unused, index) => left + index);
  }
  return raw.split(',').filter(Boolean).map((part) => parsePositiveInt(part.trim(), 'seeds'));
}

export function formatSeedRange(seeds) {
  if (seeds.length > 1 && seeds.every((seed, index) => index === 0 || seed === seeds[index - 1] + 1)) {
    return `${seeds[0]}..${seeds.at(-1)}`;
  }
  return seeds.join(',');
}

export function flagBoolean(args, name) {
  return args.includes(`--${name}`);
}

export function flagValue(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1];
}

export function flagPositiveInt(args, name, fallback) {
  const raw = flagValue(args, name, undefined);
  return raw === undefined ? fallback : parsePositiveInt(raw, name);
}

export function parsePositiveInt(raw, name) {
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer; got "${raw}"`);
  }
  return value;
}
