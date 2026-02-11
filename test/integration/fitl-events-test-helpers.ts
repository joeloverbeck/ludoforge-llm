import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';

export interface CompiledFixture {
  readonly markdown: string;
  readonly parsed: ReturnType<typeof parseGameSpec>;
  readonly validatorDiagnostics: ReturnType<typeof validateGameSpec>;
  readonly compiled: ReturnType<typeof compileGameSpecToGameDef>;
}

type FactionRef = number | string;
type EligibilityRef = 'eligible' | 'ineligible';

const stringifyFactionRef = (value: FactionRef): string => String(value);

export const FITL_NO_OVERRIDE = 'none';

export const createEligibilityOverrideDirective = ({
  target,
  eligibility,
  windowId,
}: {
  target: 'self' | FactionRef;
  eligibility: EligibilityRef;
  windowId: string;
}): string => `eligibilityOverride:${target === 'self' ? 'self' : stringifyFactionRef(target)}:${eligibility}:${windowId}`;

export const createFreeOpGrantedDirective = (faction: FactionRef): string => `freeOpGranted:${stringifyFactionRef(faction)}`;

export const compileCompilerFixture = (name: string): CompiledFixture => {
  const markdown = readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');
  const parsed = parseGameSpec(markdown);
  const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

  return {
    markdown,
    parsed,
    validatorDiagnostics,
    compiled,
  };
};
