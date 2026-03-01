import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { loadBootstrapFixtureTargets, syncBootstrapFixtures } from '../../scripts/bootstrap-fixtures.mjs';

interface FixtureTarget {
  readonly id: string;
  readonly label: string;
  readonly specPath: string;
  readonly outputPath: string;
}

function makeTarget(baseDir: string, id: string): FixtureTarget {
  return {
    id,
    label: id.toUpperCase(),
    specPath: `/virtual/spec/${id}`,
    outputPath: join(baseDir, `${id}-game-def.json`),
  };
}

describe('bootstrap-fixtures script', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generate then check passes when fixture content is fresh', () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-bootstrap-fixtures-'));
    tempDirs.push(dir);

    const target = makeTarget(dir, 'fitl');
    const render = () => '{\n  "metadata": {\n    "id": "fitl"\n  }\n}\n';

    const generated = syncBootstrapFixtures({ mode: 'generate', targets: [target], render });
    expect(generated.mismatches).toEqual([]);
    expect(readFileSync(target.outputPath, 'utf8')).toBe(render());

    const checked = syncBootstrapFixtures({ mode: 'check', targets: [target], render });
    expect(checked.mismatches).toEqual([]);
  });

  it('loads generated fixture targets from canonical manifest', () => {
    const targets = loadBootstrapFixtureTargets() as readonly FixtureTarget[];
    const ids = targets.map((target) => target.id);

    expect(ids).toContain('default');
    expect(ids).toContain('fitl');
    expect(ids).toContain('texas');
  });

  it('builds engine before running bootstrap fixture scripts', () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const runnerPackageJsonPath = resolve(testDir, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(runnerPackageJsonPath, 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>;
    };

    expect(packageJson.scripts?.['bootstrap:fixtures']).toMatch(/^pnpm -F @ludoforge\/engine build && node scripts\/bootstrap-fixtures\.mjs generate$/);
    expect(packageJson.scripts?.['bootstrap:fixtures:check']).toMatch(/^pnpm -F @ludoforge\/engine build && node scripts\/bootstrap-fixtures\.mjs check$/);
  });

  it('check fails when committed fixture content is stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-bootstrap-fixtures-'));
    tempDirs.push(dir);

    const target = makeTarget(dir, 'texas');
    const render = () => '{\n  "metadata": {\n    "id": "texas"\n  }\n}\n';

    syncBootstrapFixtures({ mode: 'generate', targets: [target], render });
    writeFileSync(target.outputPath, '{\n  "metadata": {\n    "id": "stale-texas"\n  }\n}\n', 'utf8');

    const checked = syncBootstrapFixtures({ mode: 'check', targets: [target], render });
    expect(checked.mismatches).toEqual([
      {
        id: 'texas',
        outputPath: target.outputPath,
        reason: 'fixture content differs from generated output',
      },
    ]);
  });

  it('check fails when fixture file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-bootstrap-fixtures-'));
    tempDirs.push(dir);

    const target = makeTarget(dir, 'fitl');
    const render = () => '{\n  "metadata": {\n    "id": "fitl"\n  }\n}\n';

    const checked = syncBootstrapFixtures({ mode: 'check', targets: [target], render });
    expect(checked.mismatches).toEqual([
      {
        id: 'fitl',
        outputPath: target.outputPath,
        reason: 'missing fixture file',
      },
    ]);
  });
});
