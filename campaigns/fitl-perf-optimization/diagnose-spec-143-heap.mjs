#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import v8 from 'node:v8';

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  let cursor = HERE;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) return cursor;
    cursor = join(cursor, '..');
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();
const args = process.argv.slice(2);

function getArg(name, defaultValue) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : defaultValue;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function asInt(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe integer, received ${String(value)}`);
  }
  return parsed;
}

function roundMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function formatBytes(bytes) {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GiB`;
  }
  return `${mb.toFixed(2)} MiB`;
}

function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-');
}

const SEED = asInt(getArg('seed', '1002'), 'seed');
const MAX_TURNS = asInt(getArg('max-turns', '3'), 'max-turns');
const PLAYER_COUNT = asInt(getArg('players', '4'), 'players');
const SAMPLE_EVERY_DECISIONS = asInt(getArg('sample-every-decisions', '25'), 'sample-every-decisions');
const SNAPSHOT_EVERY_DECISIONS = asInt(getArg('snapshot-every-decisions', '0'), 'snapshot-every-decisions');
const TOP_N = asInt(getArg('top', '12'), 'top');
const OUTPUT_DIR = resolve(getArg('output-dir', join('/tmp', 'ludoforge-spec-143-heap')));
const KEEP_OLD = hasFlag('keep-old');
const TRACE_LEVEL = getArg('trace-level', 'summary');
const PROFILES_OVERRIDE = getArg('profiles', '');

if (SAMPLE_EVERY_DECISIONS <= 0) {
  throw new Error('--sample-every-decisions must be > 0');
}

if (SNAPSHOT_EVERY_DECISIONS < 0) {
  throw new Error('--snapshot-every-decisions must be >= 0');
}

if (!KEEP_OLD) {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
mkdirSync(OUTPUT_DIR, { recursive: true });

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));
const {
  advanceAutoresolvable,
  applyPublishedDecision,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  terminalResult,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));

const CHANCE_RNG_MIX = 0x9e3779b97f4a7c15n;
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;

function createAgentRngByPlayer(seed, playerCount) {
  return Array.from(
    { length: playerCount },
    (_, playerIndex) => createRng(BigInt(seed) ^ (BigInt(playerIndex + 1) * AGENT_RNG_MIX)),
  );
}

function resolvePlayerIndexForSeat(def, seatId) {
  const explicitIndex = (def.seats ?? []).findIndex((seat) => seat.id === seatId);
  if (explicitIndex >= 0) {
    return explicitIndex;
  }
  const parsed = Number(seatId);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
}

function isNoBridgeableMicroturnError(error) {
  return error instanceof Error
    && (
      error.message.includes('no simple actionSelection moves are currently bridgeable')
      || error.message.includes('has no bridgeable continuations')
    );
}

function forceGcIfAvailable() {
  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
    return true;
  }
  return false;
}

function heapSampleBase(decisionCount, playerDecisionCount, turnCount, runtime, intervalMs) {
  const usage = process.memoryUsage();
  return {
    decisionCount,
    playerDecisionCount,
    turnCount,
    intervalMs: roundMs(intervalMs),
    heapUsedBytes: usage.heapUsed,
    heapUsedMb: roundMb(usage.heapUsed),
    rssBytes: usage.rss,
    rssMb: roundMb(usage.rss),
    externalBytes: usage.external,
    externalMb: roundMb(usage.external),
    arrayBuffersBytes: usage.arrayBuffers,
    arrayBuffersMb: roundMb(usage.arrayBuffers),
    zobristKeyCacheSize: runtime?.zobristTable?.keyCache?.size ?? null,
  };
}

function takeSnapshot(snapshotLabel) {
  forceGcIfAvailable();
  const filename = `spec-143-seed-${SEED}-${sanitizeSegment(snapshotLabel)}.heapsnapshot`;
  const snapshotPath = join(OUTPUT_DIR, filename);
  const writtenPath = v8.writeHeapSnapshot(snapshotPath);
  console.error(`[spec-143] snapshot ${snapshotLabel} -> ${writtenPath}`);
  return writtenPath;
}

