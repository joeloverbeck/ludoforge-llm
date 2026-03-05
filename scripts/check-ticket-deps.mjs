import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeSync } from 'node:fs';

const TICKETS_DIR = 'tickets';
const ARCHIVE_TICKETS_DIR = join('archive', 'tickets');
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

function archivedTicketFiles(rootDir) {
  return [...collectTicketIndex(rootDir, ARCHIVE_TICKETS_DIR).values()].sort((a, b) => a.localeCompare(b));
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

  for (const reference of extractTicketPathReferences(content)) {
    if (!isExistingFile(rootDir, reference.path)) {
      errors.push(`${ticketPath}:${reference.line}: unresolved ticket reference "${reference.path}"`);
    }
  }

  return errors;
}

function extractTicketPathReferences(content) {
  const references = [];
  const lines = content.split('\n');
  const inlineCodePath = /`((?:archive\/)?tickets\/[\w./-]+\.md)`/g;
  const markdownLinkPath = /\[[^\]]+\]\(((?:archive\/)?tickets\/[\w./-]+\.md)\)/g;
  const seen = new Set();

  lines.forEach((line, index) => {
    if (line.startsWith('**Deps**:')) {
      return;
    }

    for (const regex of [inlineCodePath, markdownLinkPath]) {
      let match;
      while ((match = regex.exec(line)) !== null) {
        const path = match[1];
        const key = `${index + 1}:${path}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        references.push({ path, line: index + 1 });
      }
      regex.lastIndex = 0;
    }
  });

  return references;
}

function parseOutcomeSection(content) {
  const lines = content.split('\n');
  const headerPattern = /^##\s+Outcome\b/i;
  const nextSectionPattern = /^##\s+/;
  const startIndex = lines.findIndex((line) => headerPattern.test(line));
  if (startIndex === -1) {
    return [];
  }

  const section = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (nextSectionPattern.test(lines[i])) {
      break;
    }
    section.push({ line: i + 1, text: lines[i] });
  }
  return section;
}

const BACKTICK_RE = /`([^`\n]+)`/g;
const POSITIVE_OUTCOME_PATH_HINTS = /\b(changed|change|modified|updated|added|removed|renamed|rewrote|touched|created)\b/i;

function normalizePathToken(token) {
  return token.trim().replace(/[),.;:]+$/g, '');
}

function isRepoPathToken(token) {
  if (token.includes(' ')) {
    return false;
  }
  if (token.startsWith('http://') || token.startsWith('https://')) {
    return false;
  }
  return token.includes('/');
}

function isNegativePathClaim(line, path) {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const noChangesPattern = new RegExp(`\\bno\\b[^\\n]*\`${escapedPath}\`[^\\n]*\\bchange(?:s|d)?\\b`, 'i');
  const unchangedPattern = new RegExp(`\`${escapedPath}\`[^\\n]*\\b(remain(?:ed)?|left|kept)\\b[^\\n]*\\bunchanged\\b`, 'i');
  const unchangedPrefixPattern = new RegExp(`\\bunchanged\\b[^\\n]*\`${escapedPath}\``, 'i');
  return noChangesPattern.test(line) || unchangedPattern.test(line) || unchangedPrefixPattern.test(line);
}

function extractOutcomePathClaims(content) {
  const claims = {
    positive: new Map(),
    negative: new Map(),
  };
  const outcomeLines = parseOutcomeSection(content);
  let inWhatChanged = false;

  for (const entry of outcomeLines) {
    const line = entry.text;
    if (/^\s*-\s+\*\*What actually changed\*\*/i.test(line)) {
      inWhatChanged = true;
      continue;
    }
    if (/^\s*-\s+\*\*/.test(line) && !/^\s*-\s+\*\*What actually changed\*\*/i.test(line)) {
      inWhatChanged = false;
    }

    let match;
    while ((match = BACKTICK_RE.exec(line)) !== null) {
      const path = normalizePathToken(match[1]);
      if (!isRepoPathToken(path)) {
        continue;
      }

      const isNegative = isNegativePathClaim(line, path);
      if (isNegative) {
        claims.negative.set(path, entry.line);
      }
      if (!isNegative && (inWhatChanged || POSITIVE_OUTCOME_PATH_HINTS.test(line))) {
        claims.positive.set(path, entry.line);
      }
    }
    BACKTICK_RE.lastIndex = 0;
  }

  return claims;
}

function validateArchivedOutcomeIntegrity(rootDir, archivedTicketPath) {
  const absolutePath = resolve(rootDir, archivedTicketPath);
  const content = readFileSync(absolutePath, 'utf8');
  const errors = [];
  const claims = extractOutcomePathClaims(content);

  for (const [path, negativeLine] of claims.negative) {
    const positiveLine = claims.positive.get(path);
    if (!positiveLine) {
      continue;
    }
    errors.push(
      `${archivedTicketPath}:${negativeLine}: contradictory Outcome claim for "${path}" (conflicts with changed-path claim at line ${positiveLine})`,
    );
  }

  return errors;
}

function main() {
  const rootDir = process.cwd();
  const ticketIndex = new Map([
    ...collectTicketIndex(rootDir, 'tickets'),
    ...collectTicketIndex(rootDir, ARCHIVE_TICKETS_DIR),
  ]);
  const errors = [];
  const activeTicketPaths = ticketFiles(rootDir);
  const archivedTicketPaths = archivedTicketFiles(rootDir);

  for (const ticketPath of activeTicketPaths) {
    errors.push(...validateTicket(rootDir, ticketPath, ticketIndex));
  }
  for (const archivedTicketPath of archivedTicketPaths) {
    errors.push(...validateArchivedOutcomeIntegrity(rootDir, archivedTicketPath));
  }

  if (errors.length > 0) {
    fail(['Ticket dependency integrity check failed:', ...errors].join('\n'));
  }

  writeSync(
    1,
    `Ticket dependency integrity check passed for ${activeTicketPaths.length} active tickets and ${archivedTicketPaths.length} archived tickets.\n`,
  );
}

main();
