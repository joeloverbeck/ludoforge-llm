import { lstatSync, renameSync, writeSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

function fail(message) {
  writeSync(2, `${message}\n`);
  process.exit(1);
}

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function usage() {
  return 'Usage: node scripts/archive-ticket.mjs <source-path> <destination-dir-or-path>';
}

function resolveDestination(sourcePath, destinationArg) {
  const destinationInput = resolve(destinationArg);

  if (pathExists(destinationInput)) {
    const destinationStat = lstatSync(destinationInput);
    if (destinationStat.isDirectory()) {
      return resolve(destinationInput, basename(sourcePath));
    }
    return destinationInput;
  }

  const parentDir = dirname(destinationInput);
  if (!pathExists(parentDir) || !lstatSync(parentDir).isDirectory()) {
    fail(`Destination parent directory does not exist: ${parentDir}`);
  }

  return destinationInput;
}

function main() {
  const [sourceArg, destinationArg] = process.argv.slice(2);

  if (!sourceArg || !destinationArg) {
    fail(usage());
  }

  const sourcePath = resolve(sourceArg);
  if (!pathExists(sourcePath)) {
    fail(`Source path does not exist: ${sourcePath}`);
  }

  const destinationPath = resolveDestination(sourcePath, destinationArg);

  if (sourcePath === destinationPath) {
    fail(`Source and destination are identical: ${sourcePath}`);
  }

  if (pathExists(destinationPath)) {
    fail(`Destination already exists: ${destinationPath}`);
  }

  renameSync(sourcePath, destinationPath);
  writeSync(1, `Archived ${sourcePath} -> ${destinationPath}\n`);
}

main();
