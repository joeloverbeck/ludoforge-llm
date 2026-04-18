// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

type ReporterEvent = {
  readonly type: string;
  readonly data?: {
    readonly file?: string;
    readonly name?: string;
  };
};

type SpecReporterStub = {
  write: (event: ReporterEvent) => void;
  read: () => string | null;
  end: () => void;
  [Symbol.asyncIterator]: () => AsyncGenerator<string, void, void>;
};

const thisDir = dirname(fileURLToPath(import.meta.url));
const engineRootCandidate = resolve(thisDir, '..', '..', '..', '..');
const engineRoot = engineRootCandidate.endsWith('/dist') ? dirname(engineRootCandidate) : engineRootCandidate;
const reporterModulePath = resolve(engineRoot, 'scripts/test-class-reporter.mjs');

const loadReporterModule = async () =>
  import(pathToFileURL(reporterModulePath).href) as Promise<{
    readonly createTestClassReporter: (options?: {
      readonly readFileSyncImpl?: (filePath: string, encoding: string) => string;
      readonly createSpecReporterImpl?: () => SpecReporterStub;
      readonly quietThresholdMs?: number;
      readonly repeatQuietNoticeMs?: number;
      readonly laneLabel?: string;
    }) => (source: AsyncIterable<ReporterEvent>) => AsyncGenerator<string, void, void>;
    readonly extractProfileVariantMarker: (fileContents: string) => string | null;
  }>;

const collectReporterOutput = async (
  reporter: (source: AsyncIterable<ReporterEvent>) => AsyncGenerator<string, void, void>,
  events: AsyncIterable<ReporterEvent> | readonly ReporterEvent[],
) => {
  let output = '';
  const source =
    Symbol.asyncIterator in events
      ? events
      : (async function* emitEvents() {
          for (const event of events) {
            yield event;
          }
        })();
  for await (const chunk of reporter(source)) {
    output += typeof chunk === 'string' ? chunk : String(chunk);
  }
  return output;
};

const createSpecReporterStub = () => {
  const bufferedChunks: string[] = [];
  let closed = false;

  return {
    write(event) {
      if (event.type === 'test:pass' || event.type === 'test:fail') {
        const file = event.data?.file ?? '<no-file>';
        bufferedChunks.push(`[detail] ${event.type} ${file}\n`);
      }
    },
    read() {
      return bufferedChunks.shift() ?? null;
    },
    end() {
      closed = true;
    },
    async *[Symbol.asyncIterator]() {
      if (closed) {
        return;
      }
      while (bufferedChunks.length > 0) {
        const nextChunk = bufferedChunks.shift();
        if (nextChunk !== undefined) {
          yield nextChunk;
        }
      }
    },
  } satisfies SpecReporterStub;
};

