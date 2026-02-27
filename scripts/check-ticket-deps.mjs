import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeSync } from 'node:fs';

const TICKETS_DIR = 'tickets';
const SKIP_FILES = new Set(['README.md', '_TEMPLATE.md']);

function fail(message) {
  writeSync(2, `${message}\n`);
  process.exit(1);
}

function ticketFiles(rootDir) {
  const absoluteTicketsDir = resolve(rootDir, TICKETS_DIR);
  const entries = readdirSync(absoluteTicketsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name))
    .map((entry) => join(TICKETS_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function parseDepsLine(content) {
  const line = content.match(/^\*\*Deps\*\*:\s*(.+)$/m);
  if (!line) {
    return { missing: true, deps: [] };
  }
  const raw = line[1].trim();
  if (raw === 'None') {
    return { missing: false, deps: [] };
  }

  const deps = raw
    .split(',')
    .map((dep) => dep.trim())
    .filter((dep) => dep.length > 0);

  return { missing: false, deps };
}

function isExistingFile(rootDir, relativePath) {
  const absolutePath = resolve(rootDir, relativePath);
  try {
    return statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

function validateTicket(rootDir, ticketPath) {
  const absolutePath = resolve(rootDir, ticketPath);
  const content = readFileSync(absolutePath, 'utf8');
  const { missing, deps } = parseDepsLine(content);
  const errors = [];

  if (missing) {
    errors.push(`${ticketPath}: missing required "**Deps**:" line`);
    return errors;
  }

  for (const dep of deps) {
    if (!isExistingFile(rootDir, dep)) {
      errors.push(`${ticketPath}: unresolved dependency path "${dep}"`);
    }
  }

  return errors;
}

function main() {
  const rootDir = process.cwd();
  const errors = [];

  for (const ticketPath of ticketFiles(rootDir)) {
    errors.push(...validateTicket(rootDir, ticketPath));
  }

  if (errors.length > 0) {
    fail(['Ticket dependency integrity check failed:', ...errors].join('\n'));
  }

  writeSync(1, `Ticket dependency integrity check passed for ${ticketFiles(rootDir).length} active tickets.\n`);
}

main();
