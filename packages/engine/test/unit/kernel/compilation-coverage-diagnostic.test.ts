import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId, asZoneId, type GameDef } from '../../../src/kernel/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';
import { reportCompilationCoverage } from './compilation-coverage-diagnostic.js';

const FITL = getFitlProductionFixture();
const COVERAGE = reportCompilationCoverage(FITL.gameDef);

const makeTokenFilterDiagnosticDef = (): GameDef =>
  ({
    metadata: { id: 'compilation-coverage-token-filter', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [{
      id: 'inspect' as GameDef['actions'][number]['id'],
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [{
        name: '$token',
        domain: {
          query: 'tokensInZone',
          zone: 'board:none',
          filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] },
        },
      }],
      pre: { op: '==', left: 1, right: 1 },
      cost: [],
      effects: [],
      limits: [],
    }],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const TOKEN_FILTER_FIXTURE_COVERAGE = reportCompilationCoverage(makeTokenFilterDiagnosticDef());

const percentage = (compiled: number, total: number): string =>
  total === 0 ? '0.0%' : `${((compiled / total) * 100).toFixed(1)}%`;

describe('compilation coverage diagnostic', () => {
  it('reports descriptive FITL compilation coverage without mutating the game definition', () => {
    console.warn(
      [
        'FITL compilation coverage:',
        `conditions=${COVERAGE.conditions.compiled}/${COVERAGE.conditions.total} (${percentage(COVERAGE.conditions.compiled, COVERAGE.conditions.total)})`,
        `values=${COVERAGE.values.compiled}/${COVERAGE.values.total} (${percentage(COVERAGE.values.compiled, COVERAGE.values.total)})`,
        `tokenFilters=${COVERAGE.tokenFilters.compiled}/${COVERAGE.tokenFilters.total} (${percentage(COVERAGE.tokenFilters.compiled, COVERAGE.tokenFilters.total)})`,
      ].join(' '),
    );

    assert.ok(COVERAGE.conditions.total > 0, 'Expected FITL to expose condition AST nodes');
    assert.ok(COVERAGE.values.total > 0, 'Expected FITL to expose value-expression nodes');

    assert.ok(COVERAGE.conditions.compiled > 0, 'Expected compiled condition coverage to be non-zero');
    assert.ok(COVERAGE.values.compiled > 0, 'Expected compiled value-expression coverage to be non-zero');
  });

  it('proves token-filter coverage on a focused deterministic action-domain fixture', () => {
    console.warn(
      [
        'Token-filter diagnostic fixture coverage:',
        `tokenFilters=${TOKEN_FILTER_FIXTURE_COVERAGE.tokenFilters.compiled}/${TOKEN_FILTER_FIXTURE_COVERAGE.tokenFilters.total} (${percentage(TOKEN_FILTER_FIXTURE_COVERAGE.tokenFilters.compiled, TOKEN_FILTER_FIXTURE_COVERAGE.tokenFilters.total)})`,
      ].join(' '),
    );

    assert.ok(
      TOKEN_FILTER_FIXTURE_COVERAGE.tokenFilters.total > 0,
      'Expected focused diagnostic fixture to expose token-filter nodes in action parameter domains',
    );
    assert.ok(
      TOKEN_FILTER_FIXTURE_COVERAGE.tokenFilters.compiled > 0,
      'Expected focused diagnostic fixture to expose compilable token-filter coverage',
    );
  });
});