describe('test class reporter', () => {
  it('groups pass/fail events by class, preserves detail output, and keeps stable bucket ordering', async () => {
    const { createTestClassReporter } = await loadReporterModule();
    const fileContents = new Map([
      ['/tmp/arch.test.js', '// @test-class: architectural-invariant\n'],
      ['/tmp/witness.test.js', '// @test-class: convergence-witness\n'],
      ['/tmp/golden.test.js', '// @test-class: golden-trace\n'],
      ['/tmp/unclassified.test.js', '// plain header\n'],
    ]);

    const reporter = createTestClassReporter({
      readFileSyncImpl: (filePath) => fileContents.get(filePath) ?? '',
      createSpecReporterImpl: createSpecReporterStub,
    });

    const output = await collectReporterOutput(reporter, [
      { type: 'test:start', data: { file: '/tmp/arch.test.js', name: 'boot' } },
      { type: 'test:pass', data: { file: '/tmp/arch.test.js', name: 'arch-pass' } },
      { type: 'test:fail', data: { file: '/tmp/witness.test.js', name: 'witness-fail' } },
      { type: 'test:pass', data: { file: '/tmp/golden.test.js', name: 'golden-pass' } },
      { type: 'test:pass', data: { file: '/tmp/unclassified.test.js', name: 'plain-pass' } },
    ]);

    assert.match(output, /\[detail\] test:pass \/tmp\/arch\.test\.js/u);
    assert.match(output, /\[detail\] test:fail \/tmp\/witness\.test\.js/u);
    assert.match(output, /=== Test Class Summary ===/u);
    assert.match(output, /architectural-invariant:\s+1 pass, 0 fail/u);
    assert.match(output, /convergence-witness:\s+0 pass, 1 fail \(likely trajectory shift - evaluate\)/u);
    assert.match(output, /golden-trace:\s+1 pass, 0 fail \(re-bless expected\)/u);
    assert.match(output, /unclassified:\s+1 pass, 0 fail \(migrate to marker - Spec 133\)/u);

    const summaryIndex = output.indexOf('=== Test Class Summary ===');
    const archIndex = output.indexOf('architectural-invariant:', summaryIndex);
    const witnessIndex = output.indexOf('convergence-witness:', summaryIndex);
    const goldenIndex = output.indexOf('golden-trace:', summaryIndex);
    const unclassifiedIndex = output.indexOf('unclassified:', summaryIndex);
    assert.equal(summaryIndex >= 0, true);
    assert.equal(archIndex < witnessIndex && witnessIndex < goldenIndex && goldenIndex < unclassifiedIndex, true);
  });

  it('reads each file header at most once per run and falls back to unclassified when the marker is absent', async () => {
    const { createTestClassReporter } = await loadReporterModule();
    const readCounts = new Map();

    const reporter = createTestClassReporter({
      readFileSyncImpl: (filePath) => {
        readCounts.set(filePath, (readCounts.get(filePath) ?? 0) + 1);
        return filePath.endsWith('marked.test.js') ? '// @test-class: architectural-invariant\n' : '// no marker\n';
      },
      createSpecReporterImpl: createSpecReporterStub,
    });

    const output = await collectReporterOutput(reporter, [
      { type: 'test:pass', data: { file: '/tmp/marked.test.js', name: 'first-pass' } },
      { type: 'test:fail', data: { file: '/tmp/marked.test.js', name: 'second-fail' } },
      { type: 'test:pass', data: { file: '/tmp/plain.test.js', name: 'plain-pass' } },
      { type: 'test:fail', data: { file: '/tmp/plain.test.js', name: 'plain-fail' } },
    ]);

    assert.equal(readCounts.get('/tmp/marked.test.js'), 1);
    assert.equal(readCounts.get('/tmp/plain.test.js'), 1);
    assert.match(output, /architectural-invariant:\s+1 pass, 1 fail/u);
    assert.match(output, /unclassified:\s+1 pass, 1 fail/u);
  });

  it('emits a quiet-progress notice for a long-running file without disturbing the final summary', async () => {
    const { createTestClassReporter } = await loadReporterModule();
    const reporter = createTestClassReporter({
      readFileSyncImpl: () => '// @test-class: architectural-invariant\n',
      createSpecReporterImpl: createSpecReporterStub,
      quietThresholdMs: 5,
      repeatQuietNoticeMs: 5,
      laneLabel: 'integration:game-packages',
    });

    const output = await collectReporterOutput(
      reporter,
      (async function* emitEvents() {
        yield { type: 'test:start', data: { file: '/tmp/slow-tail.test.js', name: 'slow tail' } };
        await new Promise((resolve) => setTimeout(resolve, 20));
        yield { type: 'test:pass', data: { file: '/tmp/slow-tail.test.js', name: 'slow tail' } };
      })(),
    );

    assert.match(
      output,
      /\[test-progress\] \[integration:game-packages\] still running \/tmp\/slow-tail\.test\.js after \d+ms quiet \d+ms/u,
    );
    assert.match(output, /=== Test Class Summary ===/u);
    assert.match(output, /architectural-invariant:\s+1 pass, 0 fail/u);
  });

  it('emits policy-profile-quality variant groupings when that lane is active', async () => {
    const { createTestClassReporter, extractProfileVariantMarker } = await loadReporterModule();
    assert.equal(
      extractProfileVariantMarker('// @test-class: convergence-witness\n// @profile-variant: arvn-evolved\n'),
      'arvn-evolved',
    );

    const fileContents = new Map([
      [
        '/tmp/arvn-quality.test.js',
        '// @test-class: convergence-witness\n// @profile-variant: arvn-evolved\n',
      ],
      [
        '/tmp/baseline-quality.test.js',
        '// @test-class: convergence-witness\n// @profile-variant: all-baselines\n',
      ],
    ]);

    const reporter = createTestClassReporter({
      laneLabel: 'policy-profile-quality',
      readFileSyncImpl: (filePath) => fileContents.get(filePath) ?? '',
      createSpecReporterImpl: createSpecReporterStub,
    });

    const output = await collectReporterOutput(reporter, [
      { type: 'test:pass', data: { file: '/tmp/arvn-quality.test.js', name: 'arvn-pass' } },
      { type: 'test:fail', data: { file: '/tmp/arvn-quality.test.js', name: 'arvn-fail' } },
      { type: 'test:pass', data: { file: '/tmp/baseline-quality.test.js', name: 'baseline-pass' } },
    ]);

    assert.match(output, /=== Test Class Summary ===/u);
    assert.match(output, /convergence-witness:\s+2 pass, 1 fail \(likely trajectory shift - evaluate\)/u);
    assert.match(output, /=== Policy Profile Variant Summary ===/u);
    assert.match(output, /non-blocking - profile-level quality witness/u);
    assert.match(output, /all-baselines:\s+1 pass, 0 fail/u);
    assert.match(output, /arvn-evolved:\s+1 pass, 1 fail/u);
  });
});
