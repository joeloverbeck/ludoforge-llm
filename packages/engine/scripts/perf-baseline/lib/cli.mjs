export function parseArgs(argv) {
  const positional = [];
  const flags = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const equalsIndex = arg.indexOf('=');
    if (equalsIndex !== -1) {
      flags.set(arg.slice(2, equalsIndex), arg.slice(equalsIndex + 1));
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }

  return { positional, flags };
}

export function flagString(flags, name, fallback = null) {
  const value = flags.get(name);
  return typeof value === 'string' ? value : fallback;
}

export function flagBoolean(flags, name) {
  return flags.get(name) === true;
}

export function flagPositiveInteger(flags, name, fallback) {
  const value = flags.get(name);
  if (value === undefined || value === true) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer; got "${value}"`);
  }
  return parsed;
}

export function requireWorkloadArg(positional, usage) {
  const workload = positional[0];
  if (workload === undefined) {
    throw new Error(usage);
  }
  return workload;
}
