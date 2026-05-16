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
    'wasmScoreRowRouteCount',
    'wasmScoreRowUnsupportedCount',
    'wasmPreviewCandidateFeatureRowRouteCount',
    'wasmPreviewCandidateFeatureRowUnsupportedCount',
    'wasmProductionPreviewDriveRouteCount',
    'wasmProductionPreviewDriveUnsupportedCount',
    'wasmProductionPreviewDriveBatchCount',
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
    `- WASM production preview-drive route count: ${sumAggregateField(rollup.perDecisionClass, 'wasmProductionPreviewDriveRouteCount')}`,
    `- WASM production preview-drive unsupported count: ${sumAggregateField(rollup.perDecisionClass, 'wasmProductionPreviewDriveUnsupportedCount')}`,
    `- WASM production preview-drive batch count: ${sumAggregateField(rollup.perDecisionClass, 'wasmProductionPreviewDriveBatchCount')}`,
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
    '| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive batches | Token index builds | Static rebuilds |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rollup.perDecisionClass.map((row) => renderAggregateRow(row.key, row)),
    '',
    '## Top Hot Axes In Slow-Tier Seeds',
    '',
    'Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.',
    '',
    '| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |',
    '|---:|---|---|---:|---:|---:|---:|---:|',
    ...rollup.topNHotAxes.map((row, index) => [
      `| ${index + 1}`,
      row.microturnClass,
      row.previewBranch,
      row.count,
      formatNumber(row.totalMs),
      formatNumber(row.meanMs),
      formatNumber(row.p95Ms),
      `${formatNumber(row.maxMs)} |`,
    ].join(' | ')),
    ...(profileBuckets ? renderHotPathBucketSection(rollup.topNHotAxes) : []),
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
    row.wasmProductionPreviewDriveRouteCount,
    row.wasmProductionPreviewDriveUnsupportedCount,
    row.wasmProductionPreviewDriveBatchCount,
    row.tokenStateIndexBuildCount,
    `${row.staticRebuildCount} |`,
  ].join(' | ');
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
