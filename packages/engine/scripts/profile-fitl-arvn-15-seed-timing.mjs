export function deltaTimingBuckets(afterBuckets, beforeBuckets) {
  return Object.entries(afterBuckets ?? {})
    .map(([routeClass, after]) => {
      const before = beforeBuckets?.[routeClass] ?? {};
      return {
        routeClass,
        marshalingNs: Number(after.marshalingNs ?? 0) - Number(before.marshalingNs ?? 0),
        executionNs: Number(after.executionNs ?? 0) - Number(before.executionNs ?? 0),
        deserializationNs: Number(after.deserializationNs ?? 0) - Number(before.deserializationNs ?? 0),
        callCount: Number(after.callCount ?? 0) - Number(before.callCount ?? 0),
      };
    })
    .filter((row) =>
      row.callCount > 0
      || row.marshalingNs > 0
      || row.executionNs > 0
      || row.deserializationNs > 0,
    )
    .sort((left, right) => compareCodepoint(left.routeClass, right.routeClass));
}

export function timingDelta(afterBuckets, beforeBuckets, key) {
  return deltaTimingBuckets(afterBuckets, beforeBuckets)
    .reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

export function timingDeltaMs(afterBuckets, beforeBuckets, key) {
  return round4(timingDelta(afterBuckets, beforeBuckets, key) / 1_000_000);
}

export function addTimingBuckets(target, rows) {
  for (const row of rows ?? []) {
    const current = target.get(row.routeClass) ?? {
      routeClass: row.routeClass,
      marshalingNs: 0,
      executionNs: 0,
      deserializationNs: 0,
      callCount: 0,
    };
    target.set(row.routeClass, {
      routeClass: row.routeClass,
      marshalingNs: current.marshalingNs + row.marshalingNs,
      executionNs: current.executionNs + row.executionNs,
      deserializationNs: current.deserializationNs + row.deserializationNs,
      callCount: current.callCount + row.callCount,
    });
  }
}

export function timingRows(rowsByClass) {
  return [...rowsByClass.values()]
    .map((row) => ({
      routeClass: row.routeClass,
      marshalingMs: round4(row.marshalingNs / 1_000_000),
      executionMs: round4(row.executionNs / 1_000_000),
      deserializationMs: round4(row.deserializationNs / 1_000_000),
      callCount: row.callCount,
    }))
    .sort((left, right) => compareCodepoint(left.routeClass, right.routeClass));
}

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
