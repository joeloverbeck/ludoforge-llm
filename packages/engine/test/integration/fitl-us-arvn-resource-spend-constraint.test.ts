import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findDeep } from '../helpers/ast-search-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL US ARVN resource spend constraint wiring', () => {
  it('defines shared us-joint-op-arvn-spend-eligible condition macro', () => {
    const { parsed } = compileProductionSpec();
    const macro = parsed.doc.conditionMacros?.find((entry) => entry.id === 'us-joint-op-arvn-spend-eligible');
    assert.ok(macro, 'Expected us-joint-op-arvn-spend-eligible condition macro');
  });

  it('routes us-op-profile costValidation through shared condition macro', () => {
    const { parsed } = compileProductionSpec();
    const usOp = parsed.doc.actionPipelines?.find((profile) => profile.id === 'us-op-profile');
    assert.ok(usOp, 'Expected us-op-profile');
    const costValidation = usOp.costValidation as
      | { conditionMacro?: string; args?: Record<string, unknown> }
      | null
      | undefined;
    assert.equal(costValidation?.conditionMacro, 'us-joint-op-arvn-spend-eligible');
  });

  it('keeps arvn-op-profile independent from totalEcon joint-operations constraint', () => {
    const { parsed } = compileProductionSpec();
    const arvnOp = parsed.doc.actionPipelines?.find((profile) => profile.id === 'arvn-op-profile');
    assert.ok(arvnOp, 'Expected arvn-op-profile');

    const econRefs = findDeep(arvnOp.costValidation, (node) => node?.ref === 'gvar' && node?.var === 'totalEcon');
    assert.equal(econRefs.length, 0, 'ARVN operation should not reference totalEcon for spend legality');
  });

  it('guards US Train ARVN-cubes branch with strict joint-operations predicate or free operation', () => {
    const { parsed } = compileProductionSpec();
    const trainUs = parsed.doc.actionPipelines?.find((profile) => profile.id === 'train-us-profile');
    assert.ok(trainUs, 'Expected train-us-profile');

    const strictGuards = findDeep(trainUs.stages, (node) =>
      node?.if?.when?.op === 'and' &&
      findDeep(node.if.when.args, (inner) =>
        inner?.op === '==' && inner?.left?.ref === 'binding' && inner?.left?.name === '$baseTrainChoice' && inner?.right === 'arvn-cubes',
      ).length > 0 &&
      findDeep(node.if.when.args, (inner) =>
        inner?.op === 'or' &&
        findDeep(inner.args, (option) => option?.op === '==' && option?.left?.name === '__freeOperation' && option?.right === true).length > 0 &&
        findDeep(inner.args, (option) =>
          option?.conditionMacro === 'us-joint-op-arvn-spend-eligible' &&
          option?.args?.resourceExpr?.ref === 'gvar' &&
          option?.args?.resourceExpr?.var === 'arvnResources' &&
          option?.args?.costExpr === 3,
        ).length > 0,
      ).length > 0,
    );

    assert.ok(strictGuards.length >= 1, 'Expected strict US Train ARVN-cubes spend guard');
  });

  it('guards US Assault ARVN follow-up with strict joint-operations predicate', () => {
    const { parsed } = compileProductionSpec();
    const assaultUs = parsed.doc.actionPipelines?.find((profile) => profile.id === 'assault-us-profile');
    assert.ok(assaultUs, 'Expected assault-us-profile');

    const followupStrictGuard = findDeep(assaultUs.stages, (node) =>
      node?.if?.when?.op === 'or' &&
      findDeep(node.if.when.args, (inner) => inner?.op === '==' && inner?.left?.var === 'mom_bodyCount' && inner?.right === true).length > 0 &&
      findDeep(node.if.when.args, (inner) =>
        inner?.conditionMacro === 'us-joint-op-arvn-spend-eligible' &&
        inner?.args?.resourceExpr?.ref === 'gvar' &&
        inner?.args?.resourceExpr?.var === 'arvnResources' &&
        inner?.args?.costExpr === 3,
      ).length > 0,
    );

    assert.ok(followupStrictGuard.length >= 1, 'Expected strict US Assault ARVN follow-up spend guard');
  });

  it('guards US Pacification spends with strict joint-operations predicates tied to cost amount', () => {
    const { parsed } = compileProductionSpec();
    const trainUs = parsed.doc.actionPipelines?.find((profile) => profile.id === 'train-us-profile');
    assert.ok(trainUs, 'Expected train-us-profile');

    const pacifyStrictGuards = findDeep(trainUs.stages, (node) =>
      node?.if?.when?.conditionMacro === 'us-joint-op-arvn-spend-eligible' &&
      node?.if?.when?.args?.resourceExpr?.ref === 'gvar' &&
      node?.if?.when?.args?.resourceExpr?.var === 'arvnResources',
    );

    assert.ok(
      pacifyStrictGuards.length >= 2,
      'Expected strict US Pacification spend guards before applying terror/support shifts',
    );
  });
});
