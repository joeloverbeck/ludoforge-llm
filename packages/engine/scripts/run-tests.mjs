import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

const defaultPatterns = [
  'dist/test/unit/**/*.test.js',
  'dist/test/integration/**/*.test.js',
];

const normalizeRequestedPattern = (pattern) => {
  if (pattern === '--') {
    return null;
  }

  if (pattern.endsWith('.test.ts')) {
    const jsFileName = basename(pattern).replace(/\.ts$/, '.js');
    return `dist/test/**/${jsFileName}`;
  }

  if (pattern.startsWith('test/') && pattern.endsWith('.test.js')) {
    return `dist/${pattern}`;
  }

  return pattern;
};

const requestedPatterns = process.argv
  .slice(2)
  .map(normalizeRequestedPattern)
  .filter((pattern) => pattern !== null);
const patterns = requestedPatterns.length > 0 ? requestedPatterns : defaultPatterns;

const result = spawnSync('node', ['--test', ...patterns], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
