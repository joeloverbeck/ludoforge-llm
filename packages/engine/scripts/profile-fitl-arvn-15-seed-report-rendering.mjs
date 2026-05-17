export function renderCsv(rows) {
  const headers = [
    'seed',
    'decisionIndex',
    'microturnClass',
    'elapsedMs',
    'previewBranch',
    'candidateCount',
    'encodedStateBuildCount',
    'encodedStateCacheObjectHitCount',
    'encodedStateCacheHashHitCount',
    'encodedStateCacheMissCount',
    'bytecodeCacheCompileCount',
    'cacheHits',
    'cacheMisses',
    'cacheCompileTimeMs',
    'wasmScoreRowRouteCount',
    'wasmScoreRowUnsupportedCount',
    'wasmPreviewCandidateFeatureRowRouteCount',
    'wasmPreviewCandidateFeatureRowUnsupportedCount',
    'wasmProductionPreviewDriveRouteCount',
    'wasmProductionPreviewDriveUnsupportedCount',
    'wasmProductionPreviewDriveUnsupportedReasons',
    'wasmProductionPreviewDriveBatchCount',
    'marshalingMs',
    'executionMs',
    'deserializationMs',
    'wasmCallCount',
    'wasmTimingBuckets',
    'bytesSerialized',
    'serializationCallCount',
    'wasmSerializationStats',
    'cacheWriteMs',
    'cacheWriteBytes',
    'cacheWriteCount',
    'tokenStateIndexBuildCount',
    'persistentTokenStateIndexCacheHitCount',
    'persistentTokenStateIndexCacheMissCount',
    'persistentTokenStateIndexCacheWriteCount',
    'zobristKeyCacheHitCount',
    'zobristKeyCacheMissCount',
    'staticRebuildCount',
    'hotPathBuckets',
    'seatId',
    'profileId',
    'turnCount',
    'turnId',
    'decisionKind',
    'previewCapClass',
    'selectedStableMoveKey',
  ];
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n') + '\n';
}

export function renderMarkdown(rollup, options) {
  const { csvPath, profileBuckets, relativeToRepo } = options;
  const lines = [
    '# FITL ARVN 15-Seed Per-Microturn-Class Decomposition',
    '',
    `**Date**: ${rollup.date}`,
    '**Status**: Spec 173 measurement witness.',
    `**Command**: \`${rollup.command}\``,
    `**CSV**: \`${relativeToRepo(csvPath)}\``,
    '',
    '## Summary',
    '',
    `- Seeds completed: ${rollup.perSeed.filter((row) => row.status === 'OK').length}/${rollup.seedCount}`,
    `- Per-decision rows: ${rollup.acceptance.reportRowCount}`,
    `- Hot class with slow:fast ratio >3x: ${rollup.acceptance.hotAxisOver3x ? 'yes' : 'no'}`,
    `- Per-seed timeout: ${rollup.timeoutMs} ms`,
    `- Hot-path buckets: ${profileBuckets ? 'enabled' : 'disabled'}`,
    `- WASM mode: ${rollup.noWasm ? 'disabled via --no-wasm' : 'enabled'}`,
    `- WASM timing profile: ${rollup.wasmTimingProfile ? 'enabled' : 'disabled'}`,
    `- WASM production preview-drive route count: ${sumAggregateField(rollup.perDecisionClass, 'wasmProductionPreviewDriveRouteCount')}`,
    `- WASM production preview-drive unsupported count: ${sumAggregateField(rollup.perDecisionClass, 'wasmProductionPreviewDriveUnsupportedCount')}`,
    `- WASM production preview-drive batch count: ${sumAggregateField(rollup.perDecisionClass, 'wasmProductionPreviewDriveBatchCount')}`,
    `- WASM timing call count: ${sumAggregateField(rollup.perDecisionClass, 'wasmCallCount')}`,
    `- WASM serialized input bytes: ${sumAggregateField(rollup.perDecisionClass, 'bytesSerialized')}`,
    `- Bytecode input cache write bytes: ${sumAggregateField(rollup.perDecisionClass, 'cacheWriteBytes')}`,
    '',
    '## Per-Seed Wall Time',
    '',
    '| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |',
    '|---:|---|---|---:|---:|---:|---|',
    ...rollup.perSeed.map((row) => [
      `| ${row.seed}`,
      row.status,
      row.stopReason,
      formatNumber(row.elapsedMs),
      row.decisions,
      row.decisions > 0 ? formatNumber(row.elapsedMs / row.decisions) : 'n/a',
      `${row.error === null ? '' : markdownCell(row.error)} |`,
    ].join(' | ')),
    '',
    '## Per-Microturn-Class Rollup',
    '',
    '| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rollup.perDecisionClass.map((row) => renderAggregateRow(row.key, row)),
    '',
    '## Top Hot Axes In Slow-Tier Seeds',
    '',
    'Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.',
    '',
    '| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |',
    '|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rollup.topNHotAxes.map((row, index) => [
      `| ${index + 1}`,
      row.microturnClass,
      row.previewBranch,
      row.count,
      formatNumber(row.totalMs),
      formatNumber(row.meanMs),
      formatNumber(row.p95Ms),
      formatNumber(row.maxMs),
      row.cacheHits,
      row.cacheMisses,
      `${formatNumber(row.cacheCompileTimeMs)} |`,
    ].join(' | ')),
    ...(profileBuckets ? renderHotPathBucketSection(rollup.topNHotAxes) : []),
    ...renderWasmTimingSection(rollup.perDecisionClass),
    ...renderWasmSerializationSection(rollup.perDecisionClass),
    ...renderUnsupportedReasonSection(rollup.perDecisionClass),
    '',
    '## Fast-Tier vs Slow-Tier Delta',
    '',
    'Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.',
    '',
    '| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |',
    '|---|---:|---:|---:|---:|---:|---|',
    ...rollup.fastSlowDeltas.map((row) => [
      `| ${row.microturnClass}`,
      row.slowDecisions,
      row.fastDecisions,
      formatNumber(row.slowMeanMs),
      formatNumber(row.fastMeanMs),
      formatNumber(row.ratio),
      `${row.ratio > 3 ? 'hot axis' : ''} |`,
    ].join(' | ')),
    '',
    '## Notes',
    '',
    '- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.',
    '- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.',
    '- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.',
    '- The script does not modify engine source or production profile data.',
    '',
  ];
  return lines.join('\n');
}

