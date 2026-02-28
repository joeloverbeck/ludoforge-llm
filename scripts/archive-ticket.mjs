import { lstatSync, readdirSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const ACTIVE_TICKETS_DIR = 'tickets';
const ACTIVE_TICKET_SKIP_FILES = new Set(['README.md', '_TEMPLATE.md']);

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

function toPosixPath(path) {
  return path.replaceAll('\\', '/');
}

function rewriteActiveTicketDeps(rootDir, sourcePath, destinationPath) {
  const sourceDep = toPosixPath(relative(rootDir, sourcePath));
  const destinationDep = toPosixPath(relative(rootDir, destinationPath));
  if (sourceDep === destinationDep) {
    return 0;
  }

  const activeTicketsDir = resolve(rootDir, ACTIVE_TICKETS_DIR);
  const entries = readdirSync(activeTicketsDir, { withFileTypes: true });
  let updatedTicketCount = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || ACTIVE_TICKET_SKIP_FILES.has(entry.name)) {
      continue;
    }

    const ticketPath = resolve(activeTicketsDir, entry.name);
    const content = readFileSync(ticketPath, 'utf8');
    const depsMatch = content.match(/^\*\*Deps\*\*:\s*(.+)$/m);
    if (!depsMatch) {
      continue;
    }

    const rawDeps = depsMatch[1].trim();
    if (rawDeps === 'None') {
      continue;
    }

    let updated = false;
    const deps = rawDeps
      .split(',')
      .map((dep) => dep.trim())
      .map((dep) => {
        if (dep === sourceDep) {
          updated = true;
          return destinationDep;
        }
        return dep;
      });

    if (!updated) {
      continue;
    }

    const updatedDepsLine = `**Deps**: ${deps.join(', ')}`;
    const updatedContent = content.replace(depsMatch[0], updatedDepsLine);
    writeFileSync(ticketPath, updatedContent);
    updatedTicketCount += 1;
  }

  return updatedTicketCount;
}

function main() {
  const [sourceArg, destinationArg] = process.argv.slice(2);

  if (!sourceArg || !destinationArg) {
    fail(usage());
  }

  const rootDir = process.cwd();
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
  const rewrittenDeps = rewriteActiveTicketDeps(rootDir, sourcePath, destinationPath);
  writeSync(1, `Archived ${sourcePath} -> ${destinationPath}\n`);
  if (rewrittenDeps > 0) {
    writeSync(1, `Updated dependency references in ${rewrittenDeps} active ticket(s).\n`);
  }
}

main();