function decodeSnapshot(snapshotPath) {
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const nodeFields = snapshot.snapshot.meta.node_fields;
  const nodeTypes = snapshot.snapshot.meta.node_types[0];
  const edgeFields = snapshot.snapshot.meta.edge_fields;
  const edgeTypes = snapshot.snapshot.meta.edge_types[0];
  const strings = snapshot.strings;
  const rawNodes = snapshot.nodes;
  const rawEdges = snapshot.edges;
  const nodeFieldCount = nodeFields.length;
  const edgeFieldCount = edgeFields.length;

  const nodeTypeOffset = nodeFields.indexOf('type');
  const nodeNameOffset = nodeFields.indexOf('name');
  const nodeSelfSizeOffset = nodeFields.indexOf('self_size');
  const nodeEdgeCountOffset = nodeFields.indexOf('edge_count');
  const edgeTypeOffset = edgeFields.indexOf('type');
  const edgeNameOffset = edgeFields.indexOf('name_or_index');
  const edgeToNodeOffset = edgeFields.indexOf('to_node');

  const nodeCount = rawNodes.length / nodeFieldCount;
  const selfSizes = new Array(nodeCount);
  const nodeNames = new Array(nodeCount);
  const nodeKinds = new Array(nodeCount);
  const firstEdgeIndex = new Array(nodeCount + 1);

  let edgeCursor = 0;
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
    const offset = nodeIndex * nodeFieldCount;
    const edgeCount = rawNodes[offset + nodeEdgeCountOffset];
    firstEdgeIndex[nodeIndex] = edgeCursor;
    edgeCursor += edgeCount * edgeFieldCount;
    selfSizes[nodeIndex] = rawNodes[offset + nodeSelfSizeOffset];
    nodeNames[nodeIndex] = strings[rawNodes[offset + nodeNameOffset]];
    nodeKinds[nodeIndex] = nodeTypes[rawNodes[offset + nodeTypeOffset]];
  }
  firstEdgeIndex[nodeCount] = edgeCursor;

  const predecessors = Array.from({ length: nodeCount }, () => []);
  const bfsParent = new Array(nodeCount).fill(-1);
  const bfsEdgeName = new Array(nodeCount).fill('');
  const bfsVisited = new Uint8Array(nodeCount);
  const queue = [0];
  bfsVisited[0] = 1;

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const from = queue[queueIndex];
    for (let edgeIndex = firstEdgeIndex[from]; edgeIndex < firstEdgeIndex[from + 1]; edgeIndex += edgeFieldCount) {
      const to = rawEdges[edgeIndex + edgeToNodeOffset] / nodeFieldCount;
      predecessors[to].push(from);
      if (bfsVisited[to] === 0) {
        bfsVisited[to] = 1;
        bfsParent[to] = from;
        const edgeType = edgeTypes[rawEdges[edgeIndex + edgeTypeOffset]];
        const edgeNameOrIndex = rawEdges[edgeIndex + edgeNameOffset];
        bfsEdgeName[to] = edgeType === 'element' || edgeType === 'hidden'
          ? `[${edgeNameOrIndex}]`
          : String(strings[edgeNameOrIndex] ?? edgeNameOrIndex);
        queue.push(to);
      }
    }
  }

  const parent = new Array(nodeCount).fill(-1);
  const semi = new Array(nodeCount).fill(-1);
  const vertex = [];
  const label = new Array(nodeCount).fill(-1);
  const ancestor = new Array(nodeCount).fill(-1);
  const bucket = Array.from({ length: nodeCount }, () => []);
  const idom = new Array(nodeCount).fill(-1);

  const dfsStack = [{ node: 0, edgeIndex: firstEdgeIndex[0] }];
  semi[0] = 0;
  label[0] = 0;
  vertex.push(0);
  while (dfsStack.length > 0) {
    const frame = dfsStack[dfsStack.length - 1];
    const end = firstEdgeIndex[frame.node + 1];
    if (frame.edgeIndex >= end) {
      dfsStack.pop();
      continue;
    }
    const edgeIndex = frame.edgeIndex;
    frame.edgeIndex += edgeFieldCount;
    const to = rawEdges[edgeIndex + edgeToNodeOffset] / nodeFieldCount;
    if (semi[to] !== -1) {
      continue;
    }
    parent[to] = frame.node;
    semi[to] = vertex.length;
    label[to] = to;
    vertex.push(to);
    dfsStack.push({ node: to, edgeIndex: firstEdgeIndex[to] });
  }

  function compress(v) {
    const parentNode = ancestor[v];
    if (parentNode !== -1 && ancestor[parentNode] !== -1) {
      compress(parentNode);
      if (semi[label[parentNode]] < semi[label[v]]) {
        label[v] = label[parentNode];
      }
      ancestor[v] = ancestor[parentNode];
    }
  }

  function evaluate(v) {
    if (ancestor[v] === -1) {
      return label[v];
    }
    compress(v);
    return semi[label[ancestor[v]]] >= semi[label[v]] ? label[v] : label[ancestor[v]];
  }

  function link(v, w) {
    ancestor[w] = v;
  }

  for (let index = vertex.length - 1; index >= 1; index -= 1) {
    const w = vertex[index];
    for (const v of predecessors[w]) {
      if (semi[v] === -1) {
        continue;
      }
      const u = evaluate(v);
      if (semi[u] < semi[w]) {
        semi[w] = semi[u];
      }
    }
    bucket[vertex[semi[w]]].push(w);
    link(parent[w], w);
    const parentBucket = bucket[parent[w]];
    while (parentBucket.length > 0) {
      const v = parentBucket.pop();
      const u = evaluate(v);
      idom[v] = semi[u] < semi[v] ? u : parent[w];
    }
  }

  for (let index = 1; index < vertex.length; index += 1) {
    const w = vertex[index];
    if (idom[w] !== vertex[semi[w]]) {
      idom[w] = idom[idom[w]];
    }
  }
  idom[0] = -1;

  const domChildren = Array.from({ length: nodeCount }, () => []);
  for (const node of vertex) {
    const dominator = idom[node];
    if (dominator >= 0) {
      domChildren[dominator].push(node);
    }
  }

  const retainedSizes = selfSizes.slice();
  for (let index = vertex.length - 1; index >= 0; index -= 1) {
    const node = vertex[index];
    const parentNode = idom[node];
    if (parentNode >= 0) {
      retainedSizes[parentNode] += retainedSizes[node];
    }
  }

  const constructorSummary = new Map();
  const individualDominators = [];

  function displayName(kind, name) {
    if (name !== '') {
      return name;
    }
    return kind === 'closure' ? '(anonymous closure)' : `(anonymous ${kind})`;
  }

  function includeNode(kind, name) {
    if (kind === 'hidden' || kind === 'code' || kind === 'synthetic') {
      return false;
    }
    if (name === '(GC roots)' || name === '(Internalized strings)') {
      return false;
    }
    return true;
  }

  function nodePath(nodeIndex) {
    const segments = [];
    let cursor = nodeIndex;
    let depth = 0;
    while (cursor > 0 && depth < 6) {
      const edge = bfsEdgeName[cursor];
      const name = nodeNames[cursor];
      segments.push(edge === '' ? name : `${edge} -> ${name}`);
      cursor = bfsParent[cursor];
      depth += 1;
    }
    return segments.reverse().join(' | ');
  }

  for (const nodeIndex of vertex) {
    const name = nodeNames[nodeIndex];
    const kind = nodeKinds[nodeIndex];
    if (!includeNode(kind, name)) {
      continue;
    }
    const key = `${kind}:${name}`;
    const current = constructorSummary.get(key) ?? {
      constructorName: displayName(kind, name),
      kind,
      count: 0,
      selfSizeBytes: 0,
      maxRetainedBytes: 0,
      representativeNode: nodeIndex,
      representativePath: '',
    };
    current.count += 1;
    current.selfSizeBytes += selfSizes[nodeIndex];
    if (retainedSizes[nodeIndex] > current.maxRetainedBytes) {
      current.maxRetainedBytes = retainedSizes[nodeIndex];
      current.representativeNode = nodeIndex;
      current.representativePath = nodePath(nodeIndex);
    }
    constructorSummary.set(key, current);

    if (retainedSizes[nodeIndex] >= 1024 * 1024) {
      individualDominators.push({
        constructorName: name,
        kind,
      retainedBytes: retainedSizes[nodeIndex],
      selfBytes: selfSizes[nodeIndex],
      path: nodePath(nodeIndex),
    });
  }
  }

  const topConstructorsByRetained = [...constructorSummary.values()]
    .sort((left, right) => right.maxRetainedBytes - left.maxRetainedBytes)
    .slice(0, TOP_N)
    .map((entry, index) => ({
        rank: index + 1,
        constructorName: entry.constructorName,
        kind: entry.kind,
        count: entry.count,
      selfSizeBytes: entry.selfSizeBytes,
      selfSize: formatBytes(entry.selfSizeBytes),
      maxRetainedBytes: entry.maxRetainedBytes,
      maxRetained: formatBytes(entry.maxRetainedBytes),
      representativePath: entry.representativePath,
    }));

  const topConstructorsByCount = [...constructorSummary.values()]
    .sort((left, right) => right.count - left.count || right.selfSizeBytes - left.selfSizeBytes)
    .slice(0, TOP_N)
    .map((entry, index) => ({
        rank: index + 1,
        constructorName: entry.constructorName,
        kind: entry.kind,
        count: entry.count,
      selfSizeBytes: entry.selfSizeBytes,
      selfSize: formatBytes(entry.selfSizeBytes),
      maxRetainedBytes: entry.maxRetainedBytes,
      maxRetained: formatBytes(entry.maxRetainedBytes),
      representativePath: entry.representativePath,
    }));

  const topIndividualDominators = individualDominators
    .sort((left, right) => right.retainedBytes - left.retainedBytes)
    .slice(0, TOP_N)
    .map((entry, index) => ({
        rank: index + 1,
        constructorName: entry.constructorName,
        kind: entry.kind,
      retainedBytes: entry.retainedBytes,
      retained: formatBytes(entry.retainedBytes),
      selfBytes: entry.selfBytes,
      self: formatBytes(entry.selfBytes),
      path: entry.path,
    }));

  return {
    nodeCount,
    edgeCount: rawEdges.length / edgeFieldCount,
    topConstructorsByRetained,
    topConstructorsByCount,
    topIndividualDominators,
  };
}

