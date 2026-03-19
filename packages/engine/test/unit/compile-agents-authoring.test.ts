import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc, validateGameSpec } from '../../src/cnl/index.js';
import type { GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

function createCompileReadyDoc() {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agents-demo', players: { min: 2, max: 2 } },
    zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'draw',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }] },
  };
}

describe('agents authoring surface', () => {
  it('accepts valid authored agents data without lowering runtime agents yet', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      agents: {
        parameters: {
          passFloor: {
            type: 'number',
            default: 0.25,
            min: -5,
            max: 5,
            tunable: true,
          },
        },
        library: {
          pruningRules: {
            dropPassWhenStrongerMoveExists: {
              when: {
                and: [{ ref: 'candidate.isPass' }, { gt: [{ ref: 'aggregate.bestNonPassProjectedMargin' }, { param: 'passFloor' }] }],
              },
              onEmpty: 'skipRule',
            },
          },
          tieBreakers: {
            stableMoveKey: {
              kind: 'stableMoveKey',
            },
          },
        },
        profiles: {
          baseline: {
            params: {
              passFloor: 0.5,
            },
            use: {
              pruningRules: ['dropPassWhenStrongerMoveExists'],
              scoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.equal(result.gameDef === null, false);
    assert.equal('agents' in (result.gameDef ?? {}), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  });

  it('rejects malformed collection shapes, inline profile logic, and non-map bindings in validation and compile flows', () => {
    const doc = {
      ...createCompileReadyDoc(),
      agents: {
        parameters: [],
        profiles: {
          baseline: {
            params: {},
            pruningRules: [
              {
                when: { ref: 'candidate.isPass' },
              },
            ],
            use: {
              pruningRules: [{ inline: true }],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: ['baseline'],
      },
    } as unknown as GameSpecDoc;

    const validationDiagnostics = validateGameSpec(doc);
    const compileDiagnostics = compileGameSpecToGameDef(doc).diagnostics;

    for (const diagnostics of [validationDiagnostics, compileDiagnostics]) {
      assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_AGENTS_MAP_REQUIRED' && diagnostic.path === 'doc.agents.parameters'));
      assert.ok(
        diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_INLINE_LOGIC_FORBIDDEN' &&
            diagnostic.path === 'doc.agents.profiles.baseline.pruningRules',
        ),
      );
      assert.ok(
        diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_USE_ENTRY_INVALID' &&
            diagnostic.path === 'doc.agents.profiles.baseline.use.pruningRules.0',
        ),
      );
      assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_AGENTS_MAP_REQUIRED' && diagnostic.path === 'doc.agents.bindings'));
    }

    const compiled = compileGameSpecToGameDef(doc);
    assert.equal(compiled.gameDef, null);
  });
});
