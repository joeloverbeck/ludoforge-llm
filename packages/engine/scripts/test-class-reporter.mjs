import { readFileSync } from 'node:fs';
import { spec } from 'node:test/reporters';

const TEST_CLASS_MARKER_PATTERN = /^\/\/\s*@test-class:\s*(\S+)/mu;
const PROFILE_VARIANT_MARKER_PATTERN = /^\/\/\s*@profile-variant:\s*(\S+)/mu;
const HEADER_LINE_LIMIT = 20;
const DEFAULT_QUIET_THRESHOLD_MS = 30_000;
const SUMMARY_ORDER = ['architectural-invariant', 'convergence-witness', 'golden-trace', 'unclassified'];
const SUMMARY_NOTES = {
  'convergence-witness': 'likely trajectory shift - evaluate',
  'golden-trace': 're-bless expected',
  'policy-profile-quality': 'non-blocking - profile-level quality witness',
  unclassified: 'migrate to marker - Spec 133',
};

const createInitialCounts = () =>
  new Map(SUMMARY_ORDER.map((testClass) => [testClass, { pass: 0, fail: 0 }]));

const createInitialVariantCounts = () => new Map();

export function extractTestClassMarker(fileContents) {
  const header = fileContents.split(/\r?\n/u, HEADER_LINE_LIMIT).join('\n');
  const marker = TEST_CLASS_MARKER_PATTERN.exec(header);
  return marker?.[1] ?? 'unclassified';
}

export function extractProfileVariantMarker(fileContents) {
  const header = fileContents.split(/\r?\n/u, HEADER_LINE_LIMIT).join('\n');
  const marker = PROFILE_VARIANT_MARKER_PATTERN.exec(header);
  return marker?.[1] ?? null;
}