function pickPeakSample(samples) {
  return samples.reduce((best, sample) => {
    if (best === null || sample.heapUsedBytes > best.heapUsedBytes) {
      return sample;
    }
    return best;
  }, null);
}

const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
const staged = runGameSpecStagesFromBundle(bundle);
if (staged.validation.blocked || staged.compilation.blocked) {
  console.error('Compilation/validation blocked; rebuild engine artifacts first.');
  process.exit(1);
}

const def = assertValidatedGameDef(staged.compilation.result.gameDef);
const runtime = createGameDefRuntime(def);
const seatProfiles = PROFILES_OVERRIDE !== ''
  ? PROFILES_OVERRIDE.split(',').map((value) => value.trim()).filter(Boolean)
  : (def.seats ?? []).map((seat) => `${seat.id.toLowerCase()}-baseline`);
const agents = seatProfiles.map((profileId) => new PolicyAgent({ profileId, traceLevel: TRACE_LEVEL }));

if (agents.length !== PLAYER_COUNT) {
  throw new Error(`players=${PLAYER_COUNT} does not match resolved agent count ${agents.length}`);
}

const environment = {
  cwd: REPO_ROOT,
  node: process.version,
  v8: process.versions.v8,
  platform: process.platform,
  arch: process.arch,
  pid: process.pid,
  gcExposed: typeof global.gc === 'function',
  seed: SEED,
  maxTurns: MAX_TURNS,
  playerCount: PLAYER_COUNT,
  sampleEveryDecisions: SAMPLE_EVERY_DECISIONS,
  snapshotEveryDecisions: SNAPSHOT_EVERY_DECISIONS,
  top: TOP_N,
  profiles: seatProfiles,
  engineTraceLevel: TRACE_LEVEL,
};

