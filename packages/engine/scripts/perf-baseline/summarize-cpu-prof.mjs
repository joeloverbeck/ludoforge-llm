#!/usr/bin/env node

import { writeFileSync } from 'node:fs';

import { flagBoolean, parseArgs, requireWorkloadArg } from './lib/cli.mjs';
import { readJsonFile, writeJsonFile } from './lib/json.mjs';

try {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const profilePath = requireWorkloadArg(
    positional,
    'usage: summarize-cpu-prof.mjs <cpuprofile-path>',
  );
  const profile = readJsonFile(profilePath);
  const summary = summarizeCpuProfile(profile);
  const summaryPath = `${profilePath}.summary.json`;
  writeJsonFile(summaryPath, summary);
  writeFileSync(`${profilePath}.summary.md`, renderMarkdown(summary));
  if (flagBoolean(flags, 'json-only')) {
    process.stdout.write(`${JSON.stringify({ ...summary, summaryPath }, null, 2)}\n`);
  } else {
    process.stdout.write(renderMarkdown(summary));
    process.stdout.write(`\nJSON summary: ${summaryPath}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

export function summarizeCpuProfile(profile) {
  const nodes = profile.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const selfTimeById = new Map(nodes.map((node) => [node.id, 0]));
  const totalTimeById = new Map(nodes.map((node) => [node.id, 0]));
  const samples = profile.samples ?? [];
  const timeDeltas = profile.timeDeltas ?? [];

  samples.forEach((nodeId, index) => {
    const delta = timeDeltas[index] ?? 0;
    selfTimeById.set(nodeId, (selfTimeById.get(nodeId) ?? 0) + delta);
  });

  for (const [nodeId, selfTime] of selfTimeById.entries()) {
    let current = nodeById.get(nodeId);
    while (current !== undefined) {
      totalTimeById.set(current.id, (totalTimeById.get(current.id) ?? 0) + selfTime);
      current = findParent(nodes, current.id);
    }
  }

  const rows = nodes.map((node) => ({
    functionName: node.callFrame?.functionName || '(anonymous)',
    url: node.callFrame?.url || '(native)',
    lineNumber: node.callFrame?.lineNumber ?? null,
    columnNumber: node.callFrame?.columnNumber ?? null,
    hitCount: node.hitCount ?? 0,
    selfTimeMs: roundMicroseconds(selfTimeById.get(node.id) ?? 0),
    totalTimeMs: roundMicroseconds(totalTimeById.get(node.id) ?? 0),
  }));

  return {
    samples: samples.length,
    totalTimeMs: roundMicroseconds(timeDeltas.reduce((sum, value) => sum + value, 0)),
    top30SelfTime: topRows(rows, 'selfTimeMs'),
    top30TotalTime: topRows(rows, 'totalTimeMs'),
  };
}

function findParent(nodes, childId) {
  return nodes.find((node) => (node.children ?? []).includes(childId));
}

function topRows(rows, field) {
  return rows
    .filter((row) => row[field] > 0)
    .sort((left, right) => right[field] - left[field])
    .slice(0, 30);
}

function roundMicroseconds(value) {
  return Number((value / 1000).toFixed(3));
}

function renderMarkdown(summary) {
  return [
    `# CPU profile summary`,
    ``,
    `Samples: ${summary.samples}`,
    `Total time: ${summary.totalTimeMs} ms`,
    ``,
    `## Top self time`,
    renderTable(summary.top30SelfTime, 'selfTimeMs'),
    ``,
    `## Top total time`,
    renderTable(summary.top30TotalTime, 'totalTimeMs'),
    ``,
  ].join('\n');
}

function renderTable(rows, field) {
  const lines = [
    '| Function | URL | Time ms | Hits |',
    '|---|---:|---:|---:|',
  ];
  for (const row of rows) {
    const location = row.lineNumber === null ? row.url : `${row.url}:${row.lineNumber + 1}`;
    lines.push(`| ${escapeCell(row.functionName)} | ${escapeCell(location)} | ${row[field]} | ${row.hitCount} |`);
  }
  return lines.join('\n');
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|');
}
