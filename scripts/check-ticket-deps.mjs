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
    .map((dep) => dep.trim().replace(/^`|`$/g, ''))
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

/**
 * Recursively collect all .md file basenames under a directory,
 * mapped to their relative paths from rootDir.
 */
function collectTicketIndex(rootDir, dir) {
  const index = new Map();
  const absoluteDir = resolve(rootDir, dir);
  let entries;
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return index;
  }
  for (const entry of entries) {
    const relativePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of collectTicketIndex(rootDir, relativePath)) {
        index.set(key, value);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      index.set(entry.name, relativePath);
    }
  }
  return index;
}

/** Test whether a dep string looks like a bare ticket ID (e.g. "CROGAMPRIELE-002"). */
const BARE_ID_RE = /^[A-Z][\w-]+-\d{3,}$/;

function resolveDep(rootDir, dep, ticketIndex) {
  // Already a valid file path
  if (isExistingFile(rootDir, dep)) {
    return true;
  }
  // Bare ticket ID — search for a matching file in tickets/ or archive/tickets/
  if (BARE_ID_RE.test(dep)) {
    for (const [filename] of ticketIndex) {
      if (filename.startsWith(`${dep}-`) || filename === `${dep}.md`) {
        return true;
      }
    }
  }
  return false;
}

function validateTicket(rootDir, ticketPath, ticketIndex) {
  const absolutePath = resolve(rootDir, ticketPath);
  const content = readFileSync(absolutePath, 'utf8');
  const { missing, deps } = parseDepsLine(content);
  const errors = [];

  if (missing) {
    errors.push(`${ticketPath}: missing required "**Deps**:" line`);
    return errors;
  }

  for (const dep of deps) {
    if (!resolveDep(rootDir, dep, ticketIndex)) {
      errors.push(`${ticketPath}: unresolved dependency path "${dep}"`);
    }
  }

  return errors;
}

function main() {
  const rootDir = process.cwd();
  const ticketIndex = new Map([
    ...collectTicketIndex(rootDir, 'tickets'),
    ...collectTicketIndex(rootDir, join('archive', 'tickets')),
  ]);
  const errors = [];

  for (const ticketPath of ticketFiles(rootDir)) {
    errors.push(...validateTicket(rootDir, ticketPath, ticketIndex));
  }

  if (errors.length > 0) {
    fail(['Ticket dependency integrity check failed:', ...errors].join('\n'));
  }

  writeSync(1, `Ticket dependency integrity check passed for ${ticketFiles(rootDir).length} active tickets.\n`);
}

main();
