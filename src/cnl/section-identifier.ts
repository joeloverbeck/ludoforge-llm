export const CANONICAL_SECTION_KEYS = [
  'metadata',
  'constants',
  'dataAssets',
  'globalVars',
  'perPlayerVars',
  'zones',
  'tokenTypes',
  'setup',
  'turnStructure',
  'turnFlow',
  'operationProfiles',
  'coupPlan',
  'victory',
  'actions',
  'triggers',
  'endConditions',
] as const;

export type CanonicalSectionKey = (typeof CANONICAL_SECTION_KEYS)[number];

export interface ResolvedSection {
  readonly section: CanonicalSectionKey;
  readonly value: unknown;
}

export interface ResolveSectionsResult {
  readonly resolved: readonly ResolvedSection[];
  readonly issue?: {
    readonly code: 'UNKNOWN_EXPLICIT_SECTION' | 'AMBIGUOUS_FALLBACK';
    readonly reason?: 'no-match' | 'multiple-match';
    readonly message: string;
    readonly alternatives?: readonly CanonicalSectionKey[];
  };
}

const CANONICAL_SECTION_SET = new Set<string>(CANONICAL_SECTION_KEYS);
const SETUP_FALLBACK_BLOCKER = new Set<string>(['metadata', 'players', 'id', 'name', 'phase', 'actor']);

export function resolveSectionsFromBlock(rootValue: unknown): ResolveSectionsResult {
  if (!isRecord(rootValue)) {
    return {
      resolved: [],
      issue: {
        code: 'AMBIGUOUS_FALLBACK',
        reason: 'no-match',
        message: 'Unable to identify section for non-mapping YAML block.',
      },
    };
  }

  if (typeof rootValue.section === 'string') {
    const explicitSection = rootValue.section.trim();
    if (!CANONICAL_SECTION_SET.has(explicitSection)) {
      return {
        resolved: [],
        issue: {
          code: 'UNKNOWN_EXPLICIT_SECTION',
          message: `Unknown explicit section "${explicitSection}".`,
          alternatives: CANONICAL_SECTION_KEYS,
        },
      };
    }

    const payload = stripSectionKey(rootValue);
    return {
      resolved: [
        {
          section: explicitSection as CanonicalSectionKey,
          value: payload,
        },
      ],
    };
  }

  const canonicalEntries = Object.entries(rootValue).filter(([key]) => CANONICAL_SECTION_SET.has(key));
  if (canonicalEntries.length > 0) {
    return {
      resolved: canonicalEntries.map(([section, value]) => ({
        section: section as CanonicalSectionKey,
        value,
      })),
    };
  }

  const fallbackMatches = identifyByFingerprint(rootValue);
  if (fallbackMatches.length !== 1) {
    return {
      resolved: [],
      issue:
        fallbackMatches.length > 0
          ? {
              code: 'AMBIGUOUS_FALLBACK',
              reason: 'multiple-match',
              message: `Block content is ambiguous across sections: ${fallbackMatches.join(', ')}.`,
              alternatives: fallbackMatches,
            }
          : {
              code: 'AMBIGUOUS_FALLBACK',
              reason: 'no-match',
              message: 'Unable to infer section from block content.',
            },
    };
  }

  const identifiedSection = fallbackMatches[0];
  if (identifiedSection === undefined) {
    return {
      resolved: [],
      issue: {
        code: 'AMBIGUOUS_FALLBACK',
        reason: 'no-match',
        message: 'Unable to infer section from block content.',
      },
    };
  }

  return {
    resolved: [
      {
        section: identifiedSection,
        value: rootValue,
      },
    ],
  };
}

