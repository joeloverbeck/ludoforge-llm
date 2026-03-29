/**
 * Convert engine IDs to human-readable display names.
 * - kebab-case: 'train-us' -> 'Train Us'
 * - camelCase: 'activePlayer' -> 'Active Player'
 * - snake_case: 'total_support' -> 'Total Support'
 * - Numeric suffixes with colon: 'hand:0' -> 'Hand 0'
 * - Plain numbers: '0' -> '0' (player IDs, left as-is)
 * - $-prefixed binding names: '$targetSpaces' -> 'Target Spaces'
 * - :none suffixes suppressed: 'binh-dinh:none' -> 'Binh Dinh'
 */
export function formatIdAsDisplayName(id: string): string {
  const stripped = stripBindingPrefix(id);
  const lastColonIndex = stripped.lastIndexOf(':');
  const hasSuffix = lastColonIndex >= 0;
  const base = hasSuffix ? stripped.slice(0, lastColonIndex) : stripped;
  const suffix = hasSuffix ? stripped.slice(lastColonIndex + 1) : '';

  const formattedBase = formatSegment(base);
  const formattedSuffix = isNoneSuffix(suffix) ? '' : formatSegment(suffix);

  if (formattedBase.length === 0) {
    return formattedSuffix;
  }

  if (formattedSuffix.length === 0) {
    return formattedBase;
  }

  return `${formattedBase} ${formattedSuffix}`;
}

function stripBindingPrefix(id: string): string {
  if (id.startsWith('$')) {
    return id.slice(1).replace(/^\s+/, '');
  }
  return id;
}

function isNoneSuffix(suffix: string): boolean {
  const trimmed = suffix.trim().toLowerCase();
  return trimmed === 'none';
}

/**
 * Strip `$` prefix from a decision parameter name and return
 * the cleaned name suitable for visual config lookup.
 */
export function stripDecisionParamPrefix(paramName: string): string {
  return stripBindingPrefix(paramName).trim();
}

/**
 * Detect raw AST-path decision parameter names and extract
 * only the last meaningful segment for display.
 *
 * Input like `$_macroPlaceFromAvailableOrMap_actionPipelines_0_stages_1_effects_0_forEach_effects_1_ifThen_0_sourceSpaces`
 * or `$ Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces`
 * → returns `Source Spaces`.
 */
export function humanizeDecisionParamName(paramName: string): string {
  const stripped = stripBindingPrefix(paramName);

  if (isAstPath(stripped)) {
    return formatIdAsDisplayName(extractLastAstSegment(stripped));
  }

  return formatIdAsDisplayName(paramName);
}

const AST_PATH_MARKERS = /\b(Pipelines?|Stages?|Effects?|For\s*Each|If\s*Then|Macro)\b/iu;

function isAstPath(name: string): boolean {
  return AST_PATH_MARKERS.test(name);
}

function extractLastAstSegment(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const astKeywords = new Set([
    'macro', 'action', 'pipelines', 'pipeline', 'stages', 'stage',
    'effects', 'effect', 'foreach', 'for', 'each', 'ifthen', 'if', 'then',
  ]);

  let lastMeaningfulStart = 0;
  for (let i = 0; i < words.length; i++) {
    const lower = words[i]!.toLowerCase();
    if (astKeywords.has(lower) || /^\d+$/.test(lower)) {
      lastMeaningfulStart = i + 1;
    }
  }

  const meaningful = words.slice(lastMeaningfulStart);
  return meaningful.length > 0 ? meaningful.join(' ') : words[words.length - 1] ?? name;
}

function formatSegment(segment: string): string {
  const normalized = segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[:_-]+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return '';
  }

  return normalized
    .split(/\s+/)
    .map((word) => {
      if (/^\d+$/.test(word)) {
        return word;
      }

      if (/^[A-Z0-9]+$/.test(word) && /[A-Z]/.test(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