let state = initialState(def, SEED, PLAYER_COUNT, undefined, runtime).state;
const agentRngByPlayer = createAgentRngByPlayer(SEED, state.playerCount);
let currentChanceRng = createRng(BigInt(SEED) ^ CHANCE_RNG_MIX);
let totalDecisionCount = 0;
let playerDecisionCount = 0;
let stopReason = 'unknown';
let terminal = null;
let errorSummary = null;
const heapSamples = [];
const periodicSnapshots = [];
let intervalStartMs = performance.now();
const runStartMs = intervalStartMs;

function maybeRecordSample(reason) {
  const now = performance.now();
  const sample = {
    reason,
    ...heapSampleBase(totalDecisionCount, playerDecisionCount, state.turnCount, runtime, now - intervalStartMs),
    elapsedMs: roundMs(now - runStartMs),
    decisionStackDepth: state.decisionStack?.length ?? 0,
  };
  heapSamples.push(sample);
  console.error(
    `[spec-143] sample reason=${reason} decisions=${sample.decisionCount} playerDecisions=${sample.playerDecisionCount} turns=${sample.turnCount} heapMb=${sample.heapUsedMb} rssMb=${sample.rssMb} zobristKeys=${sample.zobristKeyCacheSize ?? 'n/a'}`,
  );
  intervalStartMs = now;
  if (SNAPSHOT_EVERY_DECISIONS > 0 && totalDecisionCount > 0 && totalDecisionCount % SNAPSHOT_EVERY_DECISIONS === 0) {
    const snapshotPath = takeSnapshot(`decision-${totalDecisionCount}`);
    periodicSnapshots.push({
      decisionCount: totalDecisionCount,
      reason,
      snapshotPath,
    });
  }
}

