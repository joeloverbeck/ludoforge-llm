// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageJson } from '../../helpers/lint-policy-helpers.js';

function splitAndChainSteps(script: string): readonly string[] {
  return script
    .split('&&')
    .map((step) => step.trim())
    .filter((step) => step.length > 0);
}

function unwrapDistLockWrapper(script: string): string {
  const wrappedCommandMatch = script.match(
    /run-with-dist-lock\.mjs\s+(?:"([^"]+)"|'([^']+)')/u,
  );
  if (!wrappedCommandMatch) {
    return script;
  }

  return wrappedCommandMatch[1] ?? wrappedCommandMatch[2] ?? script;
}

function isCleanStep(step: string): boolean {
  return (
    /^(?:pnpm|npm)\s+run\s+clean(?:\s|$)/u.test(step) ||
    /^yarn\s+clean(?:\s|$)/u.test(step) ||
    /^(?:rm\s+-rf|rimraf)\s+dist(?:\s|$)/u.test(step)
  );
}

function isTypeScriptCompileStep(step: string): boolean {
  return /(?:^|\s)(?:tsc)(?:\s|$)/u.test(step);
}

function assertCompileWithoutCleanInvariant(buildScript: string): void {
  const steps = splitAndChainSteps(unwrapDistLockWrapper(buildScript));
  const cleanIndex = steps.findIndex((step) => isCleanStep(step));
  const compileIndex = steps.findIndex((step) => isTypeScriptCompileStep(step));

  assert.notEqual(
    compileIndex,
    -1,
    'packages/engine build script must include a TypeScript compilation step',
  );
  assert.equal(
    cleanIndex,
    -1,
    'packages/engine default build script must preserve dist for incremental compilation',
  );
}

function assertCleanBuildInvariant(buildCleanScript: string): void {
  const steps = splitAndChainSteps(unwrapDistLockWrapper(buildCleanScript));
  const cleanIndex = steps.findIndex((step) => isCleanStep(step));
  const compileIndex = steps.findIndex((step) => isTypeScriptCompileStep(step));

  assert.notEqual(
    compileIndex,
    -1,
    'packages/engine build:clean script must include a TypeScript compilation step',
  );
  assert.notEqual(
    cleanIndex,
    -1,
    'packages/engine build:clean script must include a clean step',
  );
  assert.ok(
    cleanIndex < compileIndex,
    'packages/engine build:clean script must clean dist before compiling',
  );
}

describe('engine build script incremental policy', () => {
  it('compiles without cleaning dist by default so tsbuildinfo survives', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = findEnginePackageJson(thisDir);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      readonly scripts?: Record<string, string>;
    };
    const buildScript = packageJson.scripts?.build;

    assert.equal(typeof buildScript, 'string');
    assertCompileWithoutCleanInvariant(buildScript ?? '');
  });

  it('keeps an explicit clean rebuild script available', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = findEnginePackageJson(thisDir);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      readonly scripts?: Record<string, string>;
    };
    const buildCleanScript = packageJson.scripts?.['build:clean'];

    assert.equal(typeof buildCleanScript, 'string');
    assertCleanBuildInvariant(buildCleanScript ?? '');
  });

  it('accepts equivalent compile-without-clean default script shapes', () => {
    assertCompileWithoutCleanInvariant('pnpm exec tsc -p tsconfig.json');
    assertCompileWithoutCleanInvariant('node scripts/run-with-dist-lock.mjs "tsc"');
  });

  it('rejects default build scripts that clean before compiling', () => {
    assert.throws(
      () => assertCompileWithoutCleanInvariant('pnpm run clean && tsc'),
      /must preserve dist/u,
    );
  });

  it('rejects build:clean scripts that compile without cleaning first', () => {
    assert.throws(
      () => assertCleanBuildInvariant('pnpm run lint && tsc'),
      /must include a clean step/u,
    );
  });
});
