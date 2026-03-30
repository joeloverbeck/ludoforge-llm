import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type GameDef, GameDefSchema, validateGameDef } from '../../../src/kernel/index.js';
import { readGameDefFixture } from '../../helpers/gamedef-fixtures.js';

const parseRoundTrip = (def: GameDef): unknown => JSON.parse(JSON.stringify(def));

describe('core-types validation property-style checks', () => {
  it('JSON stringify/parse round-trip preserves Zod validity for valid defs', () => {
    const base = readGameDefFixture('minimal-valid.json');

    const validDefs: GameDef[] = [
      base,
      {
        ...base,
        metadata: { ...base.metadata, id: 'fixture-minimal-2' },
      },
      {
        ...base,
        constants: { bonus: 1 },
      },
      {
        ...base,
        metadata: { ...base.metadata, id: 'fixture-minimal-agents' },
        agents: {
          schemaVersion: 2,
          catalogFingerprint: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          surfaceVisibility: {
            globalVars: {},
            perPlayerVars: {},
            derivedMetrics: {},
            victory: {
              currentMargin: {
                current: 'hidden',
                preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
              },
              currentRank: {
                current: 'hidden',
                preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
              },
            },
          },
          parameterDefs: {},
          candidateParamDefs: {},
          library: {
            stateFeatures: {},
            candidateFeatures: {},
            candidateAggregates: {},
            pruningRules: {},
            scoreTerms: {},
            completionScoreTerms: {},
            tieBreakers: {},
          },
          profiles: {
            baseline: {
              fingerprint: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
              params: {},
              use: {
                pruningRules: [],
                scoreTerms: [],
                completionScoreTerms: [],
                tieBreakers: ['stableMoveKey'],
              },
              plan: {
                stateFeatures: [],
                candidateFeatures: [],
                candidateAggregates: [],
              },
            },
          },
          bindingsBySeat: {
            us: 'baseline',
          },
        },
      },
    ];

    validDefs.forEach((def) => {
      const parsedBefore = GameDefSchema.safeParse(def);
      assert.equal(parsedBefore.success, true);

      const roundTripped = parseRoundTrip(def);
      const parsedAfter = GameDefSchema.safeParse(roundTripped);
      assert.equal(parsedAfter.success, true);
    });
  });

  it('every emitted diagnostic has non-empty code, path, and message', () => {
    const invalidDef = readGameDefFixture('invalid-reference.json');
    const diagnostics = validateGameDef(invalidDef);

    assert.ok(diagnostics.length > 0);

    diagnostics.forEach((diag) => {
      assert.equal(diag.code.trim().length > 0, true);
      assert.equal(diag.path.trim().length > 0, true);
      assert.equal(diag.message.trim().length > 0, true);
    });
  });

  it('validateGameDef output is deterministic for repeated evaluation of same input', () => {
    const invalidDef = readGameDefFixture('invalid-reference.json');
    const first = validateGameDef(invalidDef);

    for (let run = 0; run < 10; run += 1) {
      const next = validateGameDef(invalidDef);
      assert.deepEqual(next, first);
    }
  });

  it('rejects legacy compiled policy string refs after JSON round-trip', () => {
    const base = readGameDefFixture('minimal-valid.json');
    const legacyAgentsDef = {
      ...base,
      metadata: { ...base.metadata, id: 'fixture-minimal-legacy-agents' },
      agents: {
        schemaVersion: 2,
        catalogFingerprint: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        surfaceVisibility: {
          globalVars: {},
          perPlayerVars: {},
          derivedMetrics: {},
          victory: {
            currentMargin: {
              current: 'hidden',
              preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
            },
            currentRank: {
              current: 'hidden',
              preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
            },
          },
        },
        parameterDefs: {},
        candidateParamDefs: {},
        library: {
          stateFeatures: {
            legacy: {
              type: 'number',
              costClass: 'state',
              expr: { ref: 'victory.currentMargin.us' },
              dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
            },
          },
          candidateFeatures: {},
          candidateAggregates: {},
          pruningRules: {},
          scoreTerms: {},
          tieBreakers: {},
        },
        profiles: {},
        bindingsBySeat: {},
      },
    } as const;

    const parsed = GameDefSchema.safeParse(parseRoundTrip(legacyAgentsDef as unknown as GameDef));
    assert.equal(parsed.success, false);
  });
});