function toPositiveInteger(value) {
  if (value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatQuietDuration(durationMs) {
  if (durationMs < 1_000) {
    return `${Math.max(1, Math.round(durationMs))}ms`;
  }

  const totalSeconds = Math.ceil(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${totalSeconds}s` : `${minutes}m ${seconds}s`;
}

export function createTestClassReporter(options = {}) {
  const readFileSyncImpl = options.readFileSyncImpl ?? readFileSync;
  const createSpecReporterImpl = options.createSpecReporterImpl ?? spec;
  const now = options.now ?? (() => Date.now());
  const quietThresholdMs =
    toPositiveInteger(options.quietThresholdMs ?? process.env.ENGINE_TEST_PROGRESS_QUIET_MS) ?? DEFAULT_QUIET_THRESHOLD_MS;
  const repeatQuietNoticeMs =
    toPositiveInteger(options.repeatQuietNoticeMs ?? process.env.ENGINE_TEST_PROGRESS_REPEAT_MS) ?? quietThresholdMs;
  const laneLabel = options.laneLabel ?? process.env.ENGINE_TEST_PROGRESS_LANE ?? 'unknown-lane';
  const fileMetadataCache = new Map();
  const countsByClass = createInitialCounts();
  const countsByVariant = createInitialVariantCounts();

  const resolveFileMetadata = (filePath) => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return { testClass: 'unclassified', profileVariant: null };
    }
    if (fileMetadataCache.has(filePath)) {
      return fileMetadataCache.get(filePath);
    }
    const fileContents = readFileSyncImpl(filePath, 'utf8');
    const resolvedMetadata = {
      testClass: extractTestClassMarker(fileContents),
      profileVariant: extractProfileVariantMarker(fileContents),
    };
    fileMetadataCache.set(filePath, resolvedMetadata);
    return resolvedMetadata;
  };

  const recordResult = (event) => {
    if (event?.type !== 'test:pass' && event?.type !== 'test:fail') {
      return;
    }

    const { testClass, profileVariant } = resolveFileMetadata(event?.data?.file);
    const bucket = countsByClass.get(testClass) ?? countsByClass.get('unclassified');
    if (bucket === undefined) {
      return;
    }
    bucket[event.type === 'test:pass' ? 'pass' : 'fail'] += 1;

    if (laneLabel === 'policy-profile-quality' && profileVariant !== null) {
      const variantBucket = countsByVariant.get(profileVariant) ?? { pass: 0, fail: 0 };
      variantBucket[event.type === 'test:pass' ? 'pass' : 'fail'] += 1;
      countsByVariant.set(profileVariant, variantBucket);
    }
  };

  const formatBucketLine = (testClass) => {
    const counts = countsByClass.get(testClass);
    if (counts === undefined) {
      return null;
    }
    const label = `${testClass}:`.padEnd(25, ' ');
    const countsText = `${counts.pass} pass, ${counts.fail} fail`;
    const note = SUMMARY_NOTES[testClass];
    return note ? `${label}${countsText} (${note})` : `${label}${countsText}`;
  };

  const formatVariantBucketLine = (variantId) => {
    const counts = countsByVariant.get(variantId);
    if (counts === undefined) {
      return null;
    }
    const label = `${variantId}:`.padEnd(25, ' ');
    const countsText = `${counts.pass} pass, ${counts.fail} fail`;
    return `${label}${countsText}`;
  };

  const emitSpecChunks = function* (specReporter) {
    let chunk = specReporter.read();
    while (chunk !== null) {
      yield chunk;
      chunk = specReporter.read();
    }
  };

  return async function* testClassReporter(source) {
    const specReporter = createSpecReporterImpl();
    const sourceIterator = source[Symbol.asyncIterator]();
    let currentFile = null;
    let currentFileStartedAt = 0;
    let lastFileEventAt = 0;
    let nextQuietNoticeAt = Number.POSITIVE_INFINITY;
    let pendingEvent = sourceIterator.next();

    const updateCurrentFile = (eventTime, filePath) => {
      if (currentFile !== filePath) {
        currentFile = filePath;
        currentFileStartedAt = eventTime;
      }
      lastFileEventAt = eventTime;
      nextQuietNoticeAt = eventTime + quietThresholdMs;
    };

    const clearCurrentFile = () => {
      currentFile = null;
      currentFileStartedAt = 0;
      lastFileEventAt = 0;
      nextQuietNoticeAt = Number.POSITIVE_INFINITY;
    };

    while (true) {
      let nextResult;
      if (currentFile === null) {
        nextResult = await pendingEvent;
      } else {
        const waitMs = Math.max(1, nextQuietNoticeAt - now());
        let quietTimer = null;
        nextResult = await Promise.race([
          pendingEvent,
          new Promise((resolve) => {
            quietTimer = setTimeout(() => resolve({ quietNotice: true }), waitMs);
          }),
        ]);
        if (quietTimer !== null) {
          clearTimeout(quietTimer);
        }
      }

      if (nextResult?.quietNotice === true) {
        const quietNow = now();
        yield `[test-progress] [${laneLabel}] still running ${currentFile} after ${formatQuietDuration(
          quietNow - currentFileStartedAt,
        )} quiet ${formatQuietDuration(quietNow - lastFileEventAt)}\n`;
        nextQuietNoticeAt = quietNow + repeatQuietNoticeMs;
        continue;
      }

      const { done, value: event } = nextResult;
      if (done) {
        break;
      }

      const eventTime = now();
      const eventFile = event?.data?.file;
      if (typeof eventFile === 'string' && eventFile.length > 0) {
        updateCurrentFile(eventTime, eventFile);
      }

      recordResult(event);
      specReporter.write(event);
      for (const chunk of emitSpecChunks(specReporter)) {
        yield chunk;
      }
      pendingEvent = sourceIterator.next();
    }

    clearCurrentFile();
    specReporter.end();
    for await (const chunk of specReporter) {
      yield chunk;
    }

    yield '=== Test Class Summary ===\n';
    for (const testClass of SUMMARY_ORDER) {
      const line = formatBucketLine(testClass);
      if (line !== null) {
        yield `${line}\n`;
      }
    }

    if (laneLabel === 'policy-profile-quality' && countsByVariant.size > 0) {
      yield '=== Policy Profile Variant Summary ===\n';
      const laneNote = SUMMARY_NOTES['policy-profile-quality'];
      if (typeof laneNote === 'string') {
        yield `${laneNote}\n`;
      }
      for (const variantId of [...countsByVariant.keys()].sort((left, right) => left.localeCompare(right))) {
        const line = formatVariantBucketLine(variantId);
        if (line !== null) {
          yield `${line}\n`;
        }
      }
    }
  };
}

export default createTestClassReporter();