maybeRecordSample('start');

try {
  while (true) {
    const autoResult = advanceAutoresolvable(def, state, currentChanceRng, runtime);
    state = autoResult.state;
    currentChanceRng = autoResult.rng;
    totalDecisionCount += autoResult.autoResolvedLogs.length;

    terminal = terminalResult(def, state, runtime);
    if (terminal !== null) {
      stopReason = 'terminal';
      break;
    }

    if (state.turnCount >= MAX_TURNS) {
      stopReason = 'maxTurns';
      break;
    }

    let microturn;
    try {
      microturn = publishMicroturn(def, state, runtime);
    } catch (error) {
      if (isNoBridgeableMicroturnError(error)) {
        stopReason = 'noLegalMoves';
        break;
      }
      throw error;
    }

    if (microturn.seatId === '__chance' || microturn.seatId === '__kernel') {
      throw new Error(`Expected player microturn after auto-resolution, received ${microturn.seatId}`);
    }

    const playerIndex = resolvePlayerIndexForSeat(def, microturn.seatId);
    const agent = playerIndex < 0 ? undefined : agents[playerIndex];
    const agentRng = playerIndex < 0 ? undefined : agentRngByPlayer[playerIndex];
    if (agent === undefined || agentRng === undefined || playerIndex < 0) {
      throw new Error(`missing agent or RNG for seat ${String(microturn.seatId)}`);
    }

    const selected = agent.chooseDecision({
      def,
      state,
      microturn,
      rng: agentRng,
      runtime,
    });
    agentRngByPlayer[playerIndex] = selected.rng;

    const applied = applyPublishedDecision(def, state, microturn, selected.decision, undefined, runtime);
    state = applied.state;
    totalDecisionCount += 1;
    playerDecisionCount += 1;

    if (totalDecisionCount % SAMPLE_EVERY_DECISIONS === 0) {
      maybeRecordSample('interval');
    }
  }
} catch (error) {
  stopReason = 'error';
  errorSummary = {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
}

maybeRecordSample(stopReason);

const preSnapshotUsage = process.memoryUsage();
const finalSnapshotPath = takeSnapshot(`final-${stopReason}`);
const snapshotAnalysis = decodeSnapshot(finalSnapshotPath);
const peakSample = pickPeakSample(heapSamples);
const summary = {
  environment,
  run: {
    stopReason,
    terminalWinners: terminal?.winners ?? null,
    error: errorSummary,
    finalTurnCount: state.turnCount,
    totalDecisionCount,
    playerDecisionCount,
    activePlayer: Number(state.activePlayer),
    elapsedMs: roundMs(performance.now() - runStartMs),
    preSnapshotFinalHeapMb: roundMb(preSnapshotUsage.heapUsed),
    preSnapshotFinalRssMb: roundMb(preSnapshotUsage.rss),
    postAnalysisHeapMb: roundMb(process.memoryUsage().heapUsed),
    postAnalysisRssMb: roundMb(process.memoryUsage().rss),
    peakSample,
  },
  snapshots: {
    finalSnapshotPath,
    periodicSnapshots,
  },
  heapSamples,
  snapshotAnalysis,
};

const summaryPath = join(OUTPUT_DIR, `spec-143-seed-${SEED}-summary.json`);
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

console.log(JSON.stringify({
  outputDir: OUTPUT_DIR,
  summaryPath,
  finalSnapshotPath,
  stopReason,
  finalTurnCount: state.turnCount,
  totalDecisionCount,
  playerDecisionCount,
  peakHeapMb: peakSample?.heapUsedMb ?? null,
  topConstructorsByRetained: snapshotAnalysis.topConstructorsByRetained.slice(0, 5),
  topConstructorsByCount: snapshotAnalysis.topConstructorsByCount.slice(0, 5),
}, null, 2));
