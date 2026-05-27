// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef } from '../../../src/cnl/index.js';
import {
  compoundWitnessZoneSelector,
  createAgentPlanCompoundWitnessDoc,
  defaultCompoundWitnessSelectors,
  validCompoundPlanTemplate,
} from '../../architecture/fixtures/agent-plan-compound-witness-fixture.js';
import type { CnlCompilerDiagnosticCode } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(planTemplates: Record<string, unknown>, selectors: Record<string, unknown> = defaultSelectors()): GameSpecDoc {
  return createAgentPlanCompoundWitnessDoc(planTemplates, selectors);
}

function defaultSelectors(): Record<string, unknown> {
  return defaultCompoundWitnessSelectors();
}

function zoneSelector(overrides: Record<string, unknown> = {}): any {
  return compoundWitnessZoneSelector(overrides);
}

function validTemplate(overrides: Record<string, unknown> = {}): any {
  return validCompoundPlanTemplate(overrides);
}

function assertCode(doc: GameSpecDoc, code: CnlCompilerDiagnosticCode, messageMatch?: RegExp): void {
  const result = compileGameSpecToGameDef(doc);
  const diagnostic = result.diagnostics.find((entry) => entry.code === code);
  assert.ok(
    diagnostic,
    `expected ${code}; got ${result.diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('\n')}`,
  );
  if (messageMatch !== undefined) {
    assert.match(diagnostic.message, messageMatch);
  }
}

function diagnosticSnapshot(doc: GameSpecDoc): ReadonlyArray<Pick<ReturnType<typeof compileGameSpecToGameDef>['diagnostics'][number], 'code' | 'message' | 'path'>> {
  return compileGameSpecToGameDef(doc).diagnostics.map(({ code, message, path }) => ({ code, message, path }));
}

function compoundDiagnostics(doc: GameSpecDoc): ReturnType<typeof compileGameSpecToGameDef>['diagnostics'] {
  return compileGameSpecToGameDef(doc).diagnostics.filter(
    (diagnostic) => diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
  );
}