function renderAggregateRow(label, row) {
  return [
    `| ${label}`,
    row.count,
    formatNumber(row.totalMs),
    formatNumber(row.meanMs),
    formatNumber(row.p95Ms),
    formatNumber(row.maxMs),
    formatNumber(row.meanCandidateCount),
    row.encodedStateBuildCount,
    row.encodedStateCacheObjectHitCount,
    row.encodedStateCacheHashHitCount,
    row.encodedStateCacheMissCount,
    row.bytecodeCacheCompileCount,
    row.cacheHits,
    row.cacheMisses,
    formatNumber(row.cacheCompileTimeMs),
    row.wasmProductionPreviewDriveRouteCount,
    row.wasmProductionPreviewDriveUnsupportedCount,
    formatReasonCounts(row.wasmProductionPreviewDriveUnsupportedReasons),
    row.wasmProductionPreviewDriveBatchCount,
    row.wasmCallCount,
    formatNumber(row.marshalingMs),
    formatNumber(row.executionMs),
    formatNumber(row.deserializationMs),
    row.bytesSerialized,
    formatNumber(row.cacheWriteMs),
    row.cacheWriteBytes,
    row.cacheWriteCount,
    row.tokenStateIndexBuildCount,
    `${row.staticRebuildCount} |`,
  ].join(' | ');
}

function renderWasmTimingSection(rows) {
  const timingRows = rows
    .flatMap((row) => (row.wasmTimingBuckets ?? []).map((bucket) => ({
      microturnClass: row.key,
      ...bucket,
    })))
    .filter((row) => row.callCount > 0)
    .sort((left, right) =>
      right.callCount - left.callCount
      || compareCodepoint(left.microturnClass, right.microturnClass)
      || compareCodepoint(left.routeClass, right.routeClass),
    );
  if (timingRows.length === 0) {
    return [
      '',
      '## WASM Timing Buckets',
      '',
      '_No WASM timing buckets recorded._',
    ];
  }
  return [
    '',
    '## WASM Timing Buckets',
    '',
    '| Microturn class | Route class | Calls | Marshaling ms | Execution ms | Deserialization ms |',
    '|---|---|---:|---:|---:|---:|',
    ...timingRows.map((row) => [
      `| ${row.microturnClass}`,
      row.routeClass,
      row.callCount,
      formatNumber(row.marshalingMs),
      formatNumber(row.executionMs),
      `${formatNumber(row.deserializationMs)} |`,
    ].join(' | ')),
  ];
}

