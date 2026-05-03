#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const targetArgIndex = args.indexOf('--targets');
const targetNames = targetArgIndex === -1
  ? []
  : String(args[targetArgIndex + 1] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
const files = args.filter((arg, index) => (
  arg !== '--targets'
  && index !== targetArgIndex + 1
));

if (files.length === 0) {
  process.stderr.write('Usage: node parse-cpuprofile.mjs <profile.cpuprofile> [...] [--targets fnv1a64,resolveRef]\n');
  process.exit(1);
}

const shortUrl = (url) => {
  const marker = '/dist/';
  const distIndex = url.indexOf(marker);
  if (distIndex !== -1) {
    return url.slice(distIndex + marker.length);
  }
  return url === '' ? '(no-url)' : basename(url);
};

const nodeLabel = (node) => {
  if (node === undefined) {
    return '(root)';
  }
  const frame = node.callFrame ?? {};
  return `${frame.functionName || '(anonymous)'} ${shortUrl(frame.url || '')}:${frame.lineNumber ?? 0}`;
};

const increment = (map, key, amount = 1) => {
  map.set(key, (map.get(key) ?? 0) + amount);
};

const topLines = (map, limit) => [...map.entries()]
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  .slice(0, limit)
  .map(([key, count]) => `  ${count} ${key}`);

for (const file of files) {
  const profile = JSON.parse(readFileSync(file, 'utf8'));
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentByChild = new Map();
  for (const node of profile.nodes) {
    for (const childId of node.children ?? []) {
      parentByChild.set(childId, node.id);
    }
  }

  const selfByFunction = new Map();
  const selfByFile = new Map();
  for (const sampleId of profile.samples ?? []) {
    const node = nodes.get(sampleId);
    const frame = node?.callFrame ?? {};
    increment(selfByFunction, frame.functionName || '(anonymous)');
    increment(selfByFile, shortUrl(frame.url || ''));
  }

  console.log(`FILE ${file}`);
  console.log('TOP FUNCTIONS');
  console.log(topLines(selfByFunction, 30).join('\n'));
  console.log('TOP FILES');
  console.log(topLines(selfByFile, 30).join('\n'));

  for (const targetName of targetNames) {
    const parents = new Map();
    const stacks = new Map();
    let total = 0;

    for (const sampleId of profile.samples ?? []) {
      const node = nodes.get(sampleId);
      if ((node?.callFrame?.functionName || '(anonymous)') !== targetName) {
        continue;
      }
      total += 1;
      increment(parents, nodeLabel(nodes.get(parentByChild.get(sampleId))));

      const stack = [];
      let currentId = sampleId;
      for (let depth = 0; depth < 8 && currentId !== undefined; depth += 1) {
        stack.push(nodeLabel(nodes.get(currentId)));
        currentId = parentByChild.get(currentId);
      }
      increment(stacks, stack.join(' <- '));
    }

    console.log(`TARGET ${targetName} total=${total}`);
    console.log('PARENTS');
    console.log(topLines(parents, 12).join('\n'));
    console.log('STACKS');
    console.log(topLines(stacks, 8).join('\n'));
  }
}