function identifyByFingerprint(value: Record<string, unknown>): CanonicalSectionKey[] {
  const matches: CanonicalSectionKey[] = [];
  if (isMetadataShape(value)) {
    matches.push('metadata');
  }
  if (isConstantsShape(value)) {
    matches.push('constants');
  }
  if (isDataAssetsShape(value)) {
    matches.push('dataAssets');
  }
  if (isTurnStructureShape(value)) {
    matches.push('turnStructure');
  }
  if (isTurnFlowShape(value)) {
    matches.push('turnFlow');
  }
  if (isOperationProfilesShape(value)) {
    matches.push('operationProfiles');
  }
  if (isCoupPlanShape(value)) {
    matches.push('coupPlan');
  }
  if (isVictoryShape(value)) {
    matches.push('victory');
  }
  if (isGlobalVarsShape(value)) {
    matches.push('globalVars');
    matches.push('perPlayerVars');
  }
  if (isZonesShape(value)) {
    matches.push('zones');
  }
  if (isTokenTypesShape(value)) {
    matches.push('tokenTypes');
  }
  if (isActionsShape(value)) {
    matches.push('actions');
  }
  if (isTriggersShape(value)) {
    matches.push('triggers');
  }
  if (isEndConditionsShape(value)) {
    matches.push('endConditions');
  }
  if (isSetupShape(value)) {
    matches.push('setup');
  }

  return matches;
}

function isMetadataShape(value: Record<string, unknown>): boolean {
  return typeof value.id === 'string' && isRecord(value.players);
}

function isConstantsShape(value: Record<string, unknown>): boolean {
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([, entryValue]) => typeof entryValue === 'number');
}

function isTurnStructureShape(value: Record<string, unknown>): boolean {
  return Array.isArray(value.phases) && typeof value.activePlayerOrder === 'string';
}

function isTurnFlowShape(value: Record<string, unknown>): boolean {
  return (
    isRecord(value.cardLifecycle) &&
    isRecord(value.eligibility) &&
    Array.isArray(value.optionMatrix) &&
    Array.isArray(value.passRewards) &&
    Array.isArray(value.durationWindows)
  );
}

function isDataAssetsShape(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.dataAssets) &&
    value.dataAssets.every(
      (entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.kind === 'string' && 'payload' in entry,
    )
  );
}

function isOperationProfilesShape(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.operationProfiles) &&
    value.operationProfiles.every(
      (entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.actionId === 'string',
    )
  );
}

function isCoupPlanShape(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.phases) &&
    value.phases.every((entry) => isRecord(entry) && typeof entry.id === 'string' && Array.isArray(entry.steps))
  );
}

function isVictoryShape(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.checkpoints) &&
    value.checkpoints.every(
      (entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.faction === 'string',
    )
  );
}

function isGlobalVarsShape(value: Record<string, unknown>): boolean {
  return Array.isArray(value.vars) && value.vars.every((entry) => isRecord(entry) && typeof entry.name === 'string');
}

function isZonesShape(value: Record<string, unknown>): boolean {
  return Array.isArray(value.zones) && value.zones.every((entry) => isRecord(entry) && typeof entry.id === 'string');
}

function isTokenTypesShape(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.tokenTypes) &&
    value.tokenTypes.every((entry) => isRecord(entry) && typeof entry.id === 'string' && isRecord(entry.props))
  );
}

function isActionsShape(value: Record<string, unknown>): boolean {
  return Array.isArray(value.actions) && value.actions.every((entry) => isRecord(entry) && typeof entry.id === 'string');
}

function isTriggersShape(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.triggers) &&
    value.triggers.every((entry) => isRecord(entry) && (entry.effects === undefined || Array.isArray(entry.effects)))
  );
}

function isEndConditionsShape(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.endConditions) &&
    value.endConditions.every((entry) => isRecord(entry) && 'when' in entry && 'result' in entry)
  );
}

function isSetupShape(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.setup)) {
    return false;
  }
  return Object.keys(value).every((key) => !SETUP_FALLBACK_BLOCKER.has(key));
}

function stripSectionKey(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'section') {
      continue;
    }
    next[key] = entry;
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
