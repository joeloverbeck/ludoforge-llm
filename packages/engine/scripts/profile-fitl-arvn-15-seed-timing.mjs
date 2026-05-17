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
        batchSizeSum: Number(after.batchSizeSum ?? 0) - Number(before.batchSizeSum ?? 0),
        batchSizeMin: Number(after.batchSizeMin ?? 0),
        batchSizeMax: Number(after.batchSizeMax ?? 0),
        batchSizeHistogram: deltaHistogram(after.batchSizeHistogram, before.batchSizeHistogram),
      };
    })
    .filter((row) =>
      row.callCount > 0
      || row.marshalingNs > 0
      || row.executionNs > 0
      || row.deserializationNs > 0
      || row.batchSizeSum > 0,
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
      batchSizeSum: 0,
      batchSizeMin: 0,
      batchSizeMax: 0,
      batchSizeHistogram: {},
    };
    target.set(row.routeClass, {
      routeClass: row.routeClass,
      marshalingNs: current.marshalingNs + row.marshalingNs,
      executionNs: current.executionNs + row.executionNs,
      deserializationNs: current.deserializationNs + row.deserializationNs,
      callCount: current.callCount + row.callCount,
      batchSizeSum: current.batchSizeSum + Number(row.batchSizeSum ?? 0),
      batchSizeMin: minPositive(current.batchSizeMin, row.batchSizeMin),
      batchSizeMax: Math.max(current.batchSizeMax, Number(row.batchSizeMax ?? 0)),
      batchSizeHistogram: addHistograms(current.batchSizeHistogram, row.batchSizeHistogram),
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
      batchSizeMean: row.callCount > 0 ? round4(row.batchSizeSum / row.callCount) : 0,
      batchSizeMin: row.batchSizeMin,
      batchSizeMax: row.batchSizeMax,
      batchSizeHistogram: row.batchSizeHistogram,
    }))
    .sort((left, right) => compareCodepoint(left.routeClass, right.routeClass));
}

function deltaHistogram(afterHistogram, beforeHistogram) {
  const labels = new Set([
    ...Object.keys(afterHistogram ?? {}),
    ...Object.keys(beforeHistogram ?? {}),
  ]);
  const result = {};
  for (const label of labels) {
    const count = Number(afterHistogram?.[label] ?? 0) - Number(beforeHistogram?.[label] ?? 0);
    if (count > 0) {
      result[label] = count;
    }
  }
  return result;
}

function addHistograms(left, right) {
  const result = { ...(left ?? {}) };
  for (const [label, count] of Object.entries(right ?? {})) {
    result[label] = Number(result[label] ?? 0) + Number(count ?? 0);
  }
  return result;
}

function minPositive(left, right) {
  const normalizedRight = Number(right ?? 0);
  if (normalizedRight <= 0) {
    return left;
  }
  return left <= 0 ? normalizedRight : Math.min(left, normalizedRight);
}

export function deltaSerializationStats(afterStats, beforeStats) {
  return Object.entries(afterStats ?? {})
    .map(([axisLabel, after]) => {
      const before = beforeStats?.[axisLabel] ?? {};
      return {
        axisLabel,
        totalBytes: Number(after.totalBytes ?? 0) - Number(before.totalBytes ?? 0),
        callCount: Number(after.callCount ?? 0) - Number(before.callCount ?? 0),
      };
    })
    .filter((row) => row.totalBytes > 0 || row.callCount > 0)
    .sort((left, right) => compareCodepoint(left.axisLabel, right.axisLabel));
}

export function serializationDelta(afterStats, beforeStats, key) {
  return deltaSerializationStats(afterStats, beforeStats)
    .reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

export function addSerializationStats(target, rows) {
  for (const row of rows ?? []) {
    const current = target.get(row.axisLabel) ?? { axisLabel: row.axisLabel, totalBytes: 0, callCount: 0 };
    target.set(row.axisLabel, {
      axisLabel: row.axisLabel,
      totalBytes: current.totalBytes + row.totalBytes,
      callCount: current.callCount + row.callCount,
    });
  }
}

export function serializationRows(rowsByAxis) {
  return [...rowsByAxis.values()]
    .sort((left, right) => compareCodepoint(left.axisLabel, right.axisLabel));
}

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