describe('agent plan-template validation diagnostics', () => {
  it('accepts a valid plan template without unknown-library-key diagnostics', () => {
    const result = compileGameSpecToGameDef(createDoc({ trainGovern: validTemplate() }));

    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.equal(result.gameDef?.agents?.library.planTemplates?.trainGovern?.traceLabel, 'train-govern');
  });

  it('reports role selector refs, unbound role constraints, and missing step caps', () => {
    assertCode(
      createDoc({ trainGovern: validTemplate({ roles: { trainSpace: { selector: 'missing', required: true } } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_REF_UNKNOWN,
      /trainGovern.*trainSpace.*missing/u,
    );
    assertCode(
      createDoc({
        trainGovern: validTemplate({
          roles: {
            trainSpace: { selector: 'trainSpace', constraints: [{ notEqual: 'role.futureSpace' }] },
            futureSpace: { selector: 'governSpace' },
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND,
      /trainGovern.*trainSpace.*futureSpace.*not bound/u,
    );
    assertCode(
      createDoc({ trainGovern: validTemplate({ caps: undefined }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CAPS_INVALID,
      /trainGovern.*caps/u,
    );
  });

  it('rejects role constraint kinds without runtime support', () => {
    assertCode(
      createDoc({
        trainGovern: validTemplate({
          roles: {
            trainSpace: { selector: 'trainSpace', required: true },
            governSpace: {
              selector: 'governSpace',
              required: true,
              constraints: [{ unknownKind: 'role.trainSpace' }],
            },
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_UNSUPPORTED,
      /trainGovern.*governSpace.*unknownKind.*no runtime implementation/u,
    );
  });

  it('rejects step matches whose decision path, target kind, or stage index has no declared surface', () => {
    assertCode(
      createDoc({
        trainGovern: validTemplate({
          steps: [{
            label: 'bad-path',
            role: 'trainSpace',
            match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: 'missingTarget', actionTag: 'pass' },
          }],
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STEP_MATCH_INVALID,
      /trainGovern.*trainSpace.*declared decision surface/u,
    );
    assertCode(
      createDoc({
        trainGovern: validTemplate({
          steps: [{
            label: 'bad-kind',
            role: 'trainSpace',
            match: { decisionKind: 'chooseOne', targetKind: 'token', decisionPath: 'operationTarget', actionTag: 'pass' },
          }],
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STEP_MATCH_INVALID,
      /targetKind "token".*selector target kind "zone"/u,
    );
    assertCode(
      createDoc({
        trainGovern: validTemplate({
          steps: [{
            label: 'bad-stage',
            role: 'trainSpace',
            match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: 'operationTarget', actionTag: 'pass', stageIndex: 4 },
          }],
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STEP_MATCH_INVALID,
      /declared decision surface/u,
    );
  });

  it('rejects compound metadata with no grantable special-activity continuation witness', () => {
    assertCode(
      createDoc({
        trainGovern: validTemplate({
          root: {
            actionTags: ['operation'],
            compound: { specialTags: ['missingSpecial'], timing: 'after' },
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
      /trainGovern.*root\.compound.*no authored operation\/special-activity continuation witness/u,
    );
  });

  it('accepts compound special tags that align with special-activity grant vocabulary', () => {
    assert.deepEqual(compoundDiagnostics(createDoc({ trainGovern: validTemplate() })), []);
  });

  it('rejects compound special tags outside the special-activity grant vocabulary', () => {
    const diagnostics = compoundDiagnostics(createDoc({
      trainGovern: validTemplate({
        root: {
          actionTags: ['operation'],
          compound: { specialTags: ['special-activity', 'misspelled-special'], timing: 'after' },
        },
      }),
    }));

    assert.ok(
      diagnostics.some((diagnostic) =>
        diagnostic.path === 'doc.agents.library.planTemplates.trainGovern.root.compound.specialTags.1'
        && diagnostic.message === 'Unknown special tag "misspelled-special" in plan template root.compound — no accompanyingOps entry references this tag.'),
      `expected unknown special tag diagnostic; got ${diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join('\n')}`,
    );
  });

  it('does not run compound vocabulary validation when compound metadata is absent', () => {
    const { compound: _compound, ...rootWithoutCompound } = validTemplate().root;
    void _compound;

    assert.deepEqual(compoundDiagnostics(createDoc({
      trainGovern: validTemplate({ root: rootWithoutCompound }),
    })), []);
  });

  it('reports one compound vocabulary diagnostic per unknown special tag', () => {
    const diagnostics = compoundDiagnostics(createDoc({
      trainGovern: validTemplate({
        root: {
          actionTags: ['operation'],
          compound: { specialTags: ['first-misspelling', 'second-misspelling'], timing: 'after' },
        },
      }),
    })).filter((diagnostic) => diagnostic.message.includes('Unknown special tag'));

    assert.deepEqual(
      diagnostics.map((diagnostic) => [diagnostic.path, diagnostic.message]),
      [
        [
          'doc.agents.library.planTemplates.trainGovern.root.compound.specialTags.0',
          'Unknown special tag "first-misspelling" in plan template root.compound — no accompanyingOps entry references this tag.',
        ],
        [
          'doc.agents.library.planTemplates.trainGovern.root.compound.specialTags.1',
          'Unknown special tag "second-misspelling" in plan template root.compound — no accompanyingOps entry references this tag.',
        ],
      ],
    );
  });

  it('rejects compound interrupt metadata that cannot map to an operation stage', () => {
    assertCode(
      createDoc({
        trainGovern: validTemplate({
          root: {
            actionTags: ['operation'],
            compound: { specialTags: ['special-activity'], timing: 'during', interruptAfterStage: 4 },
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
      /trainGovern.*root\.compound.*no authored operation\/special-activity continuation witness/u,
    );
  });

  it('reports fallback target, fallback cycle, cap class, and stable ordering diagnostics', () => {
    assertCode(
      createDoc({ trainGovern: validTemplate({ fallback: { ifRoleTargetUnavailable: 'missingTemplate' } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_FALLBACK_UNKNOWN,
      /trainGovern.*missingTemplate/u,
    );
    assertCode(
      createDoc({
        trainGovern: validTemplate({ fallback: { ifRoleTargetUnavailable: 'alternate' } }),
        alternate: validTemplate({ fallback: { ifRoleTargetUnavailable: 'trainGovern' } }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_FALLBACK_CYCLE,
      /trainGovern|alternate/u,
    );
    assertCode(
      createDoc({ trainGovern: validTemplate({ caps: { capClass: 'unknown', maxSteps: 2 } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CAPS_INVALID,
      /capClass/u,
    );
    assertCode(
      createDoc(
        { trainGovern: validTemplate() },
        { trainSpace: zoneSelector({ result: { maxItems: 4, order: ['qualityDesc'], onEmpty: 'noContribution' } }), governSpace: zoneSelector() },
      ),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STABLE_TIEBREAKER_REQUIRED,
      /trainGovern.*trainSpace.*stableKey/u,
    );
  });

  it('reports deterministic diagnostics for the same invalid plan template', () => {
    const doc = createDoc({
      trainGovern: validTemplate({
        roles: {
          trainSpace: { selector: 'missing', required: true },
          futureSpace: { selector: 'governSpace', constraints: [{ notEqual: 'role.trainSpace' }] },
        },
        caps: { capClass: 'unknown', maxSteps: 2 },
        fallback: { ifRoleTargetUnavailable: 'missingTemplate' },
      }),
    });

    assert.deepEqual(diagnosticSnapshot(doc), diagnosticSnapshot(doc));
  });
});
