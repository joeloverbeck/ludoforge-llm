import { readFileSync } from 'node:fs';
import { spec } from 'node:test/reporters';

const TEST_CLASS_MARKER_PATTERN = /^\/\/\s*@test-class:\s*(\S+)/mu;
const HEADER_LINE_LIMIT = 20;
const SUMMARY_ORDER = ['architectural-invariant', 'convergence-witness', 'golden-trace', 'unclassified'];
const SUMMARY_NOTES = {
  'convergence-witness': 'likely trajectory shift - evaluate',
  'golden-trace': 're-bless expected',
  unclassified: 'migrate to marker - Spec 133',
};

const createInitialCounts = () =>
  new Map(SUMMARY_ORDER.map((testClass) => [testClass, { pass: 0, fail: 0 }]));

export function extractTestClassMarker(fileContents) {
  const header = fileContents.split(/\r?\n/u, HEADER_LINE_LIMIT).join('\n');
  const marker = TEST_CLASS_MARKER_PATTERN.exec(header);
  return marker?.[1] ?? 'unclassified';
}

export function createTestClassReporter(options = {}) {
  const readFileSyncImpl = options.readFileSyncImpl ?? readFileSync;
  const createSpecReporterImpl = options.createSpecReporterImpl ?? spec;
  const fileClassCache = new Map();
  const countsByClass = createInitialCounts();

  const resolveTestClass = (filePath) => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return 'unclassified';
    }
    if (fileClassCache.has(filePath)) {
      return fileClassCache.get(filePath);
    }
    const resolvedClass = extractTestClassMarker(readFileSyncImpl(filePath, 'utf8'));
    fileClassCache.set(filePath, resolvedClass);
    return resolvedClass;
  };

  const recordResult = (event) => {
    if (event?.type !== 'test:pass' && event?.type !== 'test:fail') {
      return;
    }

    const testClass = resolveTestClass(event?.data?.file);
    const bucket = countsByClass.get(testClass) ?? countsByClass.get('unclassified');
    if (bucket === undefined) {
      return;
    }
    bucket[event.type === 'test:pass' ? 'pass' : 'fail'] += 1;
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

  return async function* testClassReporter(source) {
    const specReporter = createSpecReporterImpl();

    for await (const event of source) {
      recordResult(event);
      specReporter.write(event);

      let chunk = specReporter.read();
      while (chunk !== null) {
        yield chunk;
        chunk = specReporter.read();
      }
    }

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
  };
}

export default createTestClassReporter();