function renderWasmSerializationSection(rows) {
  const serializationRows = rows
    .flatMap((row) => (row.wasmSerializationStats ?? []).map((stats) => ({
      microturnClass: row.key,
      ...stats,
    })))
    .filter((row) => row.callCount > 0 || row.totalBytes > 0)
    .sort((left, right) =>
      right.totalBytes - left.totalBytes
      || compareCodepoint(left.microturnClass, right.microturnClass)
      || compareCodepoint(left.axisLabel, right.axisLabel),
    );
  if (serializationRows.length === 0) {
    return [
      '',
      '## WASM Serialization Stats',
      '',
      '_No WASM serialization stats recorded._',
    ];
  }
  return [
    '',
    '## WASM Serialization Stats',
    '',
    '| Microturn class | Axis label | Calls | Total bytes | Bytes/call | Cache write ms | Cache write bytes | Cache write count |',
    '|---|---|---:|---:|---:|---:|---:|---:|',
    ...serializationRows.map((row) => {
      const aggregate = rows.find((candidate) => candidate.key === row.microturnClass);
      return [
        `| ${row.microturnClass}`,
        row.axisLabel,
        row.callCount,
        row.totalBytes,
        formatNumber(row.callCount > 0 ? row.totalBytes / row.callCount : 0),
        formatNumber(aggregate?.cacheWriteMs ?? 0),
        aggregate?.cacheWriteBytes ?? 0,
        `${aggregate?.cacheWriteCount ?? 0} |`,
      ].join(' | ');
    }),
  ];
}

function renderUnsupportedReasonSection(rows) {
  const reasonRows = rows
    .filter((row) => row.wasmProductionPreviewDriveUnsupportedCount > 0)
    .flatMap((row) => (row.wasmProductionPreviewDriveUnsupportedReasons ?? []).map((reason) => ({
      microturnClass: row.key,
      routeCount: row.wasmProductionPreviewDriveRouteCount,
      unsupportedCount: row.wasmProductionPreviewDriveUnsupportedCount,
      ...reason,
    })))
    .sort((left, right) =>
      right.count - left.count
      || compareCodepoint(left.microturnClass, right.microturnClass)
      || compareCodepoint(left.unsupportedDriveClass, right.unsupportedDriveClass)
      || compareCodepoint(left.unsupportedOwner ?? '', right.unsupportedOwner ?? '')
      || compareCodepoint(left.reason, right.reason),
    );
  if (reasonRows.length === 0) {
    return [
      '',
      '## WASM Preview-Drive Unsupported Reasons',
      '',
      '_No reason-granular unsupported preview-drive rows recorded._',
    ];
  }
  return [
    '',
    '## WASM Preview-Drive Unsupported Reasons',
    '',
    '| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |',
    '|---|---|---|---|---:|---:|---:|',
    ...reasonRows.map((row) => [
      `| ${row.microturnClass}`,
      row.unsupportedDriveClass,
      row.unsupportedOwner ?? '',
      markdownCell(row.reason),
      row.count,
      row.unsupportedCount,
      `${row.routeCount} |`,
    ].join(' | ')),
  ];
}

function formatReasonCounts(rows) {
  if ((rows ?? []).length === 0) {
    return '';
  }
  return rows.map((row) => {
    const owner = row.unsupportedOwner === undefined ? 'unknown' : row.unsupportedOwner;
    return `${row.unsupportedDriveClass}/${owner}/${row.reason}:${row.count}`;
  }).join('; ');
}

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function renderHotPathBucketSection(rows) {
  const lines = [
    '',
    '## Hot-Path Buckets For Top Slow Axes',
    '',
    'Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.',
    '',
  ];
  for (const row of rows) {
    lines.push(`### ${row.microturnClass} | ${row.previewBranch}`);
    if ((row.hotPathBuckets ?? []).length === 0) {
      lines.push('', '_No hot-path buckets recorded._', '');
      continue;
    }
    lines.push(
      '',
      '| Bucket | Count | Total ms |',
      '|---|---:|---:|',
      ...row.hotPathBuckets.map((bucket) => [
        `| ${bucket.key}`,
        bucket.count,
        `${formatNumber(bucket.totalMs)} |`,
      ].join(' | ')),
      '',
    );
  }
  return lines;
}

function sumAggregateField(rows, field) {
  return rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
}

function csvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replace(/\s+/g, ' ').slice(0, 160);
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(round4(value)) : 'n/a';
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
